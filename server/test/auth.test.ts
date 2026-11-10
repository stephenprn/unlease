import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_VERSION } from '@unlease/core/sync/protocol';
import { createApp } from '../src/app';
import { ConfigError, loadConfig, weakTokenWarning } from '../src/config';
import { AuthGuard } from '../src/http/auth';
import { AUTH, createTestServer, TOKEN, type TestServer } from './helpers';

let server: TestServer;
beforeEach(() => {
  server = createTestServer();
});
afterEach(() => server.close());

const sync = (headers: Record<string, string>) =>
  server.app.request('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ node: 'phone1', since: 0 }),
  });

describe('health', () => {
  it('answers without a token', async () => {
    const response = await server.app.request('/api/health');
    expect(response.status).toBe(200);
    // Not the release a caller without the token could look up flaws of: the Administration says it.
    expect(await response.json()).toEqual({ ok: true, apiVersion: API_VERSION, apps: ['notes', 'pages', 'calendar', 'contacts'], setup: false, analysis: true });
  });

  it('says when analysis is off', async () => {
    const keyless = createTestServer({ envApiKey: null });
    expect(await (await keyless.app.request('/api/health')).json()).toMatchObject({ analysis: false });
    keyless.close();
  });
});

describe('the bearer token', () => {
  it('is required everywhere else', async () => {
    for (const path of ['/api/usage', '/api/blobs/abc', '/', '/api/unknown']) {
      const response = await server.app.request(path);
      expect(response.status, path).toBe(401);
      expect(await response.json()).toEqual({ error: 'unauthorized' });
    }
    expect((await sync({})).status).toBe(401);
    expect((await sync({ Authorization: `Bearer ${TOKEN}x` })).status).toBe(401);
    expect((await sync({ Authorization: TOKEN })).status).toBe(401);
    expect((await sync({ Authorization: `Basic ${TOKEN}` })).status).toBe(401);
  });

  it('lets the right token through', async () => {
    expect((await sync(AUTH)).status).toBe(200);
    expect((await sync({ Authorization: `bearer   ${TOKEN}  ` })).status).toBe(200);
    expect((await server.app.request('/api/unknown', { headers: AUTH })).status).toBe(404);
  });
});

/** A request as the Node server hands it over: from a connection with this address. */
const fromSocket = (address: string) => ({ incoming: { socket: { remoteAddress: address, remotePort: 50_000, remoteFamily: 'IPv4' } } });

const syncFrom = (target: TestServer, address: string, headers: Record<string, string>) =>
  target.app.request(
    '/api/sync',
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ node: 'phone1', since: 0 }) },
    fromSocket(address),
  );

