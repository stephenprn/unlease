import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatHlc, hlcWall } from '@unlease/core/sync/hlc';
import { MAX_PULL, MAX_PUSH, parseSyncRequest, parseSyncResponse, type SyncResponse } from '@unlease/core/sync/protocol';
import { mergeRecord, writeFields, type SyncRecord } from '@unlease/core/sync/record';
import { openDatabase } from '../src/db/database';
import { ServerClock } from '../src/sync/clock';
import { RecordStore } from '../src/sync/records';
import { SyncService } from '../src/sync/service';
import { createTestServer, postSync, rec, T0, type TestServer } from './helpers';

let server: TestServer;
beforeEach(() => {
  server = createTestServer();
});
afterEach(() => server.close());

describe('push and pull', () => {
  it('stores pushed records and answers with every record past the cursor', async () => {
    const first = await postSync(server, {
      node: 'phone1',
      since: 0,
      records: [rec('note', 'n1', { title: 'Courses', kind: 'checklist' }, T0 - 5000), rec('check', 'c1', { noteId: 'n1', text: 'Pain' }, T0 - 5000)],
    });
    expect(first.status).toBe(200);
    expect(first.body.records.map((r: SyncRecord) => r.id)).toEqual(['n1', 'c1']);
    expect(first.body).toMatchObject({ cursor: 2, more: false, serverTime: T0 });
    expect(parseSyncResponse(first.body)?.records).toHaveLength(2);

    const again = await postSync(server, { node: 'phone1', since: 2, records: [] });
    expect(again.body).toMatchObject({ records: [], cursor: 2, more: false });

    const web = await postSync(server, { node: 'web001', since: 0 });
    expect(web.body.records).toHaveLength(2);
    expect(web.body.records[0].fields).toEqual({ title: 'Courses', kind: 'checklist' });
  });

  it('gives each change a new sequence, so a cursor only sees what moved', async () => {
    await postSync(server, { node: 'phone1', since: 0, records: [rec('note', 'n1', { title: 'A' }, T0 - 9000), rec('note', 'n2', { title: 'B' }, T0 - 9000)] });
    const edit = await postSync(server, { node: 'phone1', since: 2, records: [rec('note', 'n1', { title: 'A2' }, T0 - 1000)] });
    expect(edit.body.records.map((r: SyncRecord) => [r.id, r.fields.title])).toEqual([['n1', 'A2']]);
    expect(edit.body.cursor).toBe(3);
    const rows = server.db.prepare('SELECT id, seq FROM records ORDER BY seq').all();
    expect(rows).toEqual([
      { id: 'n2', seq: 2 },
      { id: 'n1', seq: 3 },
    ]);
  });

  it('does not bump the sequence for a page sent twice', async () => {
    const page = { node: 'phone1', since: 0, records: [rec('note', 'n1', { title: 'A' }, T0 - 9000)] };
    await postSync(server, page);
    const replay = await postSync(server, page);
    expect(replay.body.cursor).toBe(1);
    expect(server.records.maxSeq()).toBe(1);
  });

  it('pages answers at MAX_PULL and says there is more', async () => {
    const total = MAX_PULL + 5;
    for (let start = 0; start < total; start += MAX_PUSH) {
      const batch = [];
      for (let i = start; i < Math.min(total, start + MAX_PUSH); i += 1) batch.push(rec('check', `c${i}`, { text: `ligne ${i}` }, T0 - 1000));
      expect((await postSync(server, { node: 'phone1', since: total * 2, records: batch })).status).toBe(200);
    }
    const page1 = await postSync(server, { node: 'web001', since: 0 });
    expect(page1.body.records).toHaveLength(MAX_PULL);
    expect(page1.body).toMatchObject({ more: true, cursor: MAX_PULL });
    const page2 = await postSync(server, { node: 'web001', since: page1.body.cursor });
    expect(page2.body.records).toHaveLength(5);
    expect(page2.body).toMatchObject({ more: false, cursor: total });
  });

  it('starts over from 0 when a cursor is past anything this server handed out (data reset)', async () => {
    await postSync(server, { node: 'phone1', since: 0, records: [rec('note', 'n1', { title: 'A' }, T0 - 9000)] });
    const stale = await postSync(server, { node: 'web001', since: 5000 });
    expect(stale.body.records.map((r: SyncRecord) => r.id)).toEqual(['n1']);
    expect(stale.body.cursor).toBe(1);
  });
});

