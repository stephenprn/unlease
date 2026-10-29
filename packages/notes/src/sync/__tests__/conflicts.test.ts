import { comparePositions, indexBetween, keyBetween, placeAt, positionBetween, positionsBetween, type Placed } from '@unlease/core/services/fractionalIndex';
import { baseAfterAck, baseAfterWrite, resolveTypedText } from '@unlease/core/sync/bases';
import { syncOnce, utf8Length, type SyncStore, type SyncTransport } from '@unlease/core/sync/engine';
import { formatHlc, GENESIS_HLC, hlcNode } from '@unlease/core/sync/hlc';
import { parseSyncRequest, parseSyncResponse, type ServerMark, type SyncRequest } from '@unlease/core/sync/protocol';
import { mergeRecord, writeFields, type SyncRecord } from '@unlease/core/sync/record';
import { fitField } from '@unlease/core/sync/schema';
import { mapCaret, mergeField, mergeText } from '@unlease/core/sync/textMerge';
import '../types';

const at = (ms: number, node = 'phone1') => formatHlc(ms, 0, node);
const note = (id: string, fields: Record<string, unknown>, clock: string): SyncRecord => ({
  type: 'note',
  id,
  fields,
  clocks: Object.fromEntries(Object.keys(fields).map(key => [key, clock])),
});

