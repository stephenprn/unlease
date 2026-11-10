/**
 * What two devices, a server whose date is wrong, a restart or a week offline can do to the sync,
 * and how it stays whole: server writes never under a device's clock, typed text merged from where a
 * device really was, lists merged as sets, Pages' tree repaired, a restore after the bin emptied.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatHlc, hlcNode, hlcWall } from '@unlease/core/sync/hlc';
import { adoptReplacedClocks, mergeRecord, type SyncRecord } from '@unlease/core/sync/record';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import { PUSH_REPAIRS, PUSH_RULES } from '../src/apps/registry';
import { repairPagesTree } from '../src/apps/pages/tree';
import { Housekeeping } from '../src/jobs/housekeeping';
import { newestStoredClock, ServerClock } from '../src/sync/clock';
import { SyncService } from '../src/sync/service';
import { createTestServer, postSync, rec, T0, type TestServer } from './helpers';

const DAY = 86_400_000;
let server: TestServer;
beforeEach(() => {
  server = createTestServer();
});
afterEach(() => server.close());

/** A record as a device holds it once it merged what the server sent. */
const onDevice = (local: SyncRecord, type: string, id: string): SyncRecord => mergeRecord(local, server.records.get(type, id)!).record;

/** The service as main.ts makes it after a restart: the same database, a new clock that observed what is stored. */
function restarted(): SyncService {
  const clock = new ServerClock('srvtest01', server.now);
  const newest = newestStoredClock(server.db);
  if (newest) clock.observe(newest);
  const sync = new SyncService({ db: server.db, records: server.records, clock, notifier: server.notifier, rules: PUSH_RULES, repairs: PUSH_REPAIRS, now: server.now });
  sync.startRun();
  return sync;
}

describe('a server whose date is wrong', () => {
  it('writes after the clocks it overwrites, so the device that holds them takes its writes', async () => {
    // Booted five days behind; the phone's date is right.
    server.time.value = T0 - 5 * DAY;
    const link = rec('link', 'l1', { noteId: 'inbox', url: 'https://example.org/a', status: 'pending', title: '' }, T0 - 1000);
    await postSync(server, { node: 'phone1', since: 0, time: T0, records: [link] });
    server.sync.apply([{ type: 'link', id: 'l1', patch: () => ({ status: 'ready', title: 'Lu' }) }]);
    const stored = server.records.get('link', 'l1')!;
    expect(stored.clocks.status! > link.clocks.status!).toBe(true);
    expect(onDevice(link, 'link', 'l1').fields).toMatchObject({ status: 'ready', title: 'Lu' });
    // The phone sending its old copy again (all of it, after a restore) changes nothing.
    await postSync(server, { node: 'phone1', since: 0, time: T0, records: [link] });
    expect(server.records.get('link', 'l1')!.fields.status).toBe('ready');
  });

  it('stamps a merge of two edits after both, so both devices take it', async () => {
    server.time.value = T0 - 5 * DAY;
    const base = 'Ligne 1\nLigne 2';
    const phoneNote = rec('note', 'n1', { title: 'Idées', body: base }, T0 - 60_000);
    await postSync(server, { node: 'phone1', since: 0, time: T0, records: [phoneNote] });
    const baseOf = { type: 'note', id: 'n1', fields: { body: base }, clocks: { body: phoneNote.clocks.body } };
    const web = rec('note', 'n1', { body: 'Ligne 0 du web\nLigne 1\nLigne 2' }, T0 - 20_000, 'web001');
    await postSync(server, { node: 'web001', since: 1, time: T0, records: [web], bases: [baseOf] });
    const phone = rec('note', 'n1', { body: 'Ligne 1\nLigne 2\nAjout du téléphone' }, T0 - 30_000);
    await postSync(server, { node: 'phone1', since: 1, time: T0, records: [phone], bases: [baseOf] });
    const merged = 'Ligne 0 du web\nLigne 1\nLigne 2\nAjout du téléphone';
    expect(server.records.get('note', 'n1')!.fields.body).toBe(merged);
    expect(onDevice(web, 'note', 'n1').fields.body).toBe(merged);
    expect(onDevice(phone, 'note', 'n1').fields.body).toBe(merged);
  });

  it('gives a phone far ahead the time the others vouch for, after what the server holds, and the phone takes it back', async () => {
    // The server five days behind, the web right, the phone three days ahead.
    server.time.value = T0 - 5 * DAY;
    await postSync(server, { node: 'web001', since: 0, time: T0, records: [rec('note', 'n1', { title: 'Web' }, T0 - 1000, 'web001')] });
    const phone = rec('note', 'n1', { title: 'Téléphone' }, T0 + 3 * DAY);
    await postSync(server, { node: 'phone1', since: 1, time: T0 + 3 * DAY, records: [phone] });
    const stored = server.records.get('note', 'n1')!;
    // The phone wrote last, as far as it shows: its title stays, under a clock of the server's at the web's time.
    expect(stored.fields.title).toBe('Téléphone');
    expect(hlcNode(stored.clocks.title!)).toBe('srvtest01');
    expect(Math.abs(hlcWall(stored.clocks.title!) - T0)).toBeLessThan(60_000);
    expect(adoptReplacedClocks(onDevice(phone, 'note', 'n1'), stored, clock => clock.endsWith('phone1')).clocks.title).toBe(stored.clocks.title);
  });

  it('catches a phone far ahead that is the first to sync after a restart, by the clocks the others stored', async () => {
    await postSync(server, { node: 'web001', since: 0, time: T0, records: [rec('note', 'n1', { title: 'Web' }, T0 - 1000, 'web001')] });
    const sync = restarted();
    const ahead = T0 + 30 * DAY;
    sync.push([rec('note', 'n2', { title: 'En avance' }, ahead)], [], 'phone1');
    expect(hlcWall(server.records.get('note', 'n2')!.clocks.title!)).toBeLessThan(T0 + DAY);
  });
});

