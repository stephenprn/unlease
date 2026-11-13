import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_VERSION } from '@unlease/core/sync/protocol';
import { AUTH, createTestServer, pendingLink, postSync, rec, T0, type TestServer } from './helpers';
import { putSettings } from './seed';

let server: TestServer;
afterEach(() => server.close());

const health = async () => (await (await server.app.request('/api/health')).json()) as Record<string, unknown>;
const get = async (path: string) => {
  const response = await server.app.request(path, { headers: AUTH });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
};
const post = async (path: string, body: unknown) => {
  const response = await server.app.request(path, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
};
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

describe('the apps a server runs', () => {
  it('runs every ready app on a new server, and says which in its health and settings', async () => {
    server = createTestServer();
    expect(await health()).toEqual({ ok: true, apiVersion: API_VERSION, apps: ['notes', 'pages', 'calendar', 'contacts'], setup: false, analysis: true });
    expect((await get('/api/settings')).body.apps).toEqual({ enabled: ['notes', 'pages', 'calendar', 'contacts'] });
  });

  it('keeps the apps it is given, in the suite’s order, and refuses an unknown one or none', async () => {
    server = createTestServer();
    expect((await putSettings(server, { apps: ['pages'] })).body.apps).toEqual({ enabled: ['pages'] });
    expect((await health()).apps).toEqual(['pages']);
    expect((await putSettings(server, { apps: ['pages', 'notes', 'pages'] })).body.apps).toEqual({ enabled: ['notes', 'pages'] });
    expect((await putSettings(server, { apps: ['calendar', 'notes'] })).body.apps).toEqual({ enabled: ['notes', 'calendar'] });
    expect(await putSettings(server, { apps: ['notes', 'agenda'] })).toEqual({ status: 400, body: { error: 'Unknown app, or not available yet' } });
    expect(await putSettings(server, { apps: [] })).toEqual({ status: 400, body: { error: 'Keep at least one app' } });
    expect((await putSettings(server, { apps: 'notes' })).status).toBe(400);
    expect(server.settings.enabledApps()).toEqual(['notes', 'calendar']);
  });

  it('answers 404 on the routes of an app that is off, and the others’ as before', async () => {
    server = createTestServer();
    await putSettings(server, { apps: ['pages'] });
    expect(await post('/api/sort', { task: 'file', links: [], targets: [] })).toEqual({ status: 404, body: { error: 'Carnet n’est pas activé sur ce serveur' } });
    expect((await post('/api/coupons', {})).status).toBe(404);
    // Pages' routes answer, and what the apps share too.
    expect((await post('/api/pages/ask', {})).status).toBe(400);
    expect((await get('/api/usage')).status).toBe(200);
    await putSettings(server, { apps: ['notes'] });
    expect(await post('/api/pages/ask', {})).toEqual({ status: 404, body: { error: 'Pages n’est pas activé sur ce serveur' } });
    expect((await post('/api/sort', {})).status).toBe(400);
    // Still behind the token.
    expect((await server.app.request('/api/pages/ask', { method: 'POST' })).status).toBe(401);
  });

  it('keeps syncing, counting and backing up the records of an app that is off', async () => {
    server = createTestServer();
    await putSettings(server, { apps: ['pages'] });
    const pushed = await postSync(server, { node: 'phone1', since: 0, records: [rec('note', 'n1', { kind: 'text', title: 'Gardée', deletedAt: null }, T0 - 1000)] });
    expect(pushed.status).toBe(200);
    expect(server.records.get('note', 'n1')!.fields.title).toBe('Gardée');
    expect((await postSync(server, { node: 'web001', since: 0 })).body.records.map((r: { id: string }) => r.id)).toContain('n1');
    expect(server.admin.status().server.notes).toBe(1);
    const markdown = server.apps.flatMap(app => app.markdown?.(server.records.all(), { kept: true }) ?? []);
    expect(markdown.some(file => file.path === 'Carnet/Notes/Gardée.md')).toBe(true);
  });

  it('stops the background work of an app turned off, and starts it again when it is back', async () => {
    server = createTestServer();
    const start = vi.spyOn(server.notes, 'start');
    const stop = vi.spyOn(server.notes, 'stop');
    const stored = vi.spyOn(server.notes, 'stored');
    server.runner.start();
    await settle();
    expect(start).toHaveBeenCalledTimes(1);

    await putSettings(server, { apps: ['pages'] });
    await settle();
    expect(stop).toHaveBeenCalledTimes(1);
    // A push while it is off: stored, but Carnet hears nothing of it.
    await postSync(server, { node: 'phone1', since: 0, records: [pendingLink('l1', 'https://example.org/a', T0 - 1000)] });
    expect(server.records.get('link', 'l1')).toBeDefined();
    expect(stored).not.toHaveBeenCalled();

    await putSettings(server, { apps: ['pages', 'notes'] });
    await settle();
    expect(start).toHaveBeenCalledTimes(2);
    await postSync(server, { node: 'phone1', since: 0, records: [pendingLink('l2', 'https://example.org/b', T0 - 1000)] });
    expect(stored).toHaveBeenCalledTimes(1);
    // The same list again changes nothing.
    await putSettings(server, { apps: ['notes', 'pages'] });
    await settle();
    expect(start).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('the server’s own first run', () => {
  it('is not over on a new server, ends when a device says so, and stays over', async () => {
    server = createTestServer();
    expect((await get('/api/settings')).body.setup).toEqual({ done: false });
    expect((await putSettings(server, { setupDone: false })).status).toBe(400);
    expect((await putSettings(server, { setupDone: true })).body.setup).toEqual({ done: true });
    expect((await health()).setup).toBe(true);
    // Another patch, a restore, a start: it stays over.
    await putSettings(server, { apps: ['notes'] });
    server.sync.restore([rec('note', 'n1', { title: 'Restaurée' }, T0 - 1000)], 'rollback');
    server.settings.settleSetup(false);
    expect(server.settings.setupDone()).toBe(true);
  });

  it('is over on a server that held data before the flag existed, and not on one that started empty', async () => {
    server = createTestServer();
    // A server from before the flag: data, and nothing stored about its first run.
    await postSync(server, { node: 'phone1', since: 0, records: [rec('note', 'n1', { kind: 'text', title: 'Ancienne', deletedAt: null }, T0 - 1000)] });
    server.db.prepare("DELETE FROM settings WHERE key = 'setup.done'").run();
    server.settings.settleSetup(!server.records.holdsNothing());
    expect(server.settings.setupDone()).toBe(true);

    // A new server stores its « not yet » at once: data a device sends before the first run ends does not count as an old server's.
    const fresh = createTestServer();
    await postSync(fresh, { node: 'phone1', since: 0, records: [rec('note', 'n1', { kind: 'text', title: 'Pendant', deletedAt: null }, T0 - 1000)] });
    fresh.settings.settleSetup(!fresh.records.holdsNothing());
    expect(fresh.settings.setupDone()).toBe(false);
    fresh.close();
  });
});
