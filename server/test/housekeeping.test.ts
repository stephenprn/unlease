import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import { Housekeeping, PURGED_BLOB_DAYS, SNAPSHOTS_KEPT, UNUSED_GRACE_DAYS } from '../src/jobs/housekeeping';
import { createTestServer, jpeg, rec, T0, type TestServer } from './helpers';

const DAY = 86_400_000;
let server: TestServer;
let housekeeping: Housekeeping;

beforeEach(() => {
  server = createTestServer();
  housekeeping = new Housekeeping({ db: server.db, sync: server.sync, records: server.records, blobs: server.blobs, apps: server.apps, now: server.now });
});
afterEach(() => server.close());

describe('emptying the bin', () => {
  it('tombstones notes trashed long enough ago, with their checks, links and photos', async () => {
    const old = T0 - (TRASH_RETENTION_DAYS + 1) * DAY;
    const recent = T0 - 1 * DAY;
    server.sync.push([
      rec('note', 'old', { title: 'Vieille liste', trashedAt: old, deletedAt: null }, old),
      rec('check', 'c1', { noteId: 'old', text: 'Pain', deletedAt: null }, old),
      rec('link', 'k1', { noteId: 'old', url: 'https://a.fr/', status: 'ready', deletedAt: null }, old),
      rec('attachment', 'p1', { noteId: 'old', mime: 'image/jpeg', deletedAt: null }, old),
      rec('check', 'c2', { noteId: 'old', text: 'Déjà supprimée', deletedAt: old }, old),
      rec('note', 'recent', { title: 'Récente', trashedAt: recent, deletedAt: null }, recent),
      rec('check', 'c3', { noteId: 'recent', text: 'Lait', deletedAt: null }, recent),
      rec('note', 'kept', { title: 'Pas à la corbeille', trashedAt: null, deletedAt: null }, old),
    ]);
    const before = server.records.maxSeq();

    const report = await housekeeping.run();
    expect(report.tombstoned).toBe(4);
    for (const [type, id] of [['note', 'old'], ['check', 'c1'], ['link', 'k1'], ['attachment', 'p1']] as const) {
      expect(server.records.get(type, id)!.fields.deletedAt, id).toBe(T0);
    }
    expect(server.records.get('check', 'c2')!.fields.deletedAt).toBe(old);
    expect(server.records.get('note', 'recent')!.fields.deletedAt).toBeNull();
    expect(server.records.get('check', 'c3')!.fields.deletedAt).toBeNull();
    expect(server.records.get('note', 'kept')!.fields.deletedAt).toBeNull();
    expect(server.records.maxSeq()).toBe(before + 4);

    // Devices learn about it through the normal pull.
    expect(server.sync.pull(before).records.map(record => record.id).sort()).toEqual(['c1', 'k1', 'old', 'p1']);
    // Idempotent.
    expect((await housekeeping.run()).tombstoned).toBe(0);
    expect(server.records.maxSeq()).toBe(before + 4);
  });

  it('counts the 7 days from the trashing write’s clock when the device’s date was behind', async () => {
    // A phone a year behind writes an old `trashedAt`; the clock of its write says it happened just now.
    server.sync.push([rec('note', 'n1', { title: 'Projet', trashedAt: T0 - 365 * DAY, deletedAt: null }, T0 - 60_000)]);
    expect((await housekeeping.run()).tombstoned).toBe(0);
  });

  it('leaves a note restored from the bin alone', async () => {
    const old = T0 - 30 * DAY;
    server.sync.push([rec('note', 'n1', { title: 'Sauvée', trashedAt: old, deletedAt: null }, old)]);
    server.sync.push([rec('note', 'n1', { trashedAt: null }, T0 - 1000, 'web001')]);
    expect((await housekeeping.run()).tombstoned).toBe(0);
  });
});

