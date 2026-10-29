import { createClock, formatHlc, GENESIS_HLC, hlcWall, isHlc, observe, parseHlc, tick } from '@unlease/core/sync/hlc';
import { mergeRecord, newerFields, sanitizeRecord, writeFields, type SyncRecord } from '@unlease/core/sync/record';
import { parseSyncRequest, parseSyncResponse } from '@unlease/core/sync/protocol';
import { noteFromRecord, noteFields } from '../entities';
import { isValidField } from '@unlease/core/sync/schema';
import { sameClocks, syncOnce, type SyncStore, type SyncTransport } from '@unlease/core/sync/engine';

const note = (id: string, fields: Record<string, unknown>, clock: string): SyncRecord => ({
  type: 'note',
  id,
  fields,
  clocks: Object.fromEntries(Object.keys(fields).map(key => [key, clock])),
});

describe('hybrid logical clock', () => {
  it('orders by string comparison and survives a slow wall clock', () => {
    const phone = createClock('phone1');
    const first = tick(phone, 1_000);
    const sameMs = tick(phone, 1_000);
    const backwards = tick(phone, 500);
    expect(sameMs > first).toBe(true);
    expect(backwards > sameMs).toBe(true);
    expect(hlcWall(backwards)).toBe(1_000);
  });

  it('never runs behind a clock it has observed', () => {
    const web = createClock('web001');
    const remote = formatHlc(5_000, 3, 'phone1');
    observe(web, remote, 1_000);
    expect(tick(web, 1_000) > remote).toBe(true);
  });

  it('ignores a remote clock from far in the future', () => {
    const web = createClock('web001');
    observe(web, formatHlc(10 * 24 * 3600 * 1000, 0, 'broken'), 0);
    expect(hlcWall(tick(web, 1_000))).toBe(1_000);
  });

  it('round-trips and validates', () => {
    const clock = formatHlc(123_456_789, 42, 'node42');
    expect(parseHlc(clock)).toEqual({ wall: 123_456_789, counter: 42, node: 'node42' });
    expect(isHlc(clock)).toBe(true);
    expect(isHlc('nope')).toBe(false);
    expect(GENESIS_HLC < clock).toBe(true);
  });
});

describe('field-wise merge', () => {
  const a = formatHlc(1000, 0, 'phone1');
  const b = formatHlc(2000, 0, 'web001');

  it('keeps each side’s newer fields', () => {
    const base = note('n1', { title: 'Courses', pinned: false }, a);
    const phone = writeFields(base, { pinned: true }, formatHlc(1500, 0, 'phone1'));
    const web = writeFields(base, { title: 'Courses samedi' }, b);
    const { record } = mergeRecord(phone, web);
    expect(record.fields).toEqual({ title: 'Courses samedi', pinned: true });
  });

  it('converges whatever the order (commutative, idempotent)', () => {
    const x = note('n1', { title: 'A', body: 'x' }, a);
    const y = writeFields(note('n1', { title: 'B' }, b), { body: 'y' }, formatHlc(500, 0, 'web001'));
    const xy = mergeRecord(x, y).record;
    const yx = mergeRecord(y, x).record;
    expect(xy.fields).toEqual(yx.fields);
    expect(mergeRecord(xy, y).changed).toBe(false);
    expect(xy.fields).toEqual({ title: 'B', body: 'x' });
  });

  it('breaks exact ties on the node id, identically everywhere', () => {
    const left = note('n1', { title: 'left' }, formatHlc(1000, 0, 'aaaa'));
    const right = note('n1', { title: 'right' }, formatHlc(1000, 0, 'bbbb'));
    expect(mergeRecord(left, right).record.fields.title).toBe('right');
    expect(mergeRecord(right, left).record.fields.title).toBe('right');
  });

  it('reports which fields are news', () => {
    const current = note('n1', { title: 'A', body: 'x' }, a);
    const incoming = writeFields(current, { body: 'y' }, b);
    expect(newerFields(current, incoming)).toEqual(['body']);
  });
});

