/**
 * The note editor's « Annuler » and « Rétablir »: what each action of one editing session wrote to
 * the note, its checklist's items and its photos, as steps to take back and do again. The history
 * lives as long as the note is open; it is never synced. Each client hands it what a batch wrote
 * (`noteStep`), and writes a step back through one batch of its own (`replayPatch`): the old values
 * (or the new ones) under a fresh clock, so a step back syncs and merges like any edit.
 *
 * Typed text is a step per stretch of typing in one field, not a step per letter: the saves of a
 * field join the step typing in it until a pause (`TYPING_PAUSE_MS` between two keys, told by
 * `keyTyped`), a change of field, another kind of change, or an undo (`sealTyping`). A step back
 * merges typed text with what came from elsewhere since (`mergeField`, as `saveTypedText` does), so
 * the words another device added stay. A formatted body never goes back to plain: the old words
 * come back in the formatted form. An item or a photo the step made goes to its tombstone, and comes
 * back from it; photos added in one gesture (one pick, one drop: the same time) are one step.
 */
import type { Fields } from '@unlease/core/sync/record';
import { recordTypeSpec } from '@unlease/core/sync/schema';
import { mergeField } from '@unlease/core/sync/textMerge';

import '../sync/types';
import { bodyFromText, linesText, noteLines } from './noteBody';

/** Two keys further apart than this: the typing after the pause is a step of its own. */
export const TYPING_PAUSE_MS = 1000;
/** The steps an editing session keeps; the oldest go first. */
export const HISTORY_STEPS = 100;

/** What the editor changes of each record it shows: the note, its items, its photos. */
const TRACKED: Readonly<Record<string, readonly string[]>> = {
  note: ['title', 'body', 'rich', 'kind', 'color', 'pattern', 'labelIds', 'reminderAt', 'contactIds', 'pinned', 'archived'],
  check: ['text', 'checked', 'position', 'indent', 'deletedAt'],
  attachment: ['deletedAt'],
};

/** What one write did to one record. */
export interface Written {
  readonly type: string;
  readonly id: string;
  /** The record's fields before the write; undefined when the write made it. */
  readonly before: Fields | undefined;
  /** Its fields after. */
  readonly after: Fields;
  /** The fields the write set. */
  readonly fields: readonly string[];
}

/** One record's part of a step: the fields it changed, as they were and as they became. */
export interface RecordEdit {
  readonly type: string;
  readonly id: string;
  /** The fields as they were; null when the step made the record (an item, a photo). */
  readonly before: Fields | null;
  readonly after: Fields;
}

export interface EditStep {
  readonly edits: readonly RecordEdit[];
  /** Typing in one field (`type:id:field`): what is typed next in it joins the step, until a pause. */
  readonly typing: string | null;
  /** Photos added: those added in the same gesture (the same time) join it. */
  readonly photos: boolean;
  /** When its last write was made. */
  readonly at: number;
}

export interface EditHistory {
  readonly past: readonly EditStep[];
  readonly future: readonly EditStep[];
  /** The typing step is over (a pause, a format, an undo): the next save of typed text starts its own. */
  readonly sealed: boolean;
  /** When the last key was typed in the note. */
  readonly keyAt: number;
  /** Something was done in this session (the bar shows « Annuler » and « Rétablir » from then on). */
  readonly started: boolean;
}

export const EMPTY_HISTORY: EditHistory = { past: [], future: [], sealed: false, keyAt: 0, started: false };

/** A change to write back: a record and the fields to set. */
export interface ReplayChange {
  readonly type: string;
  readonly id: string;
  readonly patch: Fields;
}

export type Direction = 'undo' | 'redo';

function same(a: unknown, b: unknown): boolean {
  if (a === b || ((a === null || a === undefined) && (b === null || b === undefined))) return true;
  return typeof a === 'object' && typeof b === 'object' && a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
}

/** A field the record never had reads as its type's default (a field written only once used). */
function valueOf(fields: Fields, type: string, field: string): unknown {
  if (Object.hasOwn(fields, field) && fields[field] !== undefined) return fields[field];
  const defaults = recordTypeSpec(type)?.defaults;
  return defaults && Object.hasOwn(defaults, field) ? defaults[field] : null;
}

