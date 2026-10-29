import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isPublicAddress } from '../src/apps/notes/analysis/address';
import { createFetcher, FetchError, type Transport, type TransportRequest } from '../src/apps/notes/analysis/fetcher';

const PUBLIC_A = '93.184.215.14';
const PUBLIC_B = '151.101.1.140';

describe('which addresses are public', () => {
  it.each([
    '127.0.0.1',
    '127.255.0.9',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.20',
    '169.254.169.254',
    '100.64.0.1',
    '100.127.255.254',
    '0.0.0.0',
    '224.0.0.251',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fe80::1%eth0',
    'fc00::1',
    'fd12:3456:789a::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '::ffff:a9fe:a9fe',
    '64:ff9b::192.168.0.1',
    '2002:c0a8:0101::1',
    '2001:db8::1',
    '[::1]',
  ])('refuses %s', address => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([PUBLIC_A, PUBLIC_B, '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::6810:84e5', '2a00:1450:4007:80c::200e', '::ffff:93.184.215.14'])(
    'allows %s',
    address => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  it('refuses things that are not IP literals', () => {
    expect(isPublicAddress('localhost')).toBe(false);
    expect(isPublicAddress('example.com')).toBe(false);
  });
});

/** A transport that records where it was asked to connect and answers from a table. */
function scripted(answers: Record<string, { status: number; headers?: Record<string, string>; cookies?: string[]; body?: string }>) {
  const calls: TransportRequest[] = [];
  const transport: Transport = async request => {
    calls.push(request);
    const answer = answers[request.url.href];
    if (!answer) throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    return { status: answer.status, headers: answer.headers ?? {}, cookies: answer.cookies ?? [], body: Buffer.from(answer.body ?? ''), truncated: false };
  };
  return { calls, transport };
}

const dns = (table: Record<string, string[]>) => async (host: string) => {
  const answer = table[host];
  if (!answer) throw new Error(`ENOTFOUND ${host}`);
  return answer;
};

async function failure(promise: Promise<unknown>): Promise<FetchError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof FetchError) return error;
    throw error;
  }
  throw new Error('expected the fetch to fail');
}

const GET = { maxBytes: 1024, timeoutMs: 2000 };

