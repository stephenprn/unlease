import { afterEach, describe, expect, it } from 'vitest';
import { parseAdminStatus } from '@unlease/core/sync/admin';
import { parseServerSettings } from '@unlease/core/sync/settings';
import { AUTH, createTestServer, type TestServer } from './helpers';
import { seedLibrary } from './seed';

const servers: TestServer[] = [];
function server(): TestServer {
  const created = createTestServer();
  servers.push(created);
  return created;
}
afterEach(() => {
  for (const created of servers.splice(0)) created.close();
});

describe('the administration', () => {
  it('says what the server holds and how its backups, drive and restores stand', async () => {
    const target = server();
    await seedLibrary(target);
    const response = await target.app.request('/api/admin', { headers: AUTH });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const status = parseAdminStatus(await response.json());
    expect(status?.server).toMatchObject({ version: 'test', notes: 1, pages: 2, files: 2 });
    expect(status?.backup).toEqual({ running: false, last: null, lastSuccessAt: null, nextAt: null });
    expect(status?.drive).toMatchObject({ running: false, files: 0, error: null });
    expect(status?.restore).toMatchObject({ running: false, report: null });
  });

  it('refuses a backup or a drive pass before they are set, in French', async () => {
    const target = server();
    const backup = await target.app.request('/api/admin/backups', { method: 'POST', headers: AUTH });
    expect([backup.status, await backup.json()]).toEqual([409, { error: 'Sauvegarde S3 non configurée' }]);
    const list = await target.app.request('/api/admin/backups', { headers: AUTH });
    expect(list.status).toBe(409);
    const drive = await target.app.request('/api/admin/drive/sync', { method: 'POST', headers: AUTH });
    expect([drive.status, await drive.json()]).toEqual([409, { error: 'Seafile n’est pas relié' }]);
  });

  it('needs the token everywhere but the download by ticket', async () => {
    const target = server();
    expect((await target.app.request('/api/admin')).status).toBe(401);
    expect((await target.app.request('/api/admin/restore', { method: 'POST' })).status).toBe(401);
  });

  it('gives the apps the S3 and drive parts of the settings, without secrets', async () => {
    const target = server();
    const settings = parseServerSettings(await (await target.app.request('/api/settings', { headers: AUTH })).json());
    expect(settings?.backup).toMatchObject({ configured: false, secretHint: null, recurrence: 'off', keep: 30 });
    expect(settings?.drive).toEqual({ provider: null, url: '', folder: '/Unlease', library: null, tokenHint: null, leaving: false });
  });
});
