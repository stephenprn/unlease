import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_VERSION } from '@unlease/core/sync/protocol';
import { createApp } from '../src/app';
import { ConfigError, loadConfig } from '../src/config';
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
    expect(await response.json()).toEqual({ ok: true, version: '0.1.0', apiVersion: API_VERSION, apps: ['notes'], analysis: true });
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

describe('the failure brake', () => {
  it('answers 429 after ten failures in a minute from one address, even with the right token', async () => {
    const from = { 'CF-Connecting-IP': '203.0.113.7' };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await sync({ ...from, Authorization: 'Bearer guess' })).status).toBe(401);
    }
    const blocked = await sync({ ...from, ...AUTH });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    // Another address is not affected, nor is the health check.
    expect((await sync({ 'CF-Connecting-IP': '198.51.100.20', ...AUTH })).status).toBe(200);
    expect((await server.app.request('/api/health', { headers: from })).status).toBe(200);
    // A minute later the address may try again.
    server.time.value += 61_000;
    expect((await sync({ ...from, ...AUTH })).status).toBe(200);
  });

  it('identifies the client by CF-Connecting-IP, then X-Real-IP', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) await sync({ 'X-Real-IP': '192.0.2.44', Authorization: 'Bearer nope' });
    expect((await sync({ 'X-Real-IP': '192.0.2.44', ...AUTH })).status).toBe(429);
    expect((await sync({ 'CF-Connecting-IP': '192.0.2.45', 'X-Real-IP': '192.0.2.44', ...AUTH })).status).toBe(200);
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
    });
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