describe('merging', () => {
  it('converges whatever order two devices sync in', async () => {
    const base = rec('note', 'n1', { title: 'Courses', body: '', pinned: false }, T0 - 60_000, 'phone1');
    await postSync(server, { node: 'phone1', since: 0, records: [base] });
    // Offline, the phone pins it and the web app renames it; then both sync, web first.
    const phone = writeFields(base, { pinned: true }, formatHlc(T0 - 30_000, 0, 'phone1'));
    const web = writeFields(base, { title: 'Courses samedi' }, formatHlc(T0 - 20_000, 0, 'web001'));
    const fromWeb = await postSync(server, { node: 'web001', since: 1, records: [web] });
    const fromPhone = await postSync(server, { node: 'phone1', since: 1, records: [phone] });

    const stored = server.records.get('note', 'n1')!;
    expect(stored.fields).toEqual({ title: 'Courses samedi', body: '', pinned: true });
    // Each device merges what it gets back and lands on the server's copy.
    const webCopy = [...fromWeb.body.records, ...fromPhone.body.records].reduce(
      (acc: SyncRecord, incoming: SyncRecord) => mergeRecord(acc, incoming).record,
      web,
    );
    const phoneCopy = fromPhone.body.records.reduce((acc: SyncRecord, incoming: SyncRecord) => mergeRecord(acc, incoming).record, phone);
    expect(webCopy.fields).toEqual(stored.fields);
    expect(phoneCopy.fields).toEqual(stored.fields);
  });

  it('keeps the later edit of the same field, and ignores an older one sent late', async () => {
    await postSync(server, { node: 'web001', since: 0, records: [rec('note', 'n1', { title: 'Nouveau' }, T0 - 1000, 'web001')] });
    const late = await postSync(server, { node: 'phone1', since: 1, records: [rec('note', 'n1', { title: 'Ancien' }, T0 - 50_000, 'phone1')] });
    expect(late.body.records).toEqual([]);
    expect(server.records.get('note', 'n1')!.fields.title).toBe('Nouveau');
  });
});