describe('sanitizing what arrives', () => {
  it('drops fields that fail the schema, one by one', () => {
    const clock = formatHlc(1000, 0, 'phone1');
    const { record, rejected } = sanitizeRecord({
      type: 'note',
      id: 'n1',
      fields: { title: 'ok', pinned: 'yes', color: '#7fff00', hack: 1 },
      clocks: { title: clock, pinned: clock, color: clock, hack: clock },
    });
    expect(record?.fields).toEqual({ title: 'ok' });
    expect([...rejected].sort()).toEqual(['color', 'hack', 'pinned']);
  });

  it('passes on any well-formed colour or paper key, so a newer gradient survives an older peer', () => {
    expect(isValidField('note', 'color', 'nacre')).toBe(true);
    expect(isValidField('note', 'color', 'aurore')).toBe(true);
    expect(isValidField('note', 'pattern', 'dots')).toBe(true);
    expect(isValidField('note', 'pattern', null)).toBe(true);
    expect(isValidField('note', 'pattern', 'url(x)')).toBe(false);
    expect(isValidField('label', 'color', 'nacre')).toBe(false);
  });

  it('refuses a record with an unusable id or type', () => {
    expect(sanitizeRecord({ type: 'note', id: '../etc', fields: {}, clocks: {} }).record).toBeNull();
    expect(sanitizeRecord({ type: 'virus', id: 'x', fields: {}, clocks: {} }).record).toBeNull();
  });

  it('parses requests and responses defensively', () => {
    expect(parseSyncRequest({ node: 'phone1', since: 3, records: [] }).request?.since).toBe(3);
    expect(parseSyncRequest({ node: 'NOPE!', records: [] }).error).toMatch(/node/);
    expect(parseSyncRequest({ node: 'phone1', wait: 1e9 }).request?.wait).toBe(25_000);
    expect(parseSyncResponse({ records: [], cursor: 4, more: true })?.more).toBe(true);
    expect(parseSyncResponse({ nope: true })).toBeNull();
  });
});

describe('entities', () => {
  it('reads a partial record with defaults, and round-trips a full one', () => {
    const partial = noteFromRecord({ type: 'note', id: 'n1', fields: { title: 'x' }, clocks: { title: formatHlc(5, 0, 'phone1') } });
    expect(partial).toMatchObject({ id: 'n1', title: 'x', kind: 'text', pinned: false, labelIds: [], editedAt: 5 });
    const fields = noteFields({ ...partial, labelIds: ['l1'] });
    const clock = formatHlc(9, 0, 'phone1');
    const clocks = Object.fromEntries(Object.keys(fields).map(key => [key, clock]));
    expect(noteFromRecord({ type: 'note', id: 'n1', fields, clocks }).labelIds).toEqual(['l1']);
  });
});

