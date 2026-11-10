import { describe, expect, it } from 'vitest';

import type { Fields } from '@unlease/core/sync/record';
import {
  EMPTY_HISTORY,
  HISTORY_STEPS,
  TYPING_PAUSE_MS,
  canRedo,
  canUndo,
  keyTyped,
  noteStep,
  recordEdit,
  replayPatch,
  sealTyping,
  travel,
  type EditHistory,
  type EditStep,
  type Written,
} from '../editHistory';
import { bodyFromText, serializeLines } from '../noteBody';

const NOTE = 'n1';

/** A tiny store: records by `type:id`, written as a client's batch would be. */
function store(initial: Record<string, Fields>) {
  const records = new Map(Object.entries(initial));
  const write = (changes: readonly { type: string; id: string; patch: Fields }[]): Written[] =>
    changes.map(change => {
      const key = `${change.type}:${change.id}`;
      const before = records.get(key);
      const after = { ...(before ?? {}), ...change.patch };
      records.set(key, after);
      return { type: change.type, id: change.id, before, after, fields: Object.keys(change.patch) };
    });
  const get = (type: string, id: string): Fields | undefined => records.get(`${type}:${id}`);
  return { write, get, records };
}

const note = (fields: Fields = {}): Fields => ({ kind: 'text', title: '', body: '', rich: false, color: null, pattern: null, labelIds: [], reminderAt: null, contactIds: [], pinned: false, archived: false, ...fields });

/** Records what a batch wrote, as the editor's history does. */
function did(history: EditHistory, written: Written[], at: number): EditHistory {
  const step = noteStep(NOTE, written, at);
  return step ? recordEdit(history, step) : history;
}

/** Takes a step back or forward, writing it into the store. */
function go(history: EditHistory, direction: 'undo' | 'redo', s: ReturnType<typeof store>, now = 9_000): EditHistory {
  return travel(history, direction, (step: EditStep) => {
    const changes = replayPatch(step, direction, s.get, now);
    if (changes.length === 0) return false;
    s.write(changes);
    return true;
  }).history;
}

describe('what a batch did to the open note', () => {
  it('keeps the note’s own fields, its items and photos, and leaves the rest', () => {
    const s = store({ 'note:n1': note(), 'note:n2': note(), 'attachment:p1': { noteId: NOTE, uploaded: false, deletedAt: null } });
    expect(noteStep(NOTE, s.write([{ type: 'note', id: 'n2', patch: { color: 'red' } }]), 1)).toBeNull();
    expect(noteStep(NOTE, s.write([{ type: 'attachment', id: 'p1', patch: { uploaded: true } }]), 1)).toBeNull();
    expect(noteStep(NOTE, s.write([{ type: 'note', id: NOTE, patch: { position: 'a5' } }]), 1)).toBeNull();
    // A field written with the value it had is no change.
    expect(noteStep(NOTE, s.write([{ type: 'note', id: NOTE, patch: { color: null } }]), 1)).toBeNull();
    const step = noteStep(NOTE, s.write([{ type: 'note', id: NOTE, patch: { color: 'red', pattern: 'grid' } }]), 1)!;
    expect(step.edits).toEqual([{ type: 'note', id: NOTE, before: { color: null, pattern: null }, after: { color: 'red', pattern: 'grid' } }]);
    expect(step.typing).toBeNull();
  });

  it('knows an item made by the batch, and typing in one field', () => {
    const s = store({ 'note:n1': note({ kind: 'checklist' }), 'check:c1': { noteId: NOTE, text: 'pain', checked: false, position: 'a0', indent: 0, deletedAt: null } });
    const split = noteStep(NOTE, s.write([
      { type: 'check', id: 'c1', patch: { text: 'pa' } },
      { type: 'check', id: 'c2', patch: { noteId: NOTE, text: 'in', checked: false, position: 'a1', indent: 0, deletedAt: null } },
    ]), 1)!;
    expect(split.typing).toBeNull();
    expect(split.edits[1]).toEqual({ type: 'check', id: 'c2', before: null, after: { deletedAt: null } });
    expect(noteStep(NOTE, s.write([{ type: 'check', id: 'c2', patch: { text: 'ins' } }]), 2)!.typing).toBe('check:c2:text');
    // The body rides with its form, and is still typing while the form stays.
    const body = noteStep(NOTE, s.write([{ type: 'note', id: NOTE, patch: { body: 'abc' } }]), 3)!;
    expect(body.typing).toBe('note:n1:body');
    expect(body.edits[0]!.before).toEqual({ body: '', rich: false });
  });
});