/** Typed text, merged rather than overwritten: a note's title and body, an item's text. */
function isTyped(type: string, field: string): boolean {
  const merged = recordTypeSpec(type)?.merged;
  return field !== 'drawing' && !!merged && Object.hasOwn(merged, field);
}

function belongs(noteId: string, written: Written): boolean {
  if (written.type === 'note') return written.id === noteId;
  if (written.type !== 'check' && written.type !== 'attachment') return false;
  return written.after.noteId === noteId || written.before?.noteId === noteId;
}

/** The fields that differ between two sides of an edit (`rich` rides with the body only when it changed). */
function changedFields(edit: RecordEdit): string[] {
  if (edit.before === null) return ['deletedAt'];
  return Object.keys(edit.after).filter(field => !same(edit.before![field], edit.after[field]));
}

/**
 * What one batch did to the note open in the editor: its own fields, its items' and its photos'
 * that the editor changes, or null when the batch touched none of them (a photo marked uploaded,
 * another note).
 */
export function noteStep(noteId: string, written: readonly Written[], at: number): EditStep | null {
  const edits = new Map<string, RecordEdit>();
  for (const entry of written) {
    const tracked = TRACKED[entry.type];
    if (!tracked || !belongs(noteId, entry)) continue;
    const key = `${entry.type}:${entry.id}`;
    const known = edits.get(key);
    if (!entry.before) {
      // Made by this batch: an item, a photo (the note itself is made before it opens).
      if (entry.type === 'note') continue;
      edits.set(key, { type: entry.type, id: entry.id, before: null, after: { deletedAt: entry.after.deletedAt ?? null } });
      continue;
    }
    const fields = entry.fields.filter(field => tracked.includes(field) && !same(valueOf(entry.before!, entry.type, field), valueOf(entry.after, entry.type, field)));
    if (fields.length === 0) continue;
    // The body is read in its form: the form rides with it, changed or not.
    if (entry.type === 'note' && fields.includes('body') && !fields.includes('rich')) fields.push('rich');
    const before: Fields = { ...(known?.before ?? {}) };
    const after: Fields = { ...(known?.after ?? {}) };
    for (const field of fields) {
      if (!Object.hasOwn(before, field)) before[field] = valueOf(entry.before, entry.type, field);
      after[field] = valueOf(entry.after, entry.type, field);
    }
    edits.set(key, { type: entry.type, id: entry.id, before: known && known.before === null ? null : before, after });
  }
  const list = [...edits.values()].filter(edit => changedFields(edit).length > 0);
  if (list.length === 0) return null;
  const only = list.length === 1 ? list[0]! : null;
  const changed = only ? changedFields(only) : [];
  const typing = only && only.before !== null && changed.length === 1 && isTyped(only.type, changed[0]!) ? `${only.type}:${only.id}:${changed[0]}` : null;
  const photos = list.every(edit => edit.type === 'attachment' && edit.before === null);
  return { edits: list, typing, photos, at };
}

/** Two steps as one: the first's old values, the second's new ones. */
function joinSteps(first: EditStep, second: EditStep): EditStep {
  const edits = new Map<string, RecordEdit>(first.edits.map(edit => [`${edit.type}:${edit.id}`, edit]));
  for (const edit of second.edits) {
    const key = `${edit.type}:${edit.id}`;
    const known = edits.get(key);
    if (!known) {
      edits.set(key, edit);
      continue;
    }
    const before = known.before === null ? null : { ...(edit.before ?? {}), ...known.before };
    edits.set(key, { type: edit.type, id: edit.id, before, after: { ...known.after, ...edit.after } });
  }
  return { edits: [...edits.values()], typing: second.typing, photos: first.photos && second.photos, at: second.at };
}

/** A step done: it joins the typing (or the photos) of the last one, or comes after it; what was undone is gone. */
export function recordEdit(history: EditHistory, step: EditStep): EditHistory {
  const last = history.past[history.past.length - 1];
  const joins = !!last && ((step.typing !== null && step.typing === last.typing && !history.sealed) || (step.photos && last.photos && step.at === last.at));
  const past = joins ? [...history.past.slice(0, -1), joinSteps(last!, step)] : [...history.past, step].slice(-HISTORY_STEPS);
  return { ...history, past, future: [], sealed: false, started: true };
}

