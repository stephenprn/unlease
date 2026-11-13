import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parsePageVersion, parsePageVersionList, VERSION_QUIET_MS, versionsPath } from '@unlease/pages/sync/versions';
import { AUTH, createTestServer, rec, T0, type TestServer } from './helpers';

const MINUTE = 60_000;
const DAY = 86_400_000;
let server: TestServer;

beforeEach(() => {
  server = createTestServer();
});
afterEach(() => server.close());

const page = (id: string, text: string, wall: number, extra = {}) => rec('block', id, { kind: 'page', parentId: null, position: 'a0', text, trashedAt: null, deletedAt: null, ...extra }, wall);
const text = (id: string, parentId: string, words: string, wall: number, extra = {}) => rec('block', id, { kind: 'text', parentId, position: 'a0', text: words, deletedAt: null, ...extra }, wall);

/** A device's push, and the history's look a moment after (it looks every minute). */
function push(...records: Parameters<TestServer['sync']['push']>[0]): void {
  server.sync.push(records);
  server.pages.versions.tick();
}

/** Time goes on, and the history looks. */
function later(ms: number): void {
  server.time.value += ms;
  server.pages.versions.tick();
}

async function list(pageId: string) {
  const response = await server.app.request(versionsPath(pageId), { headers: AUTH });
  expect(response.status).toBe(200);
  return parsePageVersionList(await response.json())!.versions;
}

describe('a page’s version history', () => {
  it('gives every page a first version, then one each time a page rests after edits', async () => {
    server.sync.push([page('voyage', 'Voyage', T0), text('para', 'voyage', 'Lisbonne', T0), page('autre', 'Autre', T0)]);
    server.pages.versions.tick();
    expect((await list('voyage')).map(version => version.blocks)).toEqual([1]);
    expect(await list('autre')).toHaveLength(1);

    // Edits keep it waiting until the page has rested.
    later(MINUTE);
    push(text('para', 'voyage', 'Lisbonne et Porto', server.now()), text('more', 'voyage', 'Sintra', server.now(), { position: 'a1' }));
    later(MINUTE);
    expect(await list('voyage')).toHaveLength(1);
    later(VERSION_QUIET_MS);
    const versions = await list('voyage');
    expect(versions).toHaveLength(2);
    expect(versions[0]!.change).toEqual({ added: 1, removed: 0, changed: 1 });
    expect(versions[0]!.at).toBe(T0 + MINUTE);
    expect(versions[1]!.change).toBeNull();
    // The other page did not change: no new version.
    expect(await list('autre')).toHaveLength(1);

    const response = await server.app.request(`${versionsPath('voyage')}/${versions[1]!.id}`, { headers: AUTH });
    const first = parsePageVersion(await response.json())!;
    expect(first.blocks.find(block => block.id === 'para')!.fields.text).toBe('Lisbonne');
    expect(first.blocks.some(block => block.id === 'more')).toBe(false);
    expect((await server.app.request(`${versionsPath('autre')}/${versions[1]!.id}`, { headers: AUTH })).status).toBe(404);
  });

  it('writes nothing when a page comes back to its last version, and marks the page a block left', async () => {
    server.sync.push([page('a', 'A', T0), page('b', 'B', T0, { position: 'a1' }), text('para', 'a', 'Mot', T0)]);
    server.pages.versions.tick();
    later(MINUTE);
    push(text('para', 'a', 'Mot changé', server.now()));
    later(MINUTE);
    push(text('para', 'a', 'Mot', server.now()));
    later(VERSION_QUIET_MS + MINUTE);
    expect(await list('a')).toHaveLength(1);

    push(text('para', 'b', 'Mot', server.now()));
    later(VERSION_QUIET_MS + MINUTE);
    expect((await list('a'))[0]!.blocks).toBe(0);
    expect((await list('b'))[0]!.blocks).toBe(1);
  });

  it('keeps every version for a day, then the last of each day, and forgets a page deleted for good', async () => {
    server.sync.push([page('voyage', 'Voyage', T0)]);
    server.pages.versions.tick();
    for (let step = 1; step <= 4; step += 1) {
      later(2 * 60 * MINUTE);
      push(page('voyage', `Voyage ${step}`, server.now()));
      later(VERSION_QUIET_MS);
    }
    expect(await list('voyage')).toHaveLength(5);
    server.time.value += 2 * DAY;
    server.pages.versions.thin();
    // T0 is noon: the five fall on one day, its last kept.
    expect(await list('voyage')).toHaveLength(1);

    server.sync.push([page('voyage', 'Voyage', server.now(), { deletedAt: server.now() })]);
    server.pages.versions.tick();
    expect(await list('voyage')).toHaveLength(0);
  });

  it('keeps the files a version names', async () => {
    server.sync.push([page('voyage', 'Voyage', T0), rec('block', 'photo', { kind: 'image', parentId: 'voyage', position: 'a0', fileId: 'file-lisbonne', deletedAt: null }, T0)]);
    server.pages.versions.tick();
    server.sync.push([rec('block', 'photo', { deletedAt: T0 + 1 }, T0 + 1)]);
    expect(server.pages.filesInUse!(server.records.all(), () => false)).toContain('file-lisbonne');
  });

  it('refuses a malformed address', async () => {
    expect((await server.app.request('/api/pages/x!/versions', { headers: AUTH })).status).toBe(400);
    expect((await server.app.request(`${versionsPath('voyage')}/abc`, { headers: AUTH })).status).toBe(400);
  });
});