describe('sync engine', () => {
  function memoryStore(initial: SyncRecord[]) {
    const records = new Map(initial.map(r => [r.id, r]));
    const pending = new Set(initial.map(r => r.id));
    let cursor = 0;
    const store: SyncStore & { records: typeof records; pending: typeof pending } = {
      records,
      pending,
      pendingRecords: limit => [...pending].slice(0, limit).map(id => records.get(id)!),
      applyRemote: incoming => {
        for (const r of incoming) records.set(r.id, mergeRecord(records.get(r.id), r).record);
      },
      acknowledge: sent => {
        for (const r of sent) if (sameClocks(records.get(r.id)!, r)) pending.delete(r.id);
      },
      readCursor: () => cursor,
      writeCursor: value => {
        cursor = value;
      },
    };
    return store;
  }

  function memoryServer() {
    const rows = new Map<string, { record: SyncRecord; seq: number }>();
    let seq = 0;
    const transport: SyncTransport = {
      sync: async request => {
        for (const incoming of request.records) {
          const current = rows.get(incoming.id);
          const { record, changed } = mergeRecord(current?.record, incoming);
          if (changed) rows.set(incoming.id, { record, seq: (seq += 1) });
        }
        const out = [...rows.values()].filter(row => row.seq > request.since).sort((x, y) => x.seq - y.seq);
        return { records: out.map(row => row.record), cursor: out.length ? out[out.length - 1]!.seq : request.since, more: false, serverTime: 0 };
      },
    };
    return { transport, rows };
  }

  it('pushes, pulls and converges two devices', async () => {
    const server = memoryServer();
    const phone = memoryStore([note('n1', { title: 'phone' }, formatHlc(1, 0, 'phone1'))]);
    const web = memoryStore([note('n2', { title: 'web' }, formatHlc(2, 0, 'web001'))]);
    await syncOnce(phone, server.transport, { node: 'phone1' });
    await syncOnce(web, server.transport, { node: 'web001' });
    await syncOnce(phone, server.transport, { node: 'phone1' });
    expect([...phone.records.keys()].sort()).toEqual(['n1', 'n2']);
    expect([...web.records.keys()].sort()).toEqual(['n1', 'n2']);
    expect(phone.pending.size).toBe(0);
    expect(web.pending.size).toBe(0);
  });

  it('keeps an edit made during the request pending', async () => {
    const server = memoryServer();
    const phone = memoryStore([note('n1', { title: 'v1' }, formatHlc(1, 0, 'phone1'))]);
    const slow: SyncTransport = {
      sync: async request => {
        // The person types while the request is in flight.
        phone.records.set('n1', writeFields(phone.records.get('n1')!, { title: 'v2' }, formatHlc(2, 0, 'phone1')));
        return server.transport.sync(request);
      },
    };
    await syncOnce(phone, slow, { node: 'phone1' });
    expect(phone.records.get('n1')!.fields.title).toBe('v2');
    expect(phone.pending.has('n1')).toBe(true);
  });
});

describe('engine edge cases', () => {
  it('follows a server whose cursor went backwards (a reset server)', async () => {
    let cursor = 900;
    const store: SyncStore = {
      pendingRecords: () => [],
      applyRemote: () => {},
      acknowledge: () => {},
      readCursor: () => cursor,
      writeCursor: value => {
        cursor = value;
      },
    };
    const transport: SyncTransport = { sync: async () => ({ records: [], cursor: 3, more: false, serverTime: 0 }) };
    await syncOnce(store, transport, { node: 'phone1' });
    expect(cursor).toBe(3);
  });

  it('splits a push that would exceed the size cap', async () => {
    const big = (i: number) => note(`n${i}`, { body: 'x'.repeat(200_000) }, formatHlc(i + 1, 0, 'phone1'));
    const pending = new Map(Array.from({ length: 5 }, (_, i) => [`n${i}`, big(i)]));
    const sizes: number[] = [];
    const store: SyncStore = {
      pendingRecords: limit => [...pending.values()].slice(0, limit),
      applyRemote: () => {},
      acknowledge: sent => sent.forEach(r => pending.delete(r.id)),
      readCursor: () => 0,
      writeCursor: () => {},
    };
    const transport: SyncTransport = {
      sync: async request => {
        sizes.push(JSON.stringify(request.records).length);
        return { records: [], cursor: 0, more: false, serverTime: 0 };
      },
    };
    await syncOnce(store, transport, { node: 'phone1' });
    expect(pending.size).toBe(0);
    expect(sizes.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThan(700_000);
  });

  it('never lets a prototype key through as a field', () => {
    const clock = formatHlc(1, 0, 'phone1');
    const raw = JSON.parse(`{"type":"note","id":"n1","fields":{"__proto__":{"x":1},"constructor":1,"title":"ok"},"clocks":{"__proto__":"${clock}","constructor":"${clock}","title":"${clock}"}}`);
    const { record } = sanitizeRecord(raw);
    expect(Object.keys(record!.fields)).toEqual(['title']);
  });
});