/** A key typed in one of the note's fields: after a pause, what is typed is a step of its own. */
export function keyTyped(history: EditHistory, at: number): EditHistory {
  return { ...history, keyAt: at, sealed: history.sealed || at - history.keyAt > TYPING_PAUSE_MS };
}

/** The typing step ends here (a format, a mention, the caret moved): what is typed next is a step of its own. */
export function sealTyping(history: EditHistory): EditHistory {
  return history.sealed ? history : { ...history, sealed: true };
}

export function canUndo(history: EditHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: EditHistory): boolean {
  return history.future.length > 0;
}

/**
 * One step back (or forward again): `apply` writes it and says whether it had anything to write. A
 * step with nothing left to do (another device undid it already) is dropped and the next one taken,
 * so a press never seems to do nothing while something remains.
 */
export function travel(history: EditHistory, direction: Direction, apply: (step: EditStep) => boolean): { readonly history: EditHistory; readonly moved: boolean } {
  let past = [...history.past];
  let future = [...history.future];
  for (;;) {
    const from = direction === 'undo' ? past : future;
    const step = from.pop();
    if (!step) return { history: { ...history, past, future, sealed: true }, moved: false };
    if (!apply(step)) continue;
    if (direction === 'undo') future = [...future, step];
    else past = [...past, step];
    return { history: { ...history, past, future, sealed: true }, moved: true };
  }
}

/** Typed text taken from `from` to `to`, with what landed meanwhile (`stored`) merged in. */
function typedValue(type: string, field: string, from: unknown, to: unknown, stored: unknown): string {
  const target = typeof to === 'string' ? to : '';
  const base = typeof from === 'string' ? from : '';
  const now = typeof stored === 'string' ? stored : '';
  return now === base || now === target ? target : mergeField(type, field, base, target, now, false);
}

/**
 * The writes that take a step back (`undo`: its old values) or do it again (`redo`: its new ones),
 * over the records as they stand now (`current`): typed text merged with what came since, fields
 * already so left out, an item or a photo the step made put on its tombstone (and back). A
 * formatted note stays formatted: plain words come back in the formatted form. Empty when there is
 * nothing left to write.
 */
export function replayPatch(step: EditStep, direction: Direction, current: (type: string, id: string) => Fields | undefined, now: number): ReplayChange[] {
  const changes: ReplayChange[] = [];
  for (const edit of step.edits) {
    const stored = current(edit.type, edit.id);
    if (!stored) continue;
    if (edit.before === null) {
      const deletedAt = direction === 'undo' ? now : (edit.after.deletedAt ?? null);
      if ((deletedAt === null) !== (stored.deletedAt === null || stored.deletedAt === undefined)) changes.push({ type: edit.type, id: edit.id, patch: { deletedAt } });
      continue;
    }
    const from = direction === 'undo' ? edit.after : edit.before;
    const to = direction === 'undo' ? edit.before : edit.after;
    const patch: Fields = {};
    // Once formatted, a note stays so: a step back to plain words writes them in the formatted form.
    const rich = stored.rich === true || (to.rich === true && Object.hasOwn(to, 'rich'));
    if (edit.type === 'note' && rich && stored.rich !== true) patch.rich = true;
    for (const field of Object.keys(to)) {
      if (edit.type === 'note' && field === 'rich') continue;
      let value: unknown;
      if (edit.type === 'note' && field === 'body') {
        const inForm = (body: unknown, wasRich: unknown): string => {
          const text = typeof body === 'string' ? body : '';
          const formatted = wasRich === undefined ? stored.rich === true : wasRich === true;
          return formatted === rich ? text : rich ? bodyFromText(text, true) : linesText(noteLines(text, true));
        };
        value = typedValue('note', 'body', inForm(from.body, from.rich), inForm(to.body, to.rich), stored.body);
      } else if (isTyped(edit.type, field)) {
        value = typedValue(edit.type, field, from[field], to[field], stored[field]);
      } else {
        value = to[field] ?? null;
      }
      if (!same(value, stored[field])) patch[field] = value;
    }
    if (Object.keys(patch).length > 0) changes.push({ type: edit.type, id: edit.id, patch });
  }
  return changes;
}