describe('the failure brake', () => {
  it('answers 429 to wrong tokens after ten in a minute from one address, never to the right one', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await syncFrom(server, '203.0.113.7', { Authorization: 'Bearer guess' })).status).toBe(401);
    }
    const braked = await syncFrom(server, '203.0.113.7', { Authorization: 'Bearer guess' });
    expect(braked.status).toBe(429);
    expect(Number(braked.headers.get('retry-after'))).toBeGreaterThan(0);
    // The right token still passes from that address: a guesser behind the same proxy locks nobody out.
    expect((await syncFrom(server, '203.0.113.7', AUTH)).status).toBe(200);
    // Another address guesses as before, and the health check answers.
    expect((await syncFrom(server, '198.51.100.20', { Authorization: 'Bearer nope' })).status).toBe(401);
    expect((await server.app.request('/api/health', {}, fromSocket('203.0.113.7'))).status).toBe(200);
    // A minute later the address may guess again.
    server.time.value += 61_000;
    expect((await syncFrom(server, '203.0.113.7', { Authorization: 'Bearer guess' })).status).toBe(401);
  });

  it('takes the address of the connection by default: a forged header changes nothing', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await syncFrom(server, '192.0.2.44', { 'CF-Connecting-IP': `198.51.100.${attempt}`, 'X-Real-IP': `198.51.100.${attempt}`, 'X-Forwarded-For': `198.51.100.${attempt}`, Authorization: 'Bearer nope' });
    }
    expect((await syncFrom(server, '192.0.2.44', { 'CF-Connecting-IP': '198.51.100.99', Authorization: 'Bearer nope' })).status).toBe(429);
    expect((await syncFrom(server, '192.0.2.44', { 'CF-Connecting-IP': '198.51.100.99', ...AUTH })).status).toBe(200);
  });

  it('reads the one header UNLEASE_TRUSTED_PROXY_HEADER names, and only it', async () => {
    const proxied = createTestServer({ trustedProxyHeader: 'cf-connecting-ip' });
    try {
      // Behind the proxy every request comes from its connection; the header tells the clients apart.
      for (let attempt = 0; attempt < 10; attempt += 1) await syncFrom(proxied, '172.18.0.2', { 'CF-Connecting-IP': '203.0.113.7', Authorization: 'Bearer nope' });
      expect((await syncFrom(proxied, '172.18.0.2', { 'CF-Connecting-IP': '203.0.113.7', Authorization: 'Bearer nope' })).status).toBe(429);
      expect((await syncFrom(proxied, '172.18.0.2', { 'CF-Connecting-IP': '203.0.113.8', Authorization: 'Bearer nope' })).status).toBe(401);
      // Another header than the one named is the client's to write: ignored.
      expect((await syncFrom(proxied, '172.18.0.2', { 'CF-Connecting-IP': '203.0.113.7', 'X-Real-IP': '203.0.113.9', Authorization: 'Bearer nope' })).status).toBe(429);
    } finally {
      proxied.close();
    }
  });

  it('takes the last address of X-Forwarded-For, the one the trusted proxy appended', async () => {
    const proxied = createTestServer({ trustedProxyHeader: 'x-forwarded-for' });
    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await syncFrom(proxied, '172.18.0.2', { 'X-Forwarded-For': `10.0.0.${attempt}, 203.0.113.7`, Authorization: 'Bearer nope' });
      }
      expect((await syncFrom(proxied, '172.18.0.2', { 'X-Forwarded-For': '203.0.113.7', Authorization: 'Bearer nope' })).status).toBe(429);
      expect((await syncFrom(proxied, '172.18.0.2', { 'X-Forwarded-For': '203.0.113.7, 203.0.113.8', Authorization: 'Bearer nope' })).status).toBe(401);
      // Without the header (a request that did not come through the proxy), the connection's address.
      expect((await syncFrom(proxied, '192.0.2.1', { Authorization: 'Bearer nope' })).status).toBe(401);
    } finally {
      proxied.close();
    }
  });

  it('brakes unknown download tickets, never a live one', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await server.app.request(`/api/downloads/guess-${attempt}`, {}, fromSocket('203.0.113.50'))).status).toBe(404);
    }
    expect((await server.app.request('/api/downloads/guess-x', {}, fromSocket('203.0.113.50'))).status).toBe(429);
    const ticket = server.admin.issueTicket({ kind: 'full', name: 'unlease-full.tar.gz' });
    const download = await server.app.request(`/api/downloads/${ticket}`, {}, fromSocket('203.0.113.50'));
    expect(download.status).toBe(200);
    await download.arrayBuffer();
  });
});