describe('merging two edits of one text', () => {
  it('keeps edits made in different places', () => {
    const base = 'Ligne 1\nLigne 2\nLigne 3';
    expect(mergeText(base, `${base}\nAjout du téléphone`, `Ligne 0 du web\n${base}`)).toBe('Ligne 0 du web\nLigne 1\nLigne 2\nLigne 3\nAjout du téléphone');
    expect(mergeText('Liste:\n- pain\n- lait', 'Liste:\n- pain\n- lait\n- œufs', 'Liste:\n- pain complet\n- lait')).toBe('Liste:\n- pain complet\n- lait\n- œufs');
  });

  it('keeps both versions of words both sides rewrote, the older first', () => {
    expect(mergeText('rdv lundi à 10h', 'rdv mardi à 10h', 'rdv jeudi à 10h', true)).toBe('rdv mardi / jeudi à 10h');
    expect(mergeText('rdv lundi à 10h', 'rdv mardi à 10h', 'rdv jeudi à 10h', false)).toBe('rdv jeudi / mardi à 10h');
    // Added at the same place: one after the other.
    expect(mergeText('Lait', 'Lait demi-écrémé', 'Lait x2')).toBe('Lait demi-écrémé x2');
    expect(mergeText('', 'du téléphone', 'du web')).toBe('du téléphone du web');
  });

  it('keeps a sentence both sides rewrote as two whole versions, never interleaved word by word', () => {
    expect(mergeText('le chat dort', 'le chien mange', 'le lapin court', true)).toBe('le chien mange / lapin court');
    expect(mergeText('Rendez-vous mardi à 10h', 'Rendez-vous jeudi à 15h chez le dentiste', 'Rendez-vous mercredi à 9h', true)).toBe(
      'Rendez-vous jeudi à 15h chez le dentiste / mercredi à 9h',
    );
    expect(mergeText('corps de départ', 'corps écrit hors ligne sur le téléphone', 'corps écrit sur le web, plus tard', true)).toBe(
      'corps écrit hors ligne sur le téléphone / sur le web, plus tard',
    );
    // Other sentences, and words only one side changed, are merged as before.
    expect(mergeText('Le chat dort. Le chien court.', 'Le tigre dort. Le chien marche.', 'Le lion dort. Le chien saute.', true)).toBe(
      'Le tigre / lion dort. Le chien marche / saute.',
    );
    expect(mergeText('Acheter du lait demain matin', 'Acheter du beurre demain matin', 'Acheter du fromage demain soir', true)).toBe(
      'Acheter du beurre / fromage demain soir',
    );
    // The spaces around a rewritten word stay.
    expect(mergeText('rdv lundi à', 'rdv mardi à', 'rdv jeudi à', true)).toBe('rdv mardi / jeudi à');
  });

  it('keeps both values where one is only part of the other\u2019s word, never glues words or doubles spaces', () => {
    expect(mergeText('prix 10 € par mois', 'prix 5 € par mois', 'prix 15 € par mois', true)).toBe('prix 5 / 15 € par mois');
    expect(mergeText('rdv à 10h', 'rdv à 1h', 'rdv à 11h', true)).toBe('rdv à 1h / 11h');
    expect(mergeText('code porte 1234', 'code porte 456', 'code porte 3456', false)).toBe('code porte 3456 / 456');
    expect(mergeText('Courses:\n', 'Courses:\n\nPain', 'Courses:\nLait', true)).toBe('Courses:\n\nPain\nLait');
    expect(mergeText('Lait ', 'Lait\nPain', 'Lait x2', true)).toBe('Lait\nPain x2');
    expect(mergeText('lait', 'lait à ', 'lait pain', true)).toBe('lait à pain');
    // A word deleted, leaving two spaces, against the same word rewritten: the rewrite, and no stray slash.
    expect(mergeText('rdv lundi à 10h', 'rdv  à 10h', 'rdv jeudi à 10h', true)).toBe('rdv jeudi à 10h');
  });

  it('gives back the merge itself when a side that is already in it comes back (an answer lost, a server restarted)', () => {
    const base = 'Appeler Jean lundi';
    const merged = mergeText(base, 'Appeler Jean Dupont lundi', 'Appeler Jean lundi matin', true);
    expect(merged).toBe('Appeler Jean Dupont lundi matin');
    expect(mergeText(base, 'Appeler Jean Dupont lundi', merged, true)).toBe(merged);
    expect(mergeText(base, merged, 'Appeler Jean Dupont lundi', false)).toBe(merged);
    const rewrites = mergeText('le chat dort', 'le chien mange', 'le lapin court', false);
    expect(mergeText('le chat dort', 'le chien mange', rewrites, true)).toBe(rewrites);
    expect(mergeText('de de 👍 👍 à x2 pain! lait', 'de de 👍 👍 à Mk1 x2 pain! lait', 'de de 👍 Mk0 à Mk1 x2 pain! lait', true)).toBe('de de 👍 Mk0 à Mk1 x2 pain! lait');
  });

  it('takes one side when the other did not change, and never loses an edit to a deletion', () => {
    expect(mergeText('abc', 'abc', 'xyz')).toBe('xyz');
    expect(mergeText('abc', 'xyz', 'abc')).toBe('xyz');
    expect(mergeText('a b c', 'a c', 'a B c')).toBe('a B c');
  });

  it('does not repeat a change a side already holds (a merge seen again)', () => {
    expect(mergeText('Lait', 'Lait demi-écrémé', 'Lait demi-écrémé x2')).toBe('Lait demi-écrémé x2');
    const merged = mergeText('a\nb', 'a\nb\nc', 'z\na\nb');
    expect(mergeText('a\nb', 'a\nb\nc', merged)).toBe(merged);
  });

  it('copes with long and unrelated texts quickly', () => {
    let base = '';
    for (let i = 0; i < 20_000; i += 1) base += `mot${i % 97}${i % 13 === 0 ? '\n' : ' '}`;
    const started = Date.now();
    const merged = mergeText(base, base.replace('mot5 ', 'MOT5 ') + ' fin', 'début ' + base.replace('mot50 ', 'MOT50 '));
    expect(merged.startsWith('début ') && merged.endsWith(' fin') && merged.includes('MOT5 ') && merged.includes('MOT50 ')).toBe(true);
    const scrambled = base.split(' ').reverse().join(' ');
    expect(mergeText(base, scrambled, `${base} x`).length).toBeGreaterThan(base.length);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('merges long notes with many edits on one side and one on the other exactly, never twice', () => {
    let seed = 7;
    const words = Array.from({ length: 12_000 }, () => `mot${(seed = (seed * 1103515245 + 12345) % 2 ** 31) % 5000}`);
    const join = (list: readonly string[]) => list.map((word, i) => word + (i % 12 === 11 ? '\n' : ' ')).join('');
    const fixed = [...words];
    for (let i = 0; i < 150; i += 1) fixed[i * 80] = `CORRIGÉ${i}`;
    const inserted = [...words];
    inserted[6001] += ' INSÉRÉ';
    const merged = mergeText(join(words), join(fixed), join(inserted), true);
    expect(merged.length).toBe(join(fixed).length + ' INSÉRÉ'.length);
    expect(merged).toContain('INSÉRÉ');
    expect(Array.from({ length: 150 }, (_, i) => merged.includes(`CORRIGÉ${i}`)).every(Boolean)).toBe(true);
  });

  it('merges lines both sides rewrote line by line, and keeps both versions rather than drop one when even that fails', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `ligne ${i} ${'mot '.repeat(30)}\n`);
    const fixedEverywhere = lines.map(line => line.replace('mot', 'MOT'));
    const oneWord = lines.map((line, i) => (i === 10 ? line.replace('ligne 10', 'ligne dix') : line));
    const merged = mergeText(lines.join(''), fixedEverywhere.join(''), oneWord.join(''), true);
    expect(merged).toContain('ligne dix');
    expect(merged.split('MOT').length - 1).toBe(40);
    const base = 'x '.repeat(3000);
    const rewritten = 'y '.repeat(3000);
    const both = mergeText(base, rewritten, `${base}z`, true);
    expect(both).toContain(rewritten);
    expect(both).toContain(`${base}z`);
  });

  it('keeps the newer text whole when a merge would not fit the field', () => {
    const merged = mergeField('note', 'title', 'a', `a ${'x'.repeat(600)}`, `${'y'.repeat(600)} a`, true);
    expect(merged).toBe(`${'y'.repeat(600)} a`);
  });
});