describe('emptying the pages bin', () => {
  it('tombstones a page trashed long enough ago with every block under it, sub-pages included', async () => {
    const old = T0 - (TRASH_RETENTION_DAYS + 1) * DAY;
    server.sync.push([
      rec('block', 'voyage', { kind: 'page', parentId: null, text: 'Voyage', trashedAt: old, deletedAt: null }, old),
      rec('block', 'para', { kind: 'text', parentId: 'voyage', text: 'Lisbonne', deletedAt: null }, old),
      rec('block', 'cols', { kind: 'columns', parentId: 'voyage', deletedAt: null }, old),
      rec('block', 'col', { kind: 'column', parentId: 'cols', deletedAt: null }, old),
      rec('block', 'jour', { kind: 'page', parentId: 'col', text: 'Jour 1', trashedAt: null, deletedAt: null }, old),
      rec('block', 'item', { kind: 'todo', parentId: 'jour', text: 'Tram 28', deletedAt: null }, old),
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
});

describe('collecting blobs', () => {
  async function blob(id: string, createdAt: number) {
    server.time.value = createdAt;
    const data = await jpeg(64, 64);
    await server.blobs.save(
      { id, mime: 'image/jpeg', width: 64, height: 64, bytes: data.length, displayMime: 'image/webp', displayBytes: data.length, source: 'upload' },
      { display: data, original: data },
    );
    server.time.value = T0;
  }

  it('removes old blobs nothing points at, and keeps the rest', async () => {
    const old = T0 - 10 * DAY;
    await blob('photo-live', old);
    await blob('photo-deleted', old);
    await blob('linkimg-live', old);
    await blob('linkimg-gone', old);
    await blob('orphan-old', old);
    await blob('orphan-new', T0 - 2 * DAY);
    await blob('page-file', old);
    await blob('page-file-gone', old);
    server.sync.push([
      rec('block', 'b1', { kind: 'pdf', parentId: 'p1', fileId: 'page-file', deletedAt: null }, old),
      rec('block', 'b2', { kind: 'image', parentId: 'p1', fileId: 'page-file-gone', deletedAt: old }, old),
      rec('attachment', 'photo-live', { noteId: 'n1', mime: 'image/jpeg', deletedAt: null }, old),
      rec('attachment', 'photo-deleted', { noteId: 'n1', mime: 'image/jpeg', deletedAt: old }, old),
      rec('link', 'l1', { noteId: 'n2', url: 'https://a.fr/', imageIds: ['linkimg-live'], deletedAt: null }, old),
      rec('link', 'l2', { noteId: 'n2', url: 'https://b.fr/', imageIds: ['linkimg-gone'], deletedAt: old }, old),
    ]);

    // First seen unused: kept a while longer (a file block cut, then pasted).
    expect((await housekeeping.run()).blobsRemoved).toBe(0);
    server.time.value += (UNUSED_GRACE_DAYS - 1) * DAY;
    expect((await housekeeping.run()).blobsRemoved).toBe(0);
    server.time.value += DAY;
    const report = await housekeeping.run();
    expect(report.blobsRemoved).toBe(4);
    for (const id of ['photo-live', 'linkimg-live', 'orphan-new', 'page-file']) {
      expect(server.blobs.get(id), id).toBeDefined();
      expect(existsSync(server.blobs.path(id, 'display'))).toBe(true);
    }
    for (const id of ['photo-deleted', 'linkimg-gone', 'orphan-old', 'page-file-gone']) {
      expect(server.blobs.get(id), id).toBeUndefined();
      expect(existsSync(server.blobs.path(id, 'display'))).toBe(false);
      expect(existsSync(server.blobs.path(id, 'original'))).toBe(false);
    }
    expect((await housekeeping.run()).blobsRemoved).toBe(0);
  });
});

describe('a note the bin emptied', () => {
  it('keeps its photos a while, for a device that restores it later', async () => {
    const old = T0 - (TRASH_RETENTION_DAYS + 30) * DAY;
    await server.blobs.save({ id: 'ph1', mime: 'image/jpeg', width: 1, height: 1, bytes: 1, displayMime: 'image/jpeg', displayBytes: 1, source: 'upload' }, { display: Buffer.from([1]), original: null });
    server.blobs.idsCreatedBefore(T0); // created "now"; age it
    server.db.prepare("UPDATE blobs SET created_at = ? WHERE id = 'ph1'").run(old);
    server.sync.push([
      rec('note', 'n1', { title: 'Balcon', trashedAt: T0 - (TRASH_RETENTION_DAYS + 1) * DAY, deletedAt: null }, T0 - (TRASH_RETENTION_DAYS + 1) * DAY),
      rec('attachment', 'ph1', { noteId: 'n1', mime: 'image/jpeg', deletedAt: null }, old),
    ]);
    const report = await housekeeping.run();
    expect(report.tombstoned).toBe(2);
    expect(report.blobsRemoved).toBe(0);
    expect(server.blobs.get('ph1')).toBeDefined();
    server.time.value = T0 + (PURGED_BLOB_DAYS + 1) * DAY;
    expect((await housekeeping.run()).blobsRemoved).toBe(0);
    server.time.value += UNUSED_GRACE_DAYS * DAY;
    expect((await housekeeping.run()).blobsRemoved).toBe(1);
  });
});

describe('database snapshots', () => {
  it('give each copy a dataset name of its own, so restoring one makes every device send back what it holds', async () => {
    const daily = new Housekeeping({ db: server.db, sync: server.sync, records: server.records, blobs: server.blobs, apps: server.apps, dataDir: server.dir, now: server.now });
    const { snapshot } = await daily.run();
    const copy = new DatabaseSync(snapshot!);
    const epoch = (copy.prepare("SELECT value FROM meta WHERE key = 'epoch'").get() as { value: string }).value;
    copy.close();
    expect(epoch).toMatch(/^[a-z0-9]{4,32}$/);
    expect(epoch).not.toBe(server.sync.epoch);
  });

  it('writes one consistent copy a day that opens on its own, and keeps the last seven', async () => {
    const daily = new Housekeeping({ db: server.db, sync: server.sync, records: server.records, blobs: server.blobs, apps: server.apps, dataDir: server.dir, now: server.now });
    server.sync.push([rec('note', 'n1', { title: 'Sauvegardée' }, T0 - 1000)]);
    const first = await daily.run();
    expect(first.snapshot).toMatch(/backups\/unlease-2026-10-18\.sqlite$/);
    expect((await daily.run()).snapshot).toBeNull();
    const copy = new DatabaseSync(first.snapshot!);
    expect((copy.prepare("SELECT json_extract(fields, '$.title') AS title FROM records WHERE id = 'n1'").get() as { title: string }).title).toBe('Sauvegardée');
    copy.close();
    for (let day = 1; day <= 9; day += 1) {
      server.time.value = T0 + day * DAY;
      await daily.run();
    }
    const names = readdirSync(join(server.dir, 'backups')).sort();
    expect(names).toHaveLength(SNAPSHOTS_KEPT);
    expect(names[0]).toBe('unlease-2026-10-21.sqlite');
  });
});