describe('the guard itself', () => {
  it('remembers a bounded number of addresses, forgetting the least recently failed first', () => {
    const time = { value: 0 };
    const guard = new AuthGuard('right', { now: () => time.value, maxAddresses: 100 });
    for (let index = 0; index < 1000; index += 1) {
      time.value += 1;
      guard.recordFailure({ ip: `10.0.${Math.floor(index / 256)}.${index % 256}`, path: '/api/sync' });
    }
    expect(guard.remembered).toBe(100);
    // The latest are kept; braking an address still works.
    for (let attempt = 0; attempt < 10; attempt += 1) guard.recordFailure({ ip: '203.0.113.7', path: '/api/sync' });
    expect(guard.isLimited('203.0.113.7')).toBe(true);
    expect(guard.remembered).toBeLessThanOrEqual(100);
  });

  it('logs the first wrong token of an address and its brake, then only counts', () => {
    const time = { value: 0 };
    const lines: { message: string; fields: Record<string, unknown> }[] = [];
    const guard = new AuthGuard('right', { now: () => time.value, warn: (message, fields) => lines.push({ message, fields }) });
    for (let attempt = 0; attempt < 10; attempt += 1) guard.recordFailure({ ip: '203.0.113.7', path: '/api/sync' });
    for (let attempt = 0; attempt < 50; attempt += 1) guard.recordLimited();
    expect(lines.map(line => line.message)).toEqual([
      'rejected a request without a valid token',
      'too many wrong tokens from one address: its guesses are answered 429 for a while',
    ]);
    // A minute on, what was only counted is said in one line.
    time.value += 61_000;
    guard.recordFailure({ ip: '203.0.113.7', path: '/api/sync' });
    expect(lines[2]).toEqual({ message: 'wrong tokens refused without a line of their own', fields: { refused: 58, inSeconds: 61 } });
    expect(lines[3]?.message).toBe('rejected a request without a valid token');
  });

  it('writes at most a few dozen lines a minute, however many addresses guess', () => {
    const time = { value: 0 };
    const lines: string[] = [];
    const guard = new AuthGuard('right', { now: () => time.value, warn: message => lines.push(message) });
    for (let index = 0; index < 500; index += 1) guard.recordFailure({ ip: `10.1.${Math.floor(index / 256)}.${index % 256}`, path: '/api/sync' });
    expect(lines.length).toBe(30);
    time.value += 60_000;
    guard.recordFailure({ ip: '10.9.9.9', path: '/api/sync' });
    expect(lines.at(-2)).toBe('wrong tokens refused without a line of their own');
  });
});