describe('bases', () => {
  const stored = note('n1', { title: 'Courses', body: 'pain', pinned: false }, at(10));

  it('remembers what a typed field held before its first unacknowledged edit, and only typed fields', () => {
    const first = baseAfterWrite(undefined, stored, { body: 'pain\nlait', pinned: true })!;
    expect(first).toEqual({ type: 'note', id: 'n1', fields: { body: 'pain' }, clocks: { body: at(10) } });
    const edited = writeFields(stored, { body: 'pain\nlait' }, at(20));
    expect(baseAfterWrite(first, edited, { body: 'pain\nlait\nœufs' })).toBe(first);
    expect(baseAfterWrite(undefined, undefined, { body: 'neuf' })).toBeUndefined();
    expect(baseAfterWrite(undefined, note('n2', { title: 'x' }, at(1)), { body: 'neuf' })!.clocks.body).toBe(GENESIS_HLC);
  });

  it('goes once the server holds the field, or moves to what it holds when typed in again', () => {
    const base = baseAfterWrite(undefined, stored, { body: 'pain\nlait' })!;
    const sent = writeFields(stored, { body: 'pain\nlait' }, at(20));
    expect(baseAfterAck(base, sent, sent)).toBeNull();
    const typedMore = writeFields(sent, { body: 'pain\nlait\nœufs' }, at(30));
    expect(baseAfterAck(base, typedMore, sent)).toEqual({ type: 'note', id: 'n1', fields: { body: 'pain\nlait' }, clocks: { body: at(20) } });
  });

  it('merges an incoming edit of a field typed in here, and ignores echoes of its own pushes', () => {
    const base = baseAfterWrite(undefined, stored, { body: 'x' })!;
    const local = writeFields(stored, { body: 'pain\nlait' }, at(20));
    const theirs = writeFields(stored, { body: 'baguette\npain' }, at(25, 'web001'));
    const kept = mergeRecord(local, theirs).record;
    const isOwn = (clock: string) => hlcNode(clock) === 'phone1';
    const resolution = resolveTypedText(local, theirs, base, kept, isOwn);
    expect(resolution.patch).toEqual({ body: 'baguette\npain\nlait' });
    expect(resolution.base.clocks.body).toBe(at(25, 'web001'));
    const echo = writeFields(stored, { body: 'pain\nlait' }, at(20));
    expect(resolveTypedText(local, echo, base, mergeRecord(local, echo).record, isOwn).patch).toBeNull();
  });
});