describe('typed text after a lost answer and a restart', () => {
  it('merges from what the device sent, not from its older base: nothing typed twice', () => {
    const base = 'Réunion mardi';
    server.sync.push([rec('note', 'n1', { title: 'Notes', body: base }, T0 - 60_000)], [], 'phone1');
    const baseRec = { type: 'note', id: 'n1', fields: { body: base }, clocks: { body: formatHlc(T0 - 60_000, 0, 'phone1') } };
    server.sync.push([rec('note', 'n1', { body: 'Réunion mardi avec Paul' }, T0 - 30_000, 'web001')], [baseRec], 'web001');
    // The phone's push is merged with the web's edit; its answer never comes.
    server.sync.push([rec('note', 'n1', { body: 'Réunion mardi 14h' }, T0 - 20_000)], [baseRec], 'phone1');
    // The server restarts; the phone typed on, still from its first base.
    restarted().push([rec('note', 'n1', { body: 'Réunion mardi 14h30' }, T0 - 10_000)], [baseRec], 'phone1');
    expect(server.records.get('note', 'n1')!.fields.body).toBe('Réunion mardi avec Paul 14h30');
  });
});

describe('the days a repeating event takes out', () => {
  it('merge as a set when two devices each take one out', async () => {
    const series = rec('calendarEvent', 's1', { title: 'Point', start: '2026-11-02T09:00', end: '2026-11-02T10:00', timeZone: 'Europe/Paris', rrule: 'FREQ=DAILY', exdates: [], recurringId: null, trashedAt: null, deletedAt: null }, T0 - 60_000);
    await postSync(server, { node: 'phone1', since: 0, records: [series] });
    const baseOf = { type: 'calendarEvent', id: 's1', fields: { exdates: [] }, clocks: { exdates: series.clocks.exdates } };
    await postSync(server, { node: 'web001', since: 1, records: [rec('calendarEvent', 's1', { exdates: ['2026-11-05T09:00'] }, T0 - 20_000, 'web001')], bases: [baseOf] });
    await postSync(server, { node: 'phone1', since: 1, records: [rec('calendarEvent', 's1', { exdates: ['2026-11-03T09:00'] }, T0 - 30_000)], bases: [baseOf] });
    expect(server.records.get('calendarEvent', 's1')!.fields.exdates).toEqual(['2026-11-03T09:00', '2026-11-05T09:00']);
  });
});

/** A block as a device pushes it. */
const block = (id: string, parentId: string | null, fields: Record<string, unknown>, wall: number, node = 'phone1') =>
  rec('block', id, { kind: 'text', parentId, position: 'a0', text: id, trashedAt: null, deletedAt: null, createdAt: 1, ...fields }, wall, node);
const page = (id: string, parentId: string | null, wall: number, node = 'phone1') => block(id, parentId, { kind: 'page' }, wall, node);
const parentOf = (id: string) => server.records.get('block', id)!.fields.parentId;