describe('CORS', () => {
  const preflight = (origin: string) =>
    server.app.request('/api/sync', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
    });

  it('answers preflights from the configured origins without a token', async () => {
    const response = await preflight('https://carnet.example.fr');
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://carnet.example.fr');
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
    expect(response.headers.get('access-control-allow-methods')).toContain('PUT');
  });

  it('does not allow other origins', async () => {
    const response = await preflight('https://evil.example.com');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    const simple = await server.app.request('/api/usage', { headers: { ...AUTH, Origin: 'https://evil.example.com' } });
    expect(simple.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('labels real responses, errors included, so the web app can read them', async () => {
    const ok = await server.app.request('/api/usage', { headers: { ...AUTH, Origin: 'https://carnet.example.fr' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://carnet.example.fr');
    const denied = await server.app.request('/api/usage', { headers: { Origin: 'https://carnet.example.fr' } });
    expect(denied.status).toBe(401);
    expect(denied.headers.get('access-control-allow-origin')).toBe('https://carnet.example.fr');
  });
});

describe('configuration', () => {
  it('refuses to start without UNLEASE_TOKEN, with a message saying what to do', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ UNLEASE_TOKEN: '   ' })).toThrow(/UNLEASE_TOKEN is required/);
  });

  it('applies the defaults', () => {
    expect(loadConfig({ UNLEASE_TOKEN: 't' })).toEqual({
      token: 't',
      anthropicApiKey: null,
      dataDir: '/data',
      port: 8080,
      corsOrigins: [],
      webDir: null,
      claudeModel: 'claude-opus-5-5',
      claudeEffort: 'low',
      monthlyBudgetUsd: 15,
      analysisConcurrency: 2,
      placesUrl: 'https://photon.komoot.io',
      trustedProxyHeader: null,
    });
  });

  it('trusts the one proxy header it is told to, and no other', () => {
    expect(loadConfig({ UNLEASE_TOKEN: 't', UNLEASE_TRUSTED_PROXY_HEADER: 'CF-Connecting-IP' }).trustedProxyHeader).toBe('cf-connecting-ip');
    expect(loadConfig({ UNLEASE_TOKEN: 't', UNLEASE_TRUSTED_PROXY_HEADER: 'x-real-ip' }).trustedProxyHeader).toBe('x-real-ip');
    expect(loadConfig({ UNLEASE_TOKEN: 't', UNLEASE_TRUSTED_PROXY_HEADER: ' X-Forwarded-For ' }).trustedProxyHeader).toBe('x-forwarded-for');
    expect(loadConfig({ UNLEASE_TOKEN: 't', UNLEASE_TRUSTED_PROXY_HEADER: '' }).trustedProxyHeader).toBeNull();
    expect(() => loadConfig({ UNLEASE_TOKEN: 't', UNLEASE_TRUSTED_PROXY_HEADER: 'forwarded' })).toThrow(/UNLEASE_TRUSTED_PROXY_HEADER must be empty or one of/);
  });

  it('warns about a short token, and still starts', () => {
    expect(weakTokenWarning('short')).toMatch(/UNLEASE_TOKEN has 5 characters: use at least 32/);
    expect(weakTokenWarning('a'.repeat(31))).not.toBeNull();
    expect(weakTokenWarning('a'.repeat(32))).toBeNull();
    expect(loadConfig({ UNLEASE_TOKEN: 'short' }).token).toBe('short');
  });

  it('reads and checks every variable', () => {
    const config = loadConfig({
      UNLEASE_TOKEN: 't',
      ANTHROPIC_API_KEY: 'sk-ant',
      UNLEASE_DATA_DIR: '/srv/unlease',
      PORT: '9000',
      UNLEASE_CORS_ORIGINS: 'https://carnet.example.org, http://localhost:5173/',
      UNLEASE_WEB_DIR: '/app/web',
      UNLEASE_CLAUDE_MODEL: 'claude-haiku-5-5',
      UNLEASE_CLAUDE_EFFORT: 'medium',
      UNLEASE_MONTHLY_BUDGET_USD: '4.5',
      UNLEASE_ANALYSIS_CONCURRENCY: '3',
    });
    expect(config).toMatchObject({
      anthropicApiKey: 'sk-ant',
      dataDir: '/srv/unlease',
      port: 9000,
      corsOrigins: ['https://carnet.example.org', 'http://localhost:5173'],
      webDir: '/app/web',
      claudeModel: 'claude-haiku-5-5',
      claudeEffort: 'medium',
      monthlyBudgetUsd: 4.5,
      analysisConcurrency: 3,
    });
    expect(() => loadConfig({ UNLEASE_TOKEN: 't', PORT: 'http' })).toThrow(/PORT/);
    expect(() => loadConfig({ UNLEASE_TOKEN: 't', UNLEASE_CLAUDE_EFFORT: 'none' })).toThrow(/UNLEASE_CLAUDE_EFFORT/);
    expect(() => loadConfig({ UNLEASE_TOKEN: 't', UNLEASE_CLAUDE_MODEL: 'claude-opus-4-8' })).toThrow(/UNLEASE_CLAUDE_MODEL must be one of/);
    expect(() => loadConfig({ UNLEASE_TOKEN: 't', UNLEASE_MONTHLY_BUDGET_USD: '-1' })).toThrow(/BUDGET/);
    expect(() => loadConfig({ UNLEASE_TOKEN: 't', UNLEASE_CORS_ORIGINS: 'https://a.fr/app' })).toThrow(/bare origin/);
  });
});

describe('shutting down', () => {
  it('refuses requests at once and closes their connections, so devices back off instead of asking again', async () => {
    const stopping = createApp({ config: { token: TOKEN, corsOrigins: [] }, sync: server.sync, blobs: server.blobs, settings: server.settings, stopping: () => true });
    const response = await stopping.request('/api/sync', { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ node: 'phone1', since: 0 }) });
    expect(response.status).toBe(503);
    expect(response.headers.get('connection')).toBe('close');
  });
});