describe('positions from synced records', () => {
  it('never throws between tied or invalid neighbours, and lands just after the tie', () => {
    expect(() => keyBetween('a1', 'a1')).toThrow();
    const between = positionBetween('a1', 'a1');
    expect(between > 'a1' && between < 'a2').toBe(true);
    expect(positionBetween('a2', 'a1') > 'a2').toBe(true);
    expect(positionBetween('nope0', 'a1') < 'a1').toBe(true);
    expect(positionBetween(null, null)).toBe('a0');
    const keys = positionsBetween('a1', 'a1', 3);
    expect(keys).toEqual([...keys].sort());
    expect(keys.every(key => key > 'a1' && key < 'a2')).toBe(true);
  });

  // Both devices appended to one list offline: two items share « a2 ».
  const list: Placed[] = [
    { id: 'un', position: 'a0' },
    { id: 'deux', position: 'a1' },
    { id: 'jumeau1', position: 'a2' },
    { id: 'jumeau2', position: 'a2' },
    { id: 'fin', position: 'a3' },
  ];
  const order = (items: readonly Placed[]) => [...items].sort(comparePositions).map(item => item.id);
  const apply = (items: readonly Placed[], placed: { positions: string[]; moved: Placed[] }, ids: string[]) => {
    const moved = new Map(placed.moved.map(item => [item.id, item.position]));
    return [...items.map(item => ({ ...item, position: moved.get(item.id) ?? item.position })), ...ids.map((id, k) => ({ id, position: placed.positions[k]! }))];
  };

  it('places an item between two records sharing a key by moving the later one', () => {
    const between = placeAt(list, 3);
    expect(between.moved.map(item => item.id)).toEqual(['jumeau2']);
    expect(order(apply(list, between, ['nouveau']))).toEqual(['un', 'deux', 'jumeau1', 'nouveau', 'jumeau2', 'fin']);
    const three = placeAt(list, 3, 3);
    expect(order(apply(list, three, ['x', 'y', 'z']))).toEqual(['un', 'deux', 'jumeau1', 'x', 'y', 'z', 'jumeau2', 'fin']);
    // Elsewhere nothing else moves.
    expect(placeAt(list, 2).moved).toEqual([]);
    expect(order(apply(list, placeAt(list, 2), ['avant']))).toEqual(['un', 'deux', 'avant', 'jumeau1', 'jumeau2', 'fin']);
    expect(placeAt(list, 5).moved).toEqual([]);
    expect(placeAt([], 0).positions).toEqual(['a0']);
  });

  it('moves an item between twins, one step down past them, or to either end', () => {
    const others = list.filter(item => item.id !== 'deux');
    const down = placeAt(others, indexBetween(others, 'jumeau1', 'jumeau2'));
    expect(order(apply(others, down, ['deux']))).toEqual(['un', 'jumeau1', 'deux', 'jumeau2', 'fin']);
    expect(indexBetween(others, null, 'un')).toBe(0);
    expect(indexBetween(others, 'fin', null)).toBe(others.length);
    // A neighbour gone meanwhile: the other one decides, then the end named.
    expect(indexBetween(others, 'parti', 'fin')).toBe(others.length - 1);
    expect(indexBetween(others, null, 'parti')).toBe(0);
  });
});