describe('the guarded fetcher', () => {
  it('connects to the checked address and keeps the hostname for Host and SNI', async () => {
    const { calls, transport } = scripted({ 'https://shop.example/p/1': { status: 200, body: 'ok' } });
    const fetcher = createFetcher({ resolve: dns({ 'shop.example': [PUBLIC_A] }), transport });
    const result = await fetcher.fetch('https://shop.example/p/1', GET);
    expect(result.status).toBe(200);
    expect(result.body.toString()).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.address).toBe(PUBLIC_A);
    expect(calls[0]!.url.hostname).toBe('shop.example');
  });

  it('refuses private, loopback and metadata literals without connecting', async () => {
    const { calls, transport } = scripted({});
    const fetcher = createFetcher({ resolve: dns({}), transport });
    for (const url of [
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5:8080/admin',
      'http://[::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:c0a8:101]/',
      'http://0x7f000001/',
      'http://2130706433/',
      'http://0177.0.0.1/',
    ]) {
      expect((await failure(fetcher.fetch(url, GET))).code, url).toBe('blocked');
    }
    expect(calls).toHaveLength(0);
  });

  it('refuses a name that resolves to a private address, even alongside a public one', async () => {
    const { calls, transport } = scripted({});
    const fetcher = createFetcher({
      resolve: dns({ 'intranet.example': ['192.168.1.10'], 'mixed.example': [PUBLIC_A, '10.0.0.7'], 'mapped.example': ['::ffff:127.0.0.1'] }),
      transport,
    });
    expect((await failure(fetcher.fetch('http://intranet.example/', GET))).code).toBe('blocked');
    expect((await failure(fetcher.fetch('http://mixed.example/', GET))).code).toBe('blocked');
    expect((await failure(fetcher.fetch('http://mapped.example/', GET))).code).toBe('blocked');
    expect(calls).toHaveLength(0);
  });

  it('checks every redirect hop', async () => {
    const { calls, transport } = scripted({
      'https://short.example/a': { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } },
      'https://short.example/b': { status: 301, headers: { location: 'http://intranet.example/secret' } },
      'https://short.example/c': { status: 307, headers: { location: 'http://[::ffff:7f00:1]:2375/containers/json' } },
    });
    const fetcher = createFetcher({ resolve: dns({ 'short.example': [PUBLIC_A], 'intranet.example': ['10.10.0.2'] }), transport });
    expect((await failure(fetcher.fetch('https://short.example/a', GET))).code).toBe('blocked');
    expect((await failure(fetcher.fetch('https://short.example/b', GET))).code).toBe('blocked');
    expect((await failure(fetcher.fetch('https://short.example/c', GET))).code).toBe('blocked');
    expect(calls.map(call => call.url.href)).toEqual(['https://short.example/a', 'https://short.example/b', 'https://short.example/c']);
  });

  it('follows at most five redirects, and only to http(s)', async () => {
    const answers: Record<string, { status: number; headers: Record<string, string> }> = {};
    for (let hop = 0; hop < 7; hop += 1) answers[`https://loop.example/${hop}`] = { status: 302, headers: { location: `/${hop + 1}` } };
    answers['https://loop.example/file'] = { status: 302, headers: { location: 'file:///etc/passwd' } };
    const { transport } = scripted(answers);
    const fetcher = createFetcher({ resolve: dns({ 'loop.example': [PUBLIC_A] }), transport });
    expect((await failure(fetcher.fetch('https://loop.example/0', GET))).code).toBe('redirects');
    expect((await failure(fetcher.fetch('https://loop.example/file', GET))).code).toBe('invalid_url');
    expect((await failure(fetcher.fetch('ftp://loop.example/', GET))).code).toBe('invalid_url');
  });

  it('follows a legitimate redirect and carries its cookie to the same host', async () => {
    const { calls, transport } = scripted({
      'https://news.example/article': { status: 302, headers: { location: '/article?consent=1' }, cookies: ['session=abc123; Path=/; HttpOnly'] },
      'https://news.example/article?consent=1': { status: 200, body: '<title>Article</title>' },
    });
    const fetcher = createFetcher({ resolve: dns({ 'news.example': [PUBLIC_B] }), transport });
    const result = await fetcher.fetch('https://news.example/article', GET);
    expect(result.url).toBe('https://news.example/article?consent=1');
    expect(calls[1]!.headers.cookie).toBe('session=abc123');
  });

  it('tries the next address when one refuses the connection, IPv4 first', async () => {
    const seen: string[] = [];
    const transport: Transport = async request => {
      seen.push(request.address);
      if (request.address === PUBLIC_B) throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      return { status: 200, headers: {}, cookies: [], body: Buffer.from('ok'), truncated: false };
    };
    const fetcher = createFetcher({ resolve: dns({ 'dual.example': ['2606:4700::6810:84e5', PUBLIC_B] }), transport });
    expect((await fetcher.fetch('https://dual.example/', GET)).status).toBe(200);
    expect(seen).toEqual([PUBLIC_B, '2606:4700::6810:84e5']);
  });
});

describe('the network transport', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === '/gzip') {
        response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
        response.end(gzipSync('<title>Compressé</title>'));
      } else if (request.url === '/big') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('x'.repeat(50_000));
      } else if (request.url === '/slow') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.write('<title>');
        setTimeout(() => response.end('late</title>'), 2000).unref();
      } else if (request.url === '/echo') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ host: request.headers.host, ua: request.headers['user-agent'] }));
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  it('is refused by the default guard: a link can never reach this machine', async () => {
    expect((await failure(createFetcher().fetch(`${base}/echo`, GET))).code).toBe('blocked');
    const viaName = await failure(createFetcher().fetch(`http://localhost:${new URL(base).port}/echo`, GET));
    expect(viaName.code).toBe('blocked');
  });

  // The remaining tests lift the guard to exercise the real HTTP code against a local server.
  const open = () => createFetcher({ isAllowed: () => true });

  it('decompresses and sends the Host header of the URL', async () => {
    const gz = await open().fetch(`${base}/gzip`, GET);
    expect(gz.body.toString()).toBe('<title>Compressé</title>');
    const echo = await open().fetch(`${base}/echo`, { ...GET, headers: { 'user-agent': 'carnet-test' } });
    expect(JSON.parse(echo.body.toString())).toEqual({ host: new URL(base).host, ua: 'carnet-test' });
  });

  it('stops reading at the byte limit', async () => {
    const result = await open().fetch(`${base}/big`, { maxBytes: 10_000, timeoutMs: 2000 });
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBe(10_000);
    const small = await open().fetch(`${base}/big`, { maxBytes: type => (type.startsWith('text/html') ? 60_000 : 10), timeoutMs: 2000 });
    expect(small.truncated).toBe(false);
  });

  it('gives up after the timeout', async () => {
    const started = Date.now();
    expect((await failure(open().fetch(`${base}/slow`, { maxBytes: 1024, timeoutMs: 300 }))).code).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(1500);
  });
});
