import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import { Housekeeping } from '../src/jobs/housekeeping';
import { createTestServer, rec, T0, type TestServer } from './helpers';
import { putSettings } from './seed';

const DAY = 86_400_000;
const OLD = T0 - (TRASH_RETENTION_DAYS + 1) * DAY;
let server: TestServer;
let housekeeping: Housekeeping;

beforeEach(() => {
  server = createTestServer();
  housekeeping = new Housekeeping({ db: server.db, sync: server.sync, records: server.records, blobs: server.blobs, apps: server.apps, isOn: id => server.runner.isOn(id), now: server.now });
});
afterEach(() => server.close());

describe('emptying the pages bin', () => {
  it('tombstones a page trashed long enough ago with every block under it, sub-pages included', async () => {
    server.sync.push([
      rec('block', 'voyage', { kind: 'page', parentId: null, text: 'Voyage', trashedAt: OLD, deletedAt: null }, OLD),
      rec('block', 'para', { kind: 'text', parentId: 'voyage', text: 'Lisbonne', deletedAt: null }, OLD),
      rec('block', 'cols', { kind: 'columns', parentId: 'voyage', deletedAt: null }, OLD),
      rec('block', 'col', { kind: 'column', parentId: 'cols', deletedAt: null }, OLD),
      rec('block', 'jour', { kind: 'page', parentId: 'col', text: 'Jour 1', trashedAt: null, deletedAt: null }, OLD),
      rec('block', 'item', { kind: 'todo', parentId: 'jour', text: 'Tram 28', deletedAt: null }, OLD),
      rec('block', 'later', { kind: 'page', parentId: 'voyage', text: 'Binned on its own', trashedAt: T0 - DAY, deletedAt: null }, T0 - DAY),
      rec('block', 'recent', { kind: 'page', parentId: null, text: 'Récente', trashedAt: T0 - DAY, deletedAt: null }, T0 - DAY),
      rec('block', 'kept', { kind: 'text', parentId: 'recent', text: 'Reste', deletedAt: null }, T0 - DAY),
    ]);
    const report = await housekeeping.run();
    expect(report.tombstoned).toBe(6);
    for (const id of ['voyage', 'para', 'cols', 'col', 'jour', 'item']) expect(server.records.get('block', id)!.fields.deletedAt, id).toBe(T0);
    expect(server.records.get('block', 'later')!.fields.deletedAt).toBeNull();
    expect(server.records.get('block', 'recent')!.fields.deletedAt).toBeNull();
    expect(server.records.get('block', 'kept')!.fields.deletedAt).toBeNull();
    expect((await housekeeping.run()).tombstoned).toBe(0);
  });

  it('makes a link forget its copy once the page is gone, purged by the bin or deleted for good on a device', async () => {
    server.sync.push([
      rec('link', 'l1', { noteId: 'inbox', url: 'https://example.org/a', status: 'ready', copy: 'copie1', deletedAt: null }, OLD),
      rec('link', 'l2', { noteId: 'inbox', url: 'https://example.org/b', status: 'ready', copy: 'copie2', deletedAt: null }, OLD),
      rec('link', 'l3', { noteId: 'inbox', url: 'https://example.org/c', status: 'ready', copy: 'copie3', deletedAt: null }, OLD),
      rec('block', 'copie1', { kind: 'page', parentId: null, text: 'Copie', trashedAt: OLD, deletedAt: null }, OLD),
      rec('block', 'copie2', { kind: 'page', parentId: null, text: 'Supprimée', trashedAt: T0 - DAY, deletedAt: T0 - 1000 }, T0 - DAY),
      rec('block', 'copie3', { kind: 'page', parentId: null, text: 'Encore là', trashedAt: T0 - DAY, deletedAt: null }, T0 - DAY),
    ]);
    // copie1 tombstoned, then l1 and l2 forget theirs: three records.
    expect((await housekeeping.run()).tombstoned).toBe(3);
    expect(server.records.get('link', 'l1')!.fields.copy).toBeNull();
    expect(server.records.get('link', 'l2')!.fields.copy).toBeNull();
    expect(server.records.get('link', 'l3')!.fields.copy).toBe('copie3');
    expect((await housekeeping.run()).tombstoned).toBe(0);
  });

  it('waits while Pages is off, and empties once it is on again', async () => {
    server.sync.push([rec('block', 'voyage', { kind: 'page', parentId: null, text: 'Voyage', trashedAt: OLD, deletedAt: null }, OLD)]);
    expect((await putSettings(server, { apps: ['notes'] })).status).toBe(200);
    expect((await housekeeping.run()).tombstoned).toBe(0);
    expect(server.records.get('block', 'voyage')!.fields.deletedAt).toBeNull();
    expect((await putSettings(server, { apps: ['notes', 'pages'] })).status).toBe(200);
    expect((await housekeeping.run()).tombstoned).toBe(1);
  });
});