describe('what the server refuses', () => {
  it('drops fields that fail the schema, one by one, and keeps the rest', async () => {
    const clock = formatHlc(T0 - 1000, 0, 'phone1');
    const response = await postSync(server, {
      node: 'phone1',
      since: 0,
      records: [
        {
          type: 'note',
          id: 'n1',
          // Any well-formed colour key passes (a newer client's gradient); a malformed one does not.
          fields: { title: 'ok', pinned: 'yes', color: '#00ff00', hack: 1 },
          clocks: { title: clock, pinned: clock, color: clock, hack: clock },
        },
        { type: 'note', id: 'n2', fields: { title: 'mauvaise horloge' }, clocks: { title: 'not-a-clock' } },
        { type: 'virus', id: 'v1', fields: { x: 1 }, clocks: { x: clock } },
        { type: 'note', id: '../../etc/passwd', fields: { title: 'x' }, clocks: { title: clock } },
      ],
    });
    expect(response.status).toBe(200);
    expect(response.body.records).toHaveLength(1);
    expect(server.records.get('note', 'n1')!.fields).toEqual({ title: 'ok' });
    expect(server.records.get('note', 'n2')).toBeUndefined();
  });

  it('ignores field names that are Object.prototype members instead of failing', async () => {
    const clock = formatHlc(T0 - 1000, 0, 'phone1');
    const body = `{"node":"phone1","since":0,"records":[{"type":"note","id":"n1","fields":{"title":"ok","constructor":"x","__proto__":{"polluted":true},"hasOwnProperty":1},"clocks":{"title":"${clock}","constructor":"${clock}","__proto__":"${clock}","hasOwnProperty":"${clock}"}}]}`;
    const response = await postSync(server, body);
    expect(response.status).toBe(200);
    const stored = server.records.get('note', 'n1')!;
    expect(Object.keys(stored.fields)).toEqual(['title']);
    expect(Object.keys(stored.clocks)).toEqual(['title']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('answers 400 to malformed requests and 413 to oversized ones', async () => {
    expect((await postSync(server, '{not json')).status).toBe(400);
    expect((await postSync(server, { since: 0 })).status).toBe(400);
    expect((await postSync(server, { node: 'phone1', records: 'nope' })).status).toBe(400);
    const tooMany = Array.from({ length: MAX_PUSH + 1 }, (_, i) => rec('check', `c${i}`, { text: 'x' }, T0));
    expect((await postSync(server, { node: 'phone1', records: tooMany })).status).toBe(400);
    const huge = await postSync(server, { node: 'phone1', records: [rec('note', 'n1', { body: 'x'.repeat(4_300_000) }, T0)] });
    expect(huge.status).toBe(413);
  });
});

describe('long polling', () => {
  it('holds an empty answer until another device pushes, then answers at once', async () => {
    const started = Date.now();
    const waiting = postSync(server, { node: 'web001', since: 0, records: [], wait: 10_000 });
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(server.notifier.waiting).toBe(1);
    await postSync(server, { node: 'phone1', since: 0, records: [rec('note', 'n1', { title: 'Hop' }, T0 - 100)] });
    const answer = await waiting;
    expect(answer.body.records.map((r: SyncRecord) => r.id)).toEqual(['n1']);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('answers empty after the wait, and at once when there is something to send', async () => {
    const started = Date.now();
    const empty = await postSync(server, { node: 'web001', since: 0, records: [], wait: 300 });
    expect(empty.body).toMatchObject({ records: [], cursor: 0 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);

    await postSync(server, { node: 'phone1', since: 0, records: [rec('note', 'n1', { title: 'Hop' }, T0 - 100)] });
    const quick = Date.now();
    const full = await postSync(server, { node: 'web001', since: 0, records: [], wait: 10_000 });
    expect(full.body.records).toHaveLength(1);
    expect(Date.now() - quick).toBeLessThan(500);
  });

  it('never holds a request that pushed something', async () => {
    await postSync(server, { node: 'phone1', since: 0, records: [rec('note', 'n1', { title: 'A' }, T0 - 1000)] });
    const started = Date.now();
    // An unchanged re-send: nothing new to return, but it pushed, so it is answered immediately.
    const replay = await postSync(server, { node: 'phone1', since: 1, records: [rec('note', 'n1', { title: 'A' }, T0 - 1000)], wait: 10_000 });
    expect(replay.body.records).toEqual([]);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('wakes on server-side writes too, and releases waiters at shutdown', async () => {
    await postSync(server, { node: 'phone1', since: 0, records: [rec('note', 'n1', { title: 'A' }, T0 - 1000)] });
    const waiting = postSync(server, { node: 'web001', since: 1, wait: 10_000 });
    await new Promise(resolve => setTimeout(resolve, 50));
    server.sync.apply([{ type: 'note', id: 'n1', patch: () => ({ pinned: true }) }]);
    expect((await waiting).body.records[0].fields.pinned).toBe(true);

    const held = postSync(server, { node: 'web001', since: 2, wait: 10_000 });
    await new Promise(resolve => setTimeout(resolve, 50));
    server.notifier.close();
    expect((await held).body.records).toEqual([]);
  });
});

describe('server writes', () => {
  it('sort after the clocks they answer, even from a device whose clock runs ahead', async () => {
    const ahead = T0 + 2 * 3_600_000;
    await postSync(server, { node: 'phone1', since: 0, records: [rec('link', 'l1', { url: 'https://a.fr/', status: 'pending' }, ahead)] });
    const [written] = server.sync.apply([{ type: 'link', id: 'l1', patch: () => ({ status: 'ready', title: 'A' }) }]);
    expect(written!.clocks.status! > formatHlc(ahead, 0, 'phone1')).toBe(true);
    expect(hlcWall(written!.clocks.status!)).toBe(ahead);
    expect(written!.clocks.title).toBe(written!.clocks.status);
    // The unchanged field keeps its old clock.
    expect(written!.clocks.url).toBe(formatHlc(ahead, 0, 'phone1'));
  });

  it('write only what changes and refuse values the schema would reject', () => {
    server.sync.push([rec('note', 'n1', { title: 'A', pinned: false }, T0 - 1000)]);
    expect(server.sync.apply([{ type: 'note', id: 'n1', patch: () => ({ title: 'A' }) }])).toEqual([]);
    expect(server.sync.apply([{ type: 'note', id: 'n1', patch: () => ({ pinned: 'oui' }) }])).toEqual([]);
    expect(server.sync.apply([{ type: 'note', id: 'missing', patch: () => ({ title: 'x' }) }])).toEqual([]);
    expect(server.records.maxSeq()).toBe(1);
  });
});

describe('two edits of the same text', () => {
  const base = { body: 'Ligne 1\nLigne 2' };
  async function seed() {
    await postSync(server, { node: 'phone1', since: 0, records: [rec('note', 'n1', { title: 'Idées', ...base }, T0 - 60_000, 'phone1')] });
  }
  const baseOf = (wall: number) => ({ type: 'note', id: 'n1', fields: base, clocks: { body: formatHlc(wall, 0, 'phone1') } });

  it('are merged when the second push says where its edit began, whichever is newer', async () => {
    await seed();
    await postSync(server, { node: 'web001', since: 1, records: [rec('note', 'n1', { body: 'Ligne 0 du web\nLigne 1\nLigne 2' }, T0 - 20_000, 'web001')] });
    // The phone edited offline earlier than the web: last-writer-wins alone would drop it.
    const late = await postSync(server, {
      node: 'phone1',
      since: 1,
      records: [rec('note', 'n1', { body: 'Ligne 1\nLigne 2\nAjout du téléphone' }, T0 - 30_000, 'phone1')],
      bases: [baseOf(T0 - 60_000)],
    });
    const merged = 'Ligne 0 du web\nLigne 1\nLigne 2\nAjout du téléphone';
    expect(server.records.get('note', 'n1')!.fields.body).toBe(merged);
    // The merge is a server write that outranks both edits, so every device takes it.
    expect(late.body.records.find((r: SyncRecord) => r.id === 'n1').fields.body).toBe(merged);
    expect(server.records.get('note', 'n1')!.clocks.body!.endsWith('srvtest01')).toBe(true);
  });

  it('are not merged when nothing changed since that device’s edit began, nor for an older client without bases', async () => {
    await seed();
    await postSync(server, { node: 'phone1', since: 1, records: [rec('note', 'n1', { body: 'v2' }, T0 - 30_000, 'phone1')], bases: [baseOf(T0 - 60_000)] });
    expect(server.records.get('note', 'n1')!.fields.body).toBe('v2');
    await postSync(server, { node: 'web001', since: 2, records: [rec('note', 'n1', { body: 'v3 du web' }, T0 - 20_000, 'web001')] });
    expect(server.records.get('note', 'n1')!.fields.body).toBe('v3 du web');
  });
});

describe('the dataset epoch', () => {
  it('is named in every answer and kept across a restart of the service', async () => {
    const first = await postSync(server, { node: 'phone1', since: 0 });
    expect(first.body.epoch).toMatch(/^[a-z0-9]{4,32}$/);
    const again = new SyncService({ db: server.db, records: server.records, clock: new ServerClock('srvtest01', server.now), notifier: server.notifier, now: server.now });
    expect(again.epoch).toBe(first.body.epoch);
  });

  it('is renamed when a device of this dataset has seen more than the server holds (a restored backup)', async () => {
    await postSync(server, { node: 'phone1', since: 0, records: [rec('note', 'n1', { title: 'A' }, T0 - 9000)] });
    const { epoch } = (await postSync(server, { node: 'web001', since: 0 })).body;
    // Older clients and a probe with a far cursor do not rename it.
    expect((await postSync(server, { node: 'old001', since: 5000 })).body.epoch).toBe(epoch);
    const stale = await postSync(server, { node: 'phone1', since: 5000, epoch });
    expect(stale.body.epoch).not.toBe(epoch);
    expect(stale.body.records.map((r: SyncRecord) => r.id)).toEqual(['n1']);
    // Another device that knew the old name starts over from zero, whatever its cursor.
    const other = await postSync(server, { node: 'web001', since: 1, epoch });
    expect(other.body).toMatchObject({ epoch: stale.body.epoch, cursor: 1 });
    expect(other.body.records.map((r: SyncRecord) => r.id)).toEqual(['n1']);
  });

  describe('a raw copy of the data folder, restored', () => {
    const runAt = (now: number, db = server.db, records = server.records) => {
      const service = new SyncService({ db, records, clock: new ServerClock('srvtest01', () => now), notifier: server.notifier, now: () => now });
      service.startRun();
      return service;
    };
    const notes = (prefix: string, count: number, node: string) =>
      Array.from({ length: count }, (_, i) => rec('note', `${prefix}${i}`, { title: `${prefix} ${i}` }, T0 - 5_000 + i, node));
    // As a device does: the cursor, the epoch and the server's head and run go back with the next request.
    const after = (answer: SyncResponse) => ({ since: answer.cursor, epoch: answer.epoch, ...(answer.run ? { head: answer.head, run: answer.run } : {}) });
    const ids = (answer: SyncResponse) => answer.records.map(record => record.id).sort();
    const copyTo = (name: string) => {
      const path = join(server.dir, name);
      server.db.exec(`VACUUM INTO '${path}'`);
      return path;
    };

    it('knows the cursor of a device that saw what was lost, even after another device synced first', async () => {
      let service = runAt(T0);
      const tablet = await service.exchange({ node: 'tablet1', since: 0, records: notes('t', 1, 'tablet1') });
      expect(tablet.run).toMatch(/^[a-z0-9]{4,32}$/);
      const copy = copyTo('copie.sqlite');
      // After the copy, phone A writes 5 notes; then the copy is put back and the server started.
      const a = await service.exchange({ node: 'phoneA', ...after(tablet), records: notes('a', 5, 'phoneA') });
      const restored = openDatabase(copy);
      service = runAt(T0 + 60_000, restored, new RecordStore(restored));
      // The tablet, quiet since before the copy, pushes 12 notes first: the sequence numbers A saw are handed out again.
      const first = await service.exchange({ node: 'tablet1', ...after(tablet), records: notes('c', 12, 'tablet1') });
      expect(first.epoch).toBe(tablet.epoch);
      expect(first.cursor).toBeGreaterThan(a.cursor);
      // A's cursor names its run, which this dataset never had past the copy: renamed, and A pulls everything again.
      const back = await service.exchange({ node: 'phoneA', ...after(a), records: [] });
      expect(back.epoch).not.toBe(a.epoch);
      expect(ids(back)).toEqual([...notes('c', 12, 'x'), ...notes('t', 1, 'x')].map(record => record.id).sort());
      restored.close();
    });

    it('knows it after restarts in quick succession, and with the server’s date days behind', async () => {
      let service = runAt(T0);
      const tablet = await service.exchange({ node: 'tablet1', since: 0, records: notes('t', 1, 'tablet1') });
      const copy = copyTo('copie-2.sqlite');
      service = runAt(T0 + 1_000);
      let a = await service.exchange({ node: 'phoneA', ...after(tablet), records: notes('a', 2, 'phoneA') });
      service = runAt(T0 + 2_000);
      a = await service.exchange({ node: 'phoneA', ...after(a), records: notes('b', 3, 'phoneA') });
      const restored = openDatabase(copy);
      service = runAt(T0 - 3 * 86_400_000, restored, new RecordStore(restored));
      await service.exchange({ node: 'tablet1', ...after(tablet), records: notes('c', 12, 'tablet1') });
      expect((await service.exchange({ node: 'phoneA', ...after(a), records: [] })).epoch).not.toBe(a.epoch);
      restored.close();
    });

    it('knows it for a device whose cursor was still paging behind its own notes', async () => {
      let service = runAt(T0);
      for (let k = 0; k < 3; k += 1) await service.exchange({ node: 'tablet1', since: 0, records: notes(`t${k}-`, MAX_PUSH, 'tablet1') });
      const copy = copyTo('copie-3.sqlite');
      // A phone joins with 3 notes: its push is stored, its pull stops after one page.
      const a = await service.exchange({ node: 'phoneA', since: 0, records: notes('a', 3, 'phoneA') });
      expect(a.more).toBe(true);
      expect(a.cursor).toBeLessThan(a.head!);
      const restored = openDatabase(copy);
      service = runAt(T0 + 60_000, restored, new RecordStore(restored));
      // Its cursor is one the copy has; the head it vouches for is not.
      expect((await service.exchange({ node: 'phoneA', ...after(a), records: [] })).epoch).not.toBe(a.epoch);
      restored.close();
    });

    it('leaves cursors alone across an ordinary restart, and keeps old cursors that name no run', async () => {
      const first = await runAt(T0).exchange({ node: 'phone1', since: 0, records: notes('n', 2, 'phone1') });
      const service = runAt(T0 + 60_000);
      const again = await service.exchange({ node: 'phone1', ...after(first), records: [] });
      expect(again).toMatchObject({ epoch: first.epoch, cursor: first.cursor, run: first.run, records: [] });
      await service.exchange({ node: 'web001', ...after(first), records: notes('w', 1, 'web001') });
      const pulled = await service.exchange({ node: 'phone1', ...after(first), records: [] });
      expect(pulled.records.map(record => record.id)).toEqual(['w0']);
      expect(pulled.run).not.toBe(first.run);
      expect((await service.exchange({ node: 'old001', since: first.cursor, epoch: first.epoch, records: [] })).epoch).toBe(first.epoch);
    });

  });
});

describe('protecting the others from one device', () => {
  it('replaces clocks more than a day ahead of what another device says the time is (a phone with the wrong date)', async () => {
    const ahead = T0 + 3 * 86_400_000;
    // The web app long-polls: it says the time is T0.
    await postSync(server, { node: 'web001', since: 0, time: T0 });
    await postSync(server, { node: 'phone1', since: 0, time: ahead, records: [rec('note', 'n1', { title: 'En avance' }, ahead)] });
    const stored = server.records.get('note', 'n1')!;
    expect(stored.fields.title).toBe('En avance');
    expect(hlcWall(stored.clocks.title!)).toBeLessThanOrEqual(T0 + 86_400_000);
    await postSync(server, { node: 'web001', since: 1, records: [rec('note', 'n1', { title: 'Plus tard' }, T0 + 1000, 'web001')] });
    expect(server.records.get('note', 'n1')!.fields.title).toBe('Plus tard');
  });

  it('replaces nothing until another device has said what time it is, and then not below the server’s date', async () => {
    const ahead = T0 + 3 * 86_400_000;
    // Alone since the start: nobody vouches for the time, the clock is kept.
    await postSync(server, { node: 'phone1', since: 0, time: ahead, records: [rec('note', 'n1', { title: 'Seul' }, ahead)] });
    expect(server.records.get('note', 'n1')!.clocks.title).toBe(formatHlc(ahead, 0, 'phone1'));
    // The web spoke this morning (its word moves on with the time since): now the phone is caught.
    await postSync(server, { node: 'web001', since: 0, time: T0 });
    await postSync(server, { node: 'phone1', since: 0, time: ahead, records: [rec('note', 'n2', { title: 'Plus seul' }, ahead + 1)] });
    expect(hlcWall(server.records.get('note', 'n2')!.clocks.title!)).toBeLessThanOrEqual(T0 + 86_400_000);
  });

  it('never lets a device whose date is behind get the right clocks replaced', async () => {
    // A phone three days behind makes one exchange, uncorrected.
    await postSync(server, { node: 'phone1', since: 0, time: T0 - 3 * 86_400_000 });
    await postSync(server, { node: 'web001', since: 0, time: T0, records: [rec('note', 'n1', { title: 'Web' }, T0 - 1000, 'web001')] });
    expect(server.records.get('note', 'n1')!.clocks.title).toBe(formatHlc(T0 - 1000, 0, 'web001'));
  });

  it('keeps the devices’ clocks when it is the server’s own date that is behind', async () => {
    // Running days behind (no battery-backed clock, no time yet); the devices agree on T0.
    server.time.value = T0 - 5 * 86_400_000;
    await postSync(server, { node: 'web001', since: 0, time: T0, records: [rec('note', 'n1', { title: 'Web' }, T0 - 1000, 'web001')] });
    await postSync(server, { node: 'phone1', since: 0, time: T0, records: [rec('note', 'n2', { title: 'Téléphone' }, T0 - 500)] });
    expect(server.records.get('note', 'n1')!.clocks.title).toBe(formatHlc(T0 - 1000, 0, 'web001'));
    expect(server.records.get('note', 'n2')!.clocks.title).toBe(formatHlc(T0 - 500, 0, 'phone1'));
  });

  it('brings back a note the bin emptied when a device restores it afterwards, with what went with it', async () => {
    const trashed = T0 - 8 * 86_400_000;
    server.sync.push([
      rec('note', 'n1', { title: 'À garder', trashedAt: trashed, deletedAt: null }, trashed),
      rec('check', 'c1', { noteId: 'n1', text: 'pain', deletedAt: null }, trashed),
      rec('check', 'c2', { noteId: 'n1', text: 'supprimée avant', deletedAt: trashed }, trashed),
    ]);
    const purge = (note: string) => server.sync.apply([note, 'c1'].map(id => ({ type: id === note ? 'note' : 'check', id, patch: () => ({ deletedAt: T0 }) }) as const));
    purge('n1');
    expect(server.records.get('note', 'n1')!.fields.deletedAt).toBe(T0);
    // The phone, offline for a week, had restored it.
    await postSync(server, { node: 'phone1', since: 0, records: [rec('note', 'n1', { trashedAt: null }, trashed + 86_400_000, 'phone1')] });
    expect(server.records.get('note', 'n1')!.fields).toMatchObject({ trashedAt: null, deletedAt: null, title: 'À garder' });
    expect(server.records.get('check', 'c1')!.fields.deletedAt).toBeNull();
    expect(server.records.get('check', 'c2')!.fields.deletedAt).toBe(trashed);
  });

  it('keeps a note deleted for good by a person deleted, restore or not', async () => {
    server.sync.push([rec('note', 'n1', { title: 'x', trashedAt: T0 - 5000, deletedAt: null }, T0 - 5000)]);
    server.sync.push([rec('note', 'n1', { deletedAt: T0 - 1000, title: '' }, T0 - 1000, 'web001')]);
    await postSync(server, { node: 'phone1', since: 0, records: [rec('note', 'n1', { trashedAt: null }, T0 - 500, 'phone1')] });
    expect(server.records.get('note', 'n1')!.fields.deletedAt).toBe(T0 - 1000);
  });
});

describe('merging, when answers are lost or text comes back', () => {
  const at = (wall: number, node = 'phone1') => formatHlc(wall, 0, node);
  const baseOf = (value: string, wall: number, node = 'phone1') => ({ type: 'note', id: 'n1', fields: { body: value }, clocks: { body: at(wall, node) } });

  it('does not merge a push with that device’s own earlier write whose answer never came', async () => {
    await postSync(server, { node: 'web001', since: 0, records: [rec('note', 'n1', { body: 'Acheter du pain' }, T0 - 60_000, 'web001')] });
    // The phone sends a typo, never hears back, fixes it and sends again from the same base.
    await postSync(server, { node: 'phone1', since: 1, records: [rec('note', 'n1', { body: 'Acheter du pain, du beure' }, T0 - 30_000)], bases: [baseOf('Acheter du pain', T0 - 60_000, 'web001')] });
    await postSync(server, { node: 'phone1', since: 1, records: [rec('note', 'n1', { body: 'Acheter du pain, du beurre' }, T0 - 20_000)], bases: [baseOf('Acheter du pain', T0 - 60_000, 'web001')] });
    expect(server.records.get('note', 'n1')!.fields.body).toBe('Acheter du pain, du beurre');
  });

  it('merges nothing twice when a push whose answer was lost is sent again after the server restarted', async () => {
    await postSync(server, { node: 'web001', since: 0, records: [rec('note', 'n1', { body: 'Appeler Jean lundi' }, T0 - 60_000, 'web001')] });
    await postSync(server, { node: 'web001', since: 1, records: [rec('note', 'n1', { body: 'Appeler Jean lundi matin' }, T0 - 40_000, 'web001')], bases: [baseOf('Appeler Jean lundi', T0 - 60_000, 'web001')] });
    const push = { node: 'phone1', since: 1, records: [rec('note', 'n1', { body: 'Appeler Jean Dupont lundi' }, T0 - 30_000)], bases: [baseOf('Appeler Jean lundi', T0 - 60_000, 'web001')] };
    await postSync(server, push);
    expect(server.records.get('note', 'n1')!.fields.body).toBe('Appeler Jean Dupont lundi matin');
    // The server restarts (what it remembered of merges is gone), and the phone sends the same push again.
    const restarted = new SyncService({ db: server.db, records: server.records, clock: new ServerClock('srvtest01', server.now), notifier: server.notifier, now: server.now });
    await restarted.exchange(parseSyncRequest(push).request!);
    expect(server.records.get('note', 'n1')!.fields.body).toBe('Appeler Jean Dupont lundi matin');
  });

  it('keeps a concurrent edit when the newer write put the base text back', async () => {
    await postSync(server, { node: 'web001', since: 0, records: [rec('note', 'n1', { body: 'un deux trois' }, T0 - 60_000, 'web001')] });
    // On the web a word is typed then deleted again; meanwhile the phone, offline, added one.
    await postSync(server, { node: 'web001', since: 1, records: [rec('note', 'n1', { body: 'un deux trois' }, T0 - 10_000, 'web001')] });
    await postSync(server, { node: 'phone1', since: 1, records: [rec('note', 'n1', { body: 'un deux trois quatre' }, T0 - 30_000)], bases: [baseOf('un deux trois', T0 - 60_000, 'web001')] });
    expect(server.records.get('note', 'n1')!.fields.body).toBe('un deux trois quatre');
  });

  it('merges from what a device sent when the server merged it and the answer was lost', async () => {
    await postSync(server, { node: 'web001', since: 0, records: [rec('note', 'n1', { body: 'Lait' }, T0 - 60_000, 'web001')] });
    await postSync(server, { node: 'web001', since: 1, records: [rec('note', 'n1', { body: 'Lait x2' }, T0 - 40_000, 'web001')], bases: [baseOf('Lait', T0 - 60_000, 'web001')] });
    // The phone's first push is merged with the web's edit; its answer is lost.
    await postSync(server, { node: 'phone1', since: 1, records: [rec('note', 'n1', { body: 'Lait demi' }, T0 - 30_000)], bases: [baseOf('Lait', T0 - 60_000, 'web001')] });
    // The web's edit is the older: it comes first.
    expect(server.records.get('note', 'n1')!.fields.body).toBe('Lait x2 demi');
    // It corrects a word and sends again, from the same old base: merged from what it had sent, nothing twice.
    await postSync(server, { node: 'phone1', since: 1, records: [rec('note', 'n1', { body: 'Lait demi-écrémé' }, T0 - 20_000)], bases: [baseOf('Lait', T0 - 60_000, 'web001')] });
    expect(server.records.get('note', 'n1')!.fields.body).toBe('Lait x2 demi-écrémé');
  });

  it('merges from what a device sent when the answer was lost and another device built on it', async () => {
    await postSync(server, { node: 'web001', since: 0, records: [rec('note', 'n1', { body: 'Lait, pain' }, T0 - 60_000, 'web001')] });
    // The phone's push is stored, its answer lost.
    await postSync(server, { node: 'phone1', since: 1, records: [rec('note', 'n1', { body: 'Lait demi, pain' }, T0 - 40_000)], bases: [baseOf('Lait, pain', T0 - 60_000, 'web001')] });
    // The web sees it and adds a word on top, from the phone's version.
    await postSync(server, { node: 'web001', since: 1, records: [rec('note', 'n1', { body: 'Lait demi, pain, oeufs' }, T0 - 30_000, 'web001')], bases: [baseOf('Lait demi, pain', T0 - 40_000, 'phone1')] });
    // The phone, from its old base, replaces the word.
    await postSync(server, { node: 'phone1', since: 1, records: [rec('note', 'n1', { body: 'Lait entier, pain' }, T0 - 20_000)], bases: [baseOf('Lait, pain', T0 - 60_000, 'web001')] });
    expect(server.records.get('note', 'n1')!.fields.body).toBe('Lait entier, pain, oeufs');
  });

  it('finds the version a device sent however many edits were made on top of it', async () => {
    await postSync(server, { node: 'web001', since: 0, records: [rec('note', 'n1', { body: 'Lait, pain' }, T0 - 60_000, 'web001')] });
    await postSync(server, { node: 'phone1', since: 1, records: [rec('note', 'n1', { body: 'Lait demi, pain' }, T0 - 50_000)], bases: [baseOf('Lait, pain', T0 - 60_000, 'web001')] });
    // Typing on the web: each push starts from the one before.
    let body = 'Lait demi, pain';
    let base = baseOf(body, T0 - 50_000, 'phone1');
    for (let i = 0; i < 12; i += 1) {
      const next = `${body} mot${i}`;
      await postSync(server, { node: 'web001', since: 1, records: [rec('note', 'n1', { body: next }, T0 - 40_000 + i, 'web001')], bases: [base] });
      base = baseOf(next, T0 - 40_000 + i, 'web001');
      body = next;
    }
    await postSync(server, { node: 'phone1', since: 1, records: [rec('note', 'n1', { body: 'Lait entier, pain' }, T0 - 10_000)], bases: [baseOf('Lait, pain', T0 - 60_000, 'web001')] });
    expect(server.records.get('note', 'n1')!.fields.body).toBe(`Lait entier, pain${Array.from({ length: 12 }, (_, i) => ` mot${i}`).join('')}`);
  });

  it('keeps a note deleted for good deleted, even when the bin’s tombstone came later', async () => {
    const trashed = T0 - 8 * 86_400_000;
    server.sync.push([rec('note', 'n1', { title: 'Secret', body: 'code 1234', trashedAt: trashed, deletedAt: null }, trashed)]);
    // The person empties it on the web; the server's purge writes its own tombstone after.
    server.sync.push([rec('note', 'n1', { deletedAt: T0 - 5000, title: '', body: '' }, T0 - 5000, 'web001')]);
    server.sync.apply([{ type: 'note', id: 'n1', patch: () => ({ deletedAt: T0 }) }]);
    await postSync(server, { node: 'phone1', since: 0, records: [rec('note', 'n1', { trashedAt: null }, trashed + 1000, 'phone1')] });
    expect(server.records.get('note', 'n1')!.fields.deletedAt).toBe(T0);
  });

});
