/**
 * HTTP(S) GET for untrusted URLs.
 *
 * Every hop is checked before connecting: the host is resolved, every answer
 * must be a public address, and the connection goes to that checked address
 * (the hostname only travels in the Host header and TLS SNI), so a DNS answer
 * cannot change between the check and the connect. Redirects are followed by
 * hand so each one gets the same check. Bodies stop at a byte limit, measured
 * after decompression.
 */
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import type { Readable } from 'node:stream';
import zlib from 'node:zlib';
import { isPublicAddress } from './address';

export type FetchErrorCode = 'invalid_url' | 'blocked' | 'timeout' | 'aborted' | 'network' | 'redirects';

export class FetchError extends Error {
  constructor(
    readonly code: FetchErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface FetchOptions {
  readonly headers?: Readonly<Record<string, string>>;
  /** A limit, or one chosen from the response's content type. */
  readonly maxBytes: number | ((contentType: string) => number);
  /** For the whole fetch, redirects included. */
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface FetchResult {
  /** After redirects. */
  readonly url: string;
  readonly status: number;
  /** Lowercase names. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Buffer;
  /** True when the body was cut at the limit. */
  readonly truncated: boolean;
}

export interface Fetcher {
  fetch(url: string, options: FetchOptions): Promise<FetchResult>;
}

export type Resolver = (hostname: string) => Promise<string[]>;

export interface TransportRequest {
  readonly url: URL;
  /** The checked IP to connect to. */
  readonly address: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
  readonly maxBytes: FetchOptions['maxBytes'];
}

export interface TransportResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly cookies: readonly string[];
  readonly body: Buffer;
  readonly truncated: boolean;
}

export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

export interface FetcherOptions {
  readonly resolve?: Resolver;
  readonly transport?: Transport;
  readonly isAllowed?: (address: string) => boolean;
  readonly maxRedirects?: number;
}

const DEFAULT_HEADERS = { 'accept-encoding': 'gzip, deflate, br' };
/** Errors that mean "this address did not answer", worth trying the host's next address. */
const CONNECT_ERRORS = new Set(['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL', 'EAFNOSUPPORT']);

const systemResolve: Resolver = async hostname =>
  (await lookup(hostname, { all: true, verbatim: true })).map(entry => entry.address);

function parseHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FetchError('invalid_url', 'not a URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchError('invalid_url', `${url.protocol} is not http(s)`);
  if (url.username || url.password) throw new FetchError('invalid_url', 'credentials in URL');
  return url;
}

function abortError(signal: AbortSignal, deadline: AbortSignal): FetchError {
  return deadline.aborted ? new FetchError('timeout', 'timed out') : new FetchError('aborted', String(signal.reason ?? 'aborted'));
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export function createFetcher(options: FetcherOptions = {}): Fetcher {
  const resolve = options.resolve ?? systemResolve;
  const transport = options.transport ?? nodeTransport;
  const isAllowed = options.isAllowed ?? isPublicAddress;
  const maxRedirects = options.maxRedirects ?? 5;

  async function addressesFor(url: URL, signal: AbortSignal, deadline: AbortSignal): Promise<string[]> {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host)) {
      if (!isAllowed(host)) throw new FetchError('blocked', `${host} is not a public address`);
      return [host];
    }
    let addresses: string[];
    try {
      addresses = await raceAbort(resolve(host), signal);
    } catch {
      if (signal.aborted) throw abortError(signal, deadline);
      throw new FetchError('network', `cannot resolve ${host}`);
    }
    if (addresses.length === 0) throw new FetchError('network', `cannot resolve ${host}`);
    // One private answer is enough to refuse: round-robin DNS must not be a way in.
    const refused = addresses.find(address => !isAllowed(address));
    if (refused) throw new FetchError('blocked', `${host} resolves to ${refused}`);
    // IPv4 first: containers often have no IPv6 route even when the name has an AAAA record.
    return [...addresses].sort((a, b) => isIP(a) - isIP(b));
  }

  return {
    async fetch(input, { headers = {}, maxBytes, timeoutMs, signal: outer }) {
      const deadline = AbortSignal.timeout(timeoutMs);
      const signal = outer ? AbortSignal.any([deadline, outer]) : deadline;
      const cookies = new Map<string, Map<string, string>>();
      let url = parseHttpUrl(input);
      for (let hop = 0; ; hop += 1) {
        const addresses = await addressesFor(url, signal, deadline);
        const jar = cookies.get(url.hostname);
        const hopHeaders = {
          ...DEFAULT_HEADERS,
          ...headers,
          ...(jar && jar.size > 0 ? { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') } : {}),
        };
        let response: TransportResponse | null = null;
        for (const [index, address] of addresses.slice(0, 3).entries()) {
          try {
            response = await transport({ url, address, headers: hopHeaders, signal, maxBytes });
            break;
          } catch (error) {
            if (signal.aborted) throw abortError(signal, deadline);
            const code = (error as { code?: string }).code ?? '';
            if (CONNECT_ERRORS.has(code) && index < Math.min(addresses.length, 3) - 1) continue;
            throw new FetchError('network', (error as Error).message ?? 'connection failed');
          }
        }
        if (!response) throw new FetchError('network', 'no address answered');

        const location = response.headers.location;
        if (response.status >= 300 && response.status < 400 && location) {
          if (hop >= maxRedirects) throw new FetchError('redirects', `more than ${maxRedirects} redirects`);
          // Sites that set a cookie and redirect to themselves loop forever without it.
          for (const line of response.cookies) {
            const pair = line.split(';', 1)[0]!;
            const equals = pair.indexOf('=');
            if (equals <= 0) continue;
            const store = cookies.get(url.hostname) ?? new Map<string, string>();
            store.set(pair.slice(0, equals).trim(), pair.slice(equals + 1).trim());
            cookies.set(url.hostname, store);
          }
          let next: string;
          try {
            next = new URL(location, url).href;
          } catch {
            throw new FetchError('invalid_url', 'bad redirect');
          }
          url = parseHttpUrl(next);
          continue;
        }
        return { url: url.href, status: response.status, headers: response.headers, body: response.body, truncated: response.truncated };
      }
    },
  };
}

function flattenHeaders(raw: http.IncomingHttpHeaders): { headers: Record<string, string>; cookies: string[] } {
  const headers: Record<string, string> = {};
  let cookies: string[] = [];
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (name === 'set-cookie') cookies = Array.isArray(value) ? value : [value];
    else headers[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  return { headers, cookies };
}

function decoder(encoding: string | undefined): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null | undefined {
  switch ((encoding ?? '').trim().toLowerCase()) {
    case '':
    case 'identity':
      return null;
    case 'gzip':
    case 'x-gzip':
      return zlib.createGunzip();
    case 'deflate':
      return zlib.createInflate();
    case 'br':
      return zlib.createBrotliDecompress();
    default:
      return undefined;
  }
}

/** The real network: one GET to a pinned address. */
export const nodeTransport: Transport = ({ url, address, headers, signal, maxBytes }) =>
  new Promise((resolve, reject) => {
    const secure = url.protocol === 'https:';
    const hostIsIp = isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0;
    let settled = false;
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      outcome();
    };
    const request = (secure ? https : http).request({
      host: address,
      family: isIP(address),
      port: url.port ? Number(url.port) : secure ? 443 : 80,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: { ...headers, host: url.host },
      agent: false,
      // SNI and certificate checks use the hostname, not the pinned address.
      ...(secure ? { servername: hostIsIp ? '' : url.hostname } : {}),
    });
    const onAbort = () => {
      request.destroy();
      settle(() => reject(signal.reason));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });

    request.on('error', error => settle(() => reject(error)));
    request.on('response', response => {
      const status = response.statusCode ?? 0;
      const { headers: flat, cookies } = flattenHeaders(response.headers);
      if (status >= 300 && status < 400 && flat.location) {
        response.resume();
        settle(() => resolve({ status, headers: flat, cookies, body: Buffer.alloc(0), truncated: false }));
        request.destroy();
        return;
      }
      const limit = typeof maxBytes === 'function' ? maxBytes(flat['content-type'] ?? '') : maxBytes;
      const unzip = decoder(flat['content-encoding']);
      if (unzip === undefined) {
        request.destroy();
        settle(() => reject(new Error(`unsupported content-encoding ${flat['content-encoding']}`)));
        return;
      }
      const body: Readable = unzip ? response.pipe(unzip) : response;
      if (unzip) response.on('error', error => unzip.destroy(error));
      const chunks: Buffer[] = [];
      let size = 0;
      const finish = (truncated: boolean) =>
        settle(() => resolve({ status, headers: flat, cookies, body: Buffer.concat(chunks), truncated }));
      body.on('data', (chunk: Buffer) => {
        if (settled) return;
        const room = limit - size;
        if (chunk.length > room) {
          if (room > 0) chunks.push(chunk.subarray(0, room));
          finish(true);
          request.destroy();
          return;
        }
        chunks.push(chunk);
        size += chunk.length;
      });
      body.on('end', () => finish(false));
      body.on('error', error => settle(() => reject(error)));
      response.on('close', () => {
        if (!response.complete) settle(() => reject(new Error('connection closed before the end of the response')));
      });
    });
    request.end();
  });
