/**
 * A small S3 client: Signature V4, path-style addresses (`<endpoint>/<bucket>/<key>`), enough to
 * put, get, list and delete objects on any S3-compatible store (Scaleway, OVH, MinIO, AWS). Bodies
 * are sent unsigned (`UNSIGNED-PAYLOAD`, over https), so a file streams from disk as a Blob. A
 * request S3 could not answer (the network, a 5xx, throttling) is tried again a few times: every
 * call here is idempotent, and a body (a Buffer or a Blob) can be sent twice.
 */
import { createHash, createHmac } from 'node:crypto';

export interface S3Location {
  /** A bare origin: `https://s3.fr-par.scw.cloud`. */
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export interface S3Object {
  readonly key: string;
  readonly size: number;
  readonly lastModified: number;
}

export class S3Error extends Error {
  constructor(
    /** The HTTP status, 0 when S3 could not be reached. */
    readonly status: number,
    /** S3's error code (`NoSuchBucket`, `SignatureDoesNotMatch`...), or `network`. */
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** What went wrong, in the apps' words. */
export function s3Problem(error: unknown): string {
  if (!(error instanceof S3Error)) return 'Stockage S3 injoignable';
  if (error.code === 'network') return 'Stockage S3 injoignable';
  if (error.code === 'NoSuchBucket') return 'Bucket introuvable';
  if (error.code === 'InvalidAccessKeyId' || error.code === 'SignatureDoesNotMatch' || error.status === 401) return 'Clés refusées par S3';
  if (error.code === 'AuthorizationHeaderMalformed' || error.code === 'PermanentRedirect' || error.status === 301) return 'Mauvaise région pour ce bucket';
  if (error.code === 'AccessDenied' || error.status === 403) return 'Accès refusé par S3 : vérifiez les droits de la clé';
  return `S3 a répondu ${error.status}`;
}

const EMPTY_HASH = createHash('sha256').update('').digest('hex');
export const UNSIGNED = 'UNSIGNED-PAYLOAD';

/** RFC 3986, as SigV4 wants: everything but `A-Za-z0-9-_.~` escaped. */
export const uriEncode = (value: string): string => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const encodeKey = (key: string): string => key.split('/').map(uriEncode).join('/');

const hmac = (key: Buffer | string, value: string): Buffer => createHmac('sha256', key).update(value, 'utf8').digest();
const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

export interface SignInput {
  readonly method: string;
  readonly host: string;
  /** Already encoded. */
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  /** Signed as given (names lowercased), besides the host and the x-amz ones added here. */
  readonly headers: Readonly<Record<string, string>>;
  readonly payloadHash: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly now: Date;
}

/** The headers a request needs: the given ones, `x-amz-date`, `x-amz-content-sha256` and `authorization`. */
export function signRequest(input: SignInput): Record<string, string> {
  const amzDate = input.now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.headers)) headers[name.toLowerCase()] = value.trim().replace(/\s+/g, ' ');
  headers.host = input.host;
  headers['x-amz-content-sha256'] = input.payloadHash;
  headers['x-amz-date'] = amzDate;
  const names = Object.keys(headers).sort();
  const query = Object.keys(input.query)
    .sort()
    .map(name => `${uriEncode(name)}=${uriEncode(input.query[name]!)}`)
    .join('&');
  const canonical = [input.method, input.path, query, ...names.map(name => `${name}:${headers[name]}`), '', names.join(';'), input.payloadHash].join('\n');
  const scope = `${day}/${input.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign, 'utf8').digest('hex');
  const { host: _host, ...sent } = headers;
  return { ...sent, authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

const decodeXml = (value: string): string =>
  value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (entity.startsWith('#x') || entity.startsWith('#X')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? '';
  });
const tag = (xml: string, name: string): string | null => {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? decodeXml(match[1]!) : null;
};

/** Waits between tries of a request S3 could not answer: three more tries, about 20 s in all. */
export const S3_RETRY_DELAYS_MS: readonly number[] = [1_000, 4_000, 15_000];

/** Worth trying again: S3 or the way to it failed, not the request. */
const transient = (error: S3Error): boolean =>
  error.status === 0 || error.status === 429 || error.status >= 500 || error.code === 'SlowDown' || error.code === 'RequestTimeout' || error.code === 'InternalError';

const pause = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, ms);
    const aborted = (): void => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    signal?.addEventListener('abort', aborted, { once: true });
  });

export interface S3RequestOptions {
  readonly query?: Readonly<Record<string, string>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: Buffer | Blob;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export class S3Client {
  constructor(
    private readonly location: S3Location,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
    private readonly retryDelays: readonly number[] = S3_RETRY_DELAYS_MS,
  ) {}

  async request(method: string, key: string | null, options: S3RequestOptions = {}): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.once(method, key, options);
      } catch (error) {
        const delay = this.retryDelays[attempt];
        if (!(error instanceof S3Error) || !transient(error) || delay === undefined || options.signal?.aborted) throw error;
        await pause(delay, options.signal);
      }
    }
  }

  private async once(method: string, key: string | null, options: S3RequestOptions): Promise<Response> {
    const base = new URL(this.location.endpoint);
    const path = `${base.pathname.replace(/\/+$/, '')}/${uriEncode(this.location.bucket)}${key === null ? '' : `/${encodeKey(key)}`}`;
    const query = options.query ?? {};
    const headers = signRequest({
      method,
      host: base.host,
      path,
      query,
      headers: options.headers ?? {},
      payloadHash: options.body ? UNSIGNED : EMPTY_HASH,
      region: this.location.region,
      accessKeyId: this.location.accessKeyId,
      secretAccessKey: this.location.secretAccessKey,
      now: this.now(),
    });
    const search = Object.keys(query).length > 0 ? `?${Object.entries(query).map(([name, value]) => `${uriEncode(name)}=${uriEncode(value)}`).join('&')}` : '';
    const signals = [options.signal, options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined].filter((signal): signal is AbortSignal => signal !== undefined);
    let response: Response;
    try {
      response = await this.fetcher(`${base.origin}${path}${search}`, {
        method,
        headers,
        body: options.body ?? null,
        signal: signals.length > 0 ? AbortSignal.any(signals) : undefined,
        redirect: 'manual',
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new S3Error(0, 'network', error instanceof Error ? error.message : 'unreachable');
    }
    if (response.status >= 300) {
      const text = await response.text().catch(() => '');
      throw new S3Error(response.status, tag(text, 'Code') ?? `http-${response.status}`, tag(text, 'Message') ?? `S3 answered ${response.status}`);
    }
    return response;
  }

  async put(key: string, body: Buffer | Blob, contentType: string, signal?: AbortSignal): Promise<void> {
    const response = await this.request('PUT', key, { body, headers: { 'content-type': contentType }, signal });
    await response.body?.cancel();
  }

  /** The object's bytes as a stream, and its size. */
  async get(key: string, signal?: AbortSignal): Promise<{ readonly body: ReadableStream<Uint8Array>; readonly size: number }> {
    const response = await this.request('GET', key, { signal });
    if (!response.body) throw new S3Error(502, 'empty', 'S3 sent no body');
    return { body: response.body, size: Number(response.headers.get('content-length') ?? 0) };
  }

  async delete(key: string): Promise<void> {
    const response = await this.request('DELETE', key, { timeoutMs: 30_000 });
    await response.body?.cancel();
  }

  /** Every object under `prefix`, a thousand per request. */
  async list(prefix: string, limit = Number.POSITIVE_INFINITY): Promise<S3Object[]> {
    const out: S3Object[] = [];
    let token: string | null = null;
    do {
      const query: Record<string, string> = { 'list-type': '2', prefix, 'max-keys': String(Math.min(1000, limit - out.length)) };
      if (token) query['continuation-token'] = token;
      const xml = await (await this.request('GET', null, { query, timeoutMs: 30_000 })).text();
      for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const block = match[1]!;
        const key = tag(block, 'Key');
        if (key === null) continue;
        out.push({ key, size: Number(tag(block, 'Size') ?? 0), lastModified: Date.parse(tag(block, 'LastModified') ?? '') || 0 });
      }
      token = tag(xml, 'IsTruncated') === 'true' ? tag(xml, 'NextContinuationToken') : null;
    } while (token && out.length < limit);
    return out;
  }
}