describe('protocol: bases and the epoch', () => {
  it('keeps bases only for typed fields of pushed records', () => {
    const clock = at(5);
    const parsed = parseSyncRequest({
      node: 'phone1',
      since: 0,
      epoch: 'k3x9q2',
      records: [note('n1', { body: 'b' }, at(9))],
      bases: [
        { type: 'note', id: 'n1', fields: { body: 'a', pinned: true }, clocks: { body: clock, pinned: clock } },
        { type: 'note', id: 'other', fields: { body: 'a' }, clocks: { body: clock } },
      ],
    });
    expect(parsed.request!.bases).toEqual([{ type: 'note', id: 'n1', fields: { body: 'a' }, clocks: { body: clock } }]);
    expect(parsed.request!.epoch).toBe('k3x9q2');
    expect(parseSyncRequest({ node: 'phone1', epoch: 'BAD!' }).request!.epoch).toBeUndefined();
    expect(parseSyncResponse({ records: [], cursor: 0, epoch: 'k3x9q2' })!.epoch).toBe('k3x9q2');
    expect(parseSyncResponse({ records: [], cursor: 0 })!.epoch).toBeUndefined();
  });
});

describe('engine: acknowledgements, bases, epochs, sizes', () => {
  function store(initial: SyncRecord[]) {
    const records = new Map(initial.map(r => [r.id, r]));
    const pending = new Set(initial.map(r => r.id));
    const calls: string[] = [];
    let epoch: string | null = null;
    const s: SyncStore & { records: typeof records; pending: typeof pending; calls: string[]; epoch: () => string | null } = {
      records,
      pending,
      calls,
      epoch: () => epoch,
      pendingRecords: limit => [...pending].slice(0, limit).map(id => records.get(id)!),
      applyRemote: incoming => {
        calls.push('apply');
        for (const r of incoming) records.set(r.id, mergeRecord(records.get(r.id), r).record);
      },
      acknowledge: sent => {
        calls.push('ack');
        for (const r of sent) if (JSON.stringify(records.get(r.id)!.clocks) === JSON.stringify(r.clocks)) pending.delete(r.id);
      },
      readCursor: () => 0,
      writeCursor: () => {},
      basesFor: sent => sent.map(r => ({ type: r.type, id: r.id, fields: { body: 'avant' }, clocks: { body: at(1) } })),
      readEpoch: () => epoch,
      writeEpoch: value => {
        epoch = value;
      },
      markAllPending: () => {
        calls.push('resend');
        for (const id of records.keys()) pending.add(id);
      },
    };
    return s;
  }

  it('sends back the server head and run of the last answer, kept as one mark', async () => {
    let cursor = 0;
    let mark: ServerMark | null = null;
    const writes: ServerMark[] = [];
    const phone: SyncStore = {
      ...store([]),
      readCursor: () => cursor,
      writeCursor: next => {
        cursor = next;
      },
      readMark: () => mark,
      writeMark: next => {
        mark = next;
        writes.push(next);
      },
    };
    const requests: SyncRequest[] = [];
    const answers = [
      { records: [], cursor: 7, more: false, serverTime: 0, epoch: 'abcd1234', head: 9, run: 'run00001' },
      { records: [], cursor: 7, more: false, serverTime: 0, epoch: 'abcd1234', head: 9, run: 'run00001' },
    ];
    const transport: SyncTransport = { sync: async request => (requests.push(request), answers.shift()!) };
    await syncOnce(phone, transport, { node: 'phone1' });
    expect(requests[0]).not.toHaveProperty('run');
    expect({ cursor, mark }).toEqual({ cursor: 7, mark: { head: 9, run: 'run00001' } });
    await syncOnce(phone, transport, { node: 'phone1' });
    expect(requests[1]).toMatchObject({ since: 7, head: 9, run: 'run00001' });
    // The same mark again is not written again.
    expect(writes).toHaveLength(1);
    expect(parseSyncRequest({ node: 'phone1', since: 7, head: 9, run: 'run00001' }).request).toMatchObject({ head: 9, run: 'run00001' });
    expect(parseSyncRequest({ node: 'phone1', since: 7, head: 9, run: 'NOT A RUN' }).request).not.toHaveProperty('run');
    expect(parseSyncRequest({ node: 'phone1', since: 7, run: 'run00001' }).request).not.toHaveProperty('run');
    expect(parseSyncResponse({ records: [], cursor: 7, head: 9, run: 'run00001' })).toMatchObject({ head: 9, run: 'run00001' });
  });

  it('acknowledges before merging the answer, sends bases, and learns the epoch without resending', async () => {
    const phone = store([note('n1', { body: 'après' }, at(2))]);
    let sent: unknown = null;
    const transport: SyncTransport = {
      sync: async request => {
        sent = request;
        // The server merged someone else's field into the record: no reason to push it again.
        return { records: [{ ...request.records[0]!, fields: { ...request.records[0]!.fields, pinned: true }, clocks: { ...request.records[0]!.clocks, pinned: at(3, 'web001') } }], cursor: 1, more: false, serverTime: 0, epoch: 'aaaa1111' };
      },
    };
    const outcome = await syncOnce(phone, transport, { node: 'phone1' });
    expect(phone.calls).toEqual(['ack', 'apply']);
    expect(phone.pending.size).toBe(0);
    expect((sent as { bases: unknown[] }).bases).toHaveLength(1);
    expect(phone.epoch()).toBe('aaaa1111');
    expect(outcome.resent).toBe(false);
  });

  it('sends everything again when the server names a new dataset', async () => {
    const phone = store([note('n1', { title: 'a' }, at(2)), note('n2', { title: 'b' }, at(2))]);
    phone.writeEpoch!('aaaa1111');
    phone.pending.clear();
    let pushes = 0;
    const transport: SyncTransport = {
      sync: async request => {
        if (request.records.length > 0) pushes += 1;
        return { records: [], cursor: 0, more: false, serverTime: 0, epoch: 'bbbb2222' };
      },
    };
    const outcome = await syncOnce(phone, transport, { node: 'phone1' });
    expect(outcome.resent).toBe(true);
    expect(phone.calls).toContain('resend');
    expect(pushes).toBe(1);
    expect(phone.pending.size).toBe(0);
    expect(phone.epoch()).toBe('bbbb2222');
  });

  it('caps a push by UTF-8 bytes, not string length', async () => {
    expect(utf8Length('aé€😀')).toBe(1 + 2 + 3 + 4);
    const accented = Array.from({ length: 4 }, (_, i) => note(`n${i}`, { body: 'é'.repeat(190_000) }, at(i + 1)));
    const phone = store(accented);
    phone.basesFor = () => [];
    const bytes: number[] = [];
    const transport: SyncTransport = {
      sync: async request => {
        bytes.push(utf8Length(JSON.stringify(request)));
        return { records: [], cursor: 0, more: false, serverTime: 0 };
      },
    };
    await syncOnce(phone, transport, { node: 'phone1' });
    expect(phone.pending.size).toBe(0);
    expect(Math.max(...bytes)).toBeLessThan(1_000_000);
  });
});

describe('fitting a local write to the schema', () => {
  it('cuts typed text to its limit and leaves out other invalid values, as the server would', () => {
    expect((fitField('note', 'body', 'x'.repeat(250_000)) as string).length).toBe(200_000);
    expect(fitField('note', 'title', 'Courses')).toBe('Courses');
    expect(fitField('note', 'pinned', 'oui')).toBeUndefined();
    expect(fitField('note', 'nope', 1)).toBeUndefined();
  });
});

describe('a caret under an edit from elsewhere', () => {
  it('moves by what changed before it only', () => {
    const before = 'Acheter du pain';
    const after = 'Ne pas oublier : Acheter du pain et du lait';
    expect(mapCaret(before, after, 8)).toBe(8 + 'Ne pas oublier : '.length);
    expect(mapCaret(before, 'Acheter du pain et du lait', 8)).toBe(8);
    expect(mapCaret(before, 'Acheter des croissants', 12)).toBe('Acheter des croissants'.length);
    expect(mapCaret('ab cd', 'ab xy cd', 3)).toBe(3);
  });
});
