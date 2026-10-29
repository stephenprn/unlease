import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTH, createTestServer, type TestServer } from './helpers';

let dir: string;
let server: TestServer;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'carnet-web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Carnet</title>');
  writeFileSync(join(dir, 'assets', 'app-1a2b.js'), 'console.log(1)');
  writeFileSync(join(dir, 'sw.js'), 'self.addEventListener("fetch", () => {})');
  writeFileSync(join(tmpdir(), 'carnet-secret.txt'), 'secret');
  server = createTestServer({ webDir: dir });
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the web app served beside the API', () => {
  it('serves its page without a token, with the static host headers', async () => {
    const response = await server.app.request('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(await response.text()).toContain('<title>Carnet</title>');
  });

  it('answers an address of the app with its page, for its own router', async () => {
    const response = await server.app.request('/page/abc?x=1');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>Carnet</title>');
  });

  it('keeps hashed assets for good, the service worker never', async () => {
    const asset = await server.app.request('/assets/app-1a2b.js');
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('text/javascript');
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect((await server.app.request('/sw.js')).headers.get('cache-control')).toBe('no-cache');
  });

  it('answers 404 for a file that is not there, and never leaves its folder', async () => {
    expect((await server.app.request('/assets/old-9z9z.js')).status).toBe(404);
    for (const path of ['/..%2fcarnet-secret.txt', '/assets/..%2f..%2fcarnet-secret.txt', '/%2e%2e/carnet-secret.txt']) {
      const response = await server.app.request(path);
      expect(await response.text(), path).not.toContain('secret');
    }
  });

  it('leaves the API to the API', async () => {
    expect((await server.app.request('/api/health')).headers.get('content-type')).toContain('application/json');
    expect((await server.app.request('/api/usage')).status).toBe(401);
    expect((await server.app.request('/api/unknown', { headers: AUTH })).status).toBe(404);
    expect((await server.app.request('/', { method: 'POST' })).status).toBe(401);
  });
});