describe("Pages' tree", () => {
  it('undoes the move that closed a loop two devices made, so neither page vanishes', async () => {
    await postSync(server, { node: 'phone1', since: 0, records: [page('A', null, T0 - 9000), page('B', null, T0 - 9000), block('a1', 'A', {}, T0 - 9000)] });
    // The web put B into A; the phone, not knowing, A into B.
    await postSync(server, { node: 'web001', since: 3, records: [page('B', 'A', T0 - 2000, 'web001')] });
    const answer = await postSync(server, { node: 'phone1', since: 3, records: [page('A', 'B', T0 - 1000)] });
    expect(parentOf('B')).toBe('A');
    expect(parentOf('A')).toBeNull();
    // The repair is in the phone's answer, under a clock that wins on every device.
    const repaired = answer.body.records.find((record: SyncRecord) => record.id === 'A');
    expect(repaired.fields.parentId).toBeNull();
    expect(hlcNode(repaired.clocks.parentId)).toBe('srvtest01');
  });

  it('puts a page of a loop at the top level when no push says where it came from', () => {
    server.sync.push([page('A', 'B', T0 - 2000), page('B', 'A', T0 - 1000, 'web001')], [], 'phone1');
    // Both moves came in one push of new records: nothing to undo, the newest move's page goes up.
    expect([parentOf('A'), parentOf('B')]).toContain(null);
    expect(parentOf('B')).toBeNull();
  });

  it('brings back a block moved into a container another device deleted, and one typed into it where the container stood', async () => {
    await postSync(server, {
      node: 'phone1',
      since: 0,
      records: [page('P', null, T0 - 9000), block('t', 'P', { kind: 'toggle', position: 'a1' }, T0 - 9000), block('x', 'P', { position: 'a3' }, T0 - 9000), block('after', 'P', { position: 'a5' }, T0 - 9000)],
    });
    // The phone moves x into the toggle and types a line in it; the web deletes the toggle.
    await postSync(server, { node: 'web001', since: 4, records: [block('t', 'P', { kind: 'toggle', position: 'a1', deletedAt: T0 - 3000 }, T0 - 3000, 'web001')] });
    await postSync(server, { node: 'phone1', since: 4, records: [block('x', 't', { position: 'a0' }, T0 - 2000), block('typed', 't', { position: 'a2' }, T0 - 2000)] });
    expect(server.records.get('block', 'x')!.fields).toMatchObject({ parentId: 'P', position: 'a3' });
    const typed = server.records.get('block', 'typed')!.fields;
    expect(typed.parentId).toBe('P');
    // Where the toggle stood: after it, before what followed it.
    expect(typed.position as string > 'a1' && (typed.position as string) < 'a3').toBe(true);
  });

  it('leaves the content of a page deleted for good with it, but sends a page in it to the top level', async () => {
    await postSync(server, { node: 'web001', since: 0, records: [page('P', null, T0 - 3000, 'web001'), block('old', 'P', { deletedAt: T0 - 3000 }, T0 - 3000, 'web001')] });
    await postSync(server, { node: 'web001', since: 2, records: [block('P', null, { kind: 'page', deletedAt: T0 - 2500 }, T0 - 2500, 'web001')] });
    await postSync(server, { node: 'phone1', since: 0, records: [block('line', 'P', {}, T0 - 2000), page('sub', 'P', T0 - 2000)] });
    expect(parentOf('line')).toBe('P');
    expect(parentOf('sub')).toBeNull();
  });

  it('repairs, hourly, a loop left from before', () => {
    // Stored as they were, without the repair after each push.
    const bare = new SyncService({ db: server.db, records: server.records, clock: new ServerClock('srvtest01', server.now), notifier: server.notifier, now: server.now });
    bare.push([page('A', 'B', T0 - 2000), page('B', 'A', T0 - 1000, 'web001'), block('a1', 'A', {}, T0 - 1000)], [], 'phone1');
    expect(repairPagesTree(server.db, server.sync)).toBe(1);
    expect(parentOf('B')).toBeNull();
    expect(repairPagesTree(server.db, server.sync)).toBe(0);
  });
});

describe('a restore after the bin emptied', () => {
  const OLD = T0 - (TRASH_RETENTION_DAYS + 1) * DAY;
  let housekeeping: Housekeeping;
  beforeEach(() => {
    housekeeping = new Housekeeping({ db: server.db, sync: server.sync, records: server.records, blobs: server.blobs, apps: server.apps, isOn: id => server.runner.isOn(id), now: server.now });
  });

  it('brings back a page with what it held, a contact, and a repeating event with its exceptions', async () => {
    server.sync.push(
      [
        block('voyage', null, { kind: 'page', trashedAt: OLD }, OLD),
        block('para', 'voyage', {}, OLD),
        rec('contact', 'c1', { firstName: 'Ada', trashedAt: OLD, deletedAt: null }, OLD),
        rec('calendarEvent', 's1', { title: 'Point', start: '2026-11-02T09:00', end: '2026-11-02T10:00', timeZone: 'Europe/Paris', rrule: 'FREQ=DAILY', exdates: [], recurringId: null, trashedAt: OLD, deletedAt: null }, OLD),
        rec('calendarEvent', 'e1', { title: 'Point bis', start: '2026-11-03T11:00', end: '2026-11-03T12:00', timeZone: 'Europe/Paris', rrule: '', exdates: [], recurringId: 's1', originalStart: '2026-11-03T09:00', trashedAt: null, deletedAt: null }, OLD),
      ],
      [],
      'phone1',
    );
    await housekeeping.run();
    for (const [type, id] of [['block', 'voyage'], ['block', 'para'], ['contact', 'c1'], ['calendarEvent', 's1'], ['calendarEvent', 'e1']] as const) expect(server.records.get(type, id)!.fields.deletedAt, id).toBe(T0);
    // A phone offline for the week restores them from its own bin.
    server.sync.push(
      [rec('block', 'voyage', { trashedAt: null }, T0 + 1000), rec('contact', 'c1', { trashedAt: null }, T0 + 1000), rec('calendarEvent', 's1', { trashedAt: null }, T0 + 1000)],
      [],
      'phone1',
    );
    for (const [type, id] of [['block', 'voyage'], ['block', 'para'], ['contact', 'c1'], ['calendarEvent', 's1'], ['calendarEvent', 'e1']] as const) expect(server.records.get(type, id)!.fields.deletedAt, id).toBeNull();
  });
});
