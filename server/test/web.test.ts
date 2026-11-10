import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HEADERS } from '../src/http/web';
import { AUTH, createTestServer, type TestServer } from './helpers';

let dir: string;
let server: TestServer;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'unlease-web-'));
  // Each app's own build, as `npm run build -w web` makes them, and the root's one file.
  for (const [app, title] of [
    ['notes', 'Carnet'],
    ['pages', 'Pages'],
    ['contacts', 'Contacts'],
    ['agenda', 'Agenda'],
  ] as const) {
    mkdirSync(join(dir, app, 'assets'), { recursive: true });
    writeFileSync(join(dir, app, 'index.html'), `<!doctype html><title>${title}</title>`);
    writeFileSync(join(dir, app, 'assets', 'app-1a2b.js'), 'console.log(1)');
    writeFileSync(join(dir, app, 'sw.js'), 'self.addEventListener("fetch", () => {})');
  }
  writeFileSync(join(dir, 'sw.js'), 'self.registration.unregister()');
  writeFileSync(join(dir, '_headers'), '/*');
  writeFileSync(join(tmpdir(), 'carnet-secret.txt'), 'secret');
  server = createTestServer({ webDir: dir });
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the web apps served beside the API', () => {
  it('serves each app’s page under its own path without a token, with the static host headers', async () => {
    const response = await server.app.request('/notes');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(await response.text()).toContain('<title>Carnet</title>');
    expect(await (await server.app.request('/pages')).text()).toContain('<title>Pages</title>');
  });

  it('sends the policy a static host sends, which lets the apps reach no plain-http or local address', () => {
    const policy = HEADERS['Content-Security-Policy']!;
    const hosted = readFileSync(new URL('../../web/root/_headers', import.meta.url), 'utf8');
    expect(hosted).toContain(`Content-Security-Policy: ${policy}\n`);
    const connect = /connect-src ([^;]+)/.exec(policy)![1]!;
    expect(connect.split(' ')).toEqual(["'self'", 'https:']);
  });

  it('answers an address of an app with that app’s page, for its own router', async () => {
    expect(await (await server.app.request('/notes/note/abc?x=1')).text()).toContain('<title>Carnet</title>');
    expect(await (await server.app.request('/pages/0192-abc')).text()).toContain('<title>Pages</title>');
    expect(await (await server.app.request('/pages/admin/backup')).text()).toContain('<title>Pages</title>');
    expect(await (await server.app.request('/contacts/contact/0192-abc')).text()).toContain('<title>Contacts</title>');
    // Agenda's web app lives at `/agenda`; the published calendar (`/ical/…`) is the API's, never a page.
    expect(await (await server.app.request('/agenda/event/0192-abc')).text()).toContain('<title>Agenda</title>');
    expect((await server.app.request('/agenda/sw.js')).headers.get('service-worker-allowed')).toBe('/agenda');
    expect(await (await server.app.request('/ical/abc.ics')).text()).not.toContain('<title>');
  });

  it('sends / to the first app the server runs', async () => {
    const first = await server.app.request('/?demo=1');
    expect(first.status).toBe(302);
    expect(first.headers.get('location')).toBe('/notes?demo=1');
    server.settings.updateApps(['pages']);
    try {
      expect((await server.app.request('/')).headers.get('location')).toBe('/pages');
    } finally {
      server.settings.updateApps(['notes', 'pages']);
    }
  });

  it('sends an address of the single app before the suite (v0.1) to its place in its app', async () => {
    const page = await server.app.request('/page/abc');
    expect(page.status).toBe(301);
    expect(page.headers.get('location')).toBe('/pages/abc');
    expect((await server.app.request('/note/n1')).headers.get('location')).toBe('/notes/note/n1');
    expect((await server.app.request('/capture/share?url=https%3A%2F%2Fexample.org')).headers.get('location')).toBe('/notes/capture/share?url=https%3A%2F%2Fexample.org');
    expect((await server.app.request('/settings')).headers.get('location')).toBe('/notes/settings');
  });

  it('keeps hashed assets for good, the pages’ workers never, each holding its whole path', async () => {
    const asset = await server.app.request('/pages/assets/app-1a2b.js');
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('text/javascript');
    expect(asset.headers.get('cache-control')).toContain('immutable');
    const worker = await server.app.request('/notes/sw.js');
    expect(worker.headers.get('cache-control')).toBe('no-cache');
    expect(worker.headers.get('service-worker-allowed')).toBe('/notes');
    // The worker of the single app before, there to retire itself.
    const retired = await server.app.request('/sw.js');
    expect(retired.status).toBe(200);
    expect(retired.headers.get('cache-control')).toBe('no-cache');
    // A static host's files are not served.
    expect((await server.app.request('/_headers')).status).not.toBe(200);
  });

  it('answers 404 for a file that is not there, and never leaves its folder', async () => {
    expect((await server.app.request('/notes/assets/old-9z9z.js')).status).toBe(404);
    expect((await server.app.request('/favicon.ico')).status).toBe(404);
    for (const path of ['/notes/..%2f..%2fcarnet-secret.txt', '/notes/assets/..%2f..%2f..%2fcarnet-secret.txt', '/notes/%2e%2e/%2e%2e/carnet-secret.txt', '/..%2fcarnet-secret.txt']) {
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