describe('steps of typing', () => {
  it('joins the saves of one field until a pause, a change of field or another change', () => {
    const s = store({ 'note:n1': note() });
    let history = EMPTY_HISTORY;
    history = did(history, s.write([{ type: 'note', id: NOTE, patch: { title: 'Cou' } }]), 100);
    history = keyTyped(history, 300);
    history = did(history, s.write([{ type: 'note', id: NOTE, patch: { title: 'Courses' } }]), 650);
    expect(history.past).toHaveLength(1);
    expect(history.past[0]!.edits[0]).toMatchObject({ before: { title: '' }, after: { title: 'Courses' } });

    // A pause before the next key: a step of its own.
    history = keyTyped(history, 300 + TYPING_PAUSE_MS + 1);
    history = did(history, s.write([{ type: 'note', id: NOTE, patch: { title: 'Courses du samedi' } }]), 2_000);
    expect(history.past).toHaveLength(2);

    // Another field: another step, and so is what follows another change.
    history = did(history, s.write([{ type: 'note', id: NOTE, patch: { body: 'lait' } }]), 2_100);
    history = did(history, s.write([{ type: 'note', id: NOTE, patch: { color: 'blue' } }]), 2_200);
    history = did(history, s.write([{ type: 'note', id: NOTE, patch: { body: 'lait, œufs' } }]), 2_300);
    expect(history.past).toHaveLength(5);

    // Sealed (a format, an undo): the next save starts anew.
    history = sealTyping(history);
    history = did(history, s.write([{ type: 'note', id: NOTE, patch: { body: 'lait, œufs, pain' } }]), 2_400);
    expect(history.past).toHaveLength(6);
    expect(history.started).toBe(true);
  });

  it('keeps the last steps only, and forgets what was undone once something else is done', () => {
    const s = store({ 'note:n1': note() });
    let history = EMPTY_HISTORY;
    for (let k = 0; k < HISTORY_STEPS + 5; k += 1) history = did(history, s.write([{ type: 'note', id: NOTE, patch: { pinned: k % 2 === 0 } }]), k);
    expect(history.past).toHaveLength(HISTORY_STEPS);
    history = go(history, 'undo', s);
    expect(canRedo(history)).toBe(true);
    history = did(history, s.write([{ type: 'note', id: NOTE, patch: { color: 'red' } }]), 500);
    expect(canRedo(history)).toBe(false);
  });

  it('takes photos added in one gesture as one step', () => {
    const s = store({ 'note:n1': note() });
    const photo = (id: string) => ({ type: 'attachment', id, patch: { noteId: NOTE, uploaded: false, deletedAt: null } });
    let history = did(EMPTY_HISTORY, s.write([photo('p1')]), 50);
    history = did(history, s.write([photo('p2')]), 50);
    history = did(history, s.write([photo('p3')]), 80);
    expect(history.past.map(step => step.edits.length)).toEqual([2, 1]);
  });
});

describe('a step back and forward again', () => {
  it('writes the old values, then the new ones', () => {
    const s = store({ 'note:n1': note({ color: 'yellow', labelIds: ['l1'] }) });
    let history = did(EMPTY_HISTORY, s.write([{ type: 'note', id: NOTE, patch: { color: 'aube', labelIds: ['l1', 'l2'] } }]), 1);
    history = go(history, 'undo', s);
    expect(s.get('note', NOTE)).toMatchObject({ color: 'yellow', labelIds: ['l1'] });
    expect(canUndo(history)).toBe(false);
    history = go(history, 'redo', s);
    expect(s.get('note', NOTE)).toMatchObject({ color: 'aube', labelIds: ['l1', 'l2'] });
    expect(canRedo(history)).toBe(false);
  });

  it('keeps the words another device added since, and leaves out what is already so', () => {
    const s = store({ 'note:n1': note({ title: 'Courses' }) });
    const history = did(EMPTY_HISTORY, s.write([{ type: 'note', id: NOTE, patch: { title: 'Courses samedi' } }]), 1);
    // Another device wrote at the title's start meanwhile.
    s.write([{ type: 'note', id: NOTE, patch: { title: 'Grandes Courses samedi' } }]);
    go(history, 'undo', s);
    expect(s.get('note', NOTE)!.title).toBe('Grandes Courses');
    expect(replayPatch(history.past[0]!, 'undo', s.get, 1)).toEqual([]);
  });

  it('puts an item the step made on its tombstone, and brings it back', () => {
    const s = store({ 'note:n1': note({ kind: 'checklist' }), 'check:c1': { noteId: NOTE, text: 'painlait', checked: false, position: 'a0', indent: 0, deletedAt: null } });
    let history = did(EMPTY_HISTORY, s.write([
      { type: 'check', id: 'c1', patch: { text: 'pain' } },
      { type: 'check', id: 'c2', patch: { noteId: NOTE, text: 'lait', checked: false, position: 'a1', indent: 0, deletedAt: null } },
    ]), 1);
    history = go(history, 'undo', s, 7_000);
    expect(s.get('check', 'c1')!.text).toBe('painlait');
    expect(s.get('check', 'c2')!.deletedAt).toBe(7_000);
    go(history, 'redo', s);
    expect(s.get('check', 'c1')!.text).toBe('pain');
    expect(s.get('check', 'c2')!.deletedAt).toBeNull();
  });

  it('keeps a note formatted once it is: its old words come back in the formatted form', () => {
    // Plain words a « # » starts, then the first mark: the note is formatted.
    const s = store({ 'note:n1': note({ body: '# pas un titre' }) });
    const formatted = serializeLines([{ heading: 0, runs: [{ kind: 'text', text: '# pas un ', marks: {} }, { kind: 'text', text: 'titre', marks: { b: true } }] }]);
    let history = did(EMPTY_HISTORY, s.write([{ type: 'note', id: NOTE, patch: { body: formatted, rich: true } }]), 1);
    expect(history.past[0]!.typing).toBeNull();
    history = go(history, 'undo', s);
    expect(s.get('note', NOTE)).toMatchObject({ rich: true, body: bodyFromText('# pas un titre', true) });
    go(history, 'redo', s);
    expect(s.get('note', NOTE)).toMatchObject({ rich: true, body: formatted });
  });

  it('drops a step another device already took back, and takes the one before', () => {
    const s = store({ 'note:n1': note() });
    let history = did(EMPTY_HISTORY, s.write([{ type: 'note', id: NOTE, patch: { pinned: true } }]), 1);
    history = did(history, s.write([{ type: 'note', id: NOTE, patch: { color: 'red' } }]), 2);
    s.write([{ type: 'note', id: NOTE, patch: { color: null } }]);
    history = go(history, 'undo', s);
    expect(s.get('note', NOTE)!.pinned).toBe(false);
    expect(history.past).toHaveLength(0);
    expect(history.future).toHaveLength(1);
  });
});
