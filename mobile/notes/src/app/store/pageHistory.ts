/**
 * Undo and redo inside a page (the top bar's arrows on the phone), as a document editor has them. A step is one
 * batch: going back writes the values its fields had before with a newer clock (an undo is an edit
 * like any other, so it syncs), going forward writes what it wrote again. Typing in one block in
 * a burst is one step. Each step remembers where the caret was before and after it.
 */
import { BLOCK_FIELD_DEFAULTS } from '@unlease/notes/models/blocks';

import { getRecord, writeLocal, type LocalChange } from './libraryStore';

/** Where the caret goes: a block, at a plain-text offset or at its end. */
export interface Caret {
  readonly block: string;
  readonly offset: number | 'end';
}

interface Step {
  readonly before: readonly LocalChange[];
  after: readonly LocalChange[];
  readonly caretBefore: Caret | null;
  caretAfter: Caret | null;
  /** Typing in this block's field (`id field`): what is typed next in it joins this step. */
  readonly typing: string | null;
  at: number;
}

const MAX_STEPS = 300;
/** Typing resumed within this long continues the same step. */
const TYPING_JOIN_MS = 1500;

const undoStacks = new Map<string, Step[]>();
const redoStacks = new Map<string, Step[]>();

const stack = (stacks: Map<string, Step[]>, page: string): Step[] => {
  let list = stacks.get(page);
  if (!list) stacks.set(page, (list = []));
  return list;
};

/** The values these changes are about to overwrite: a record that does not exist yet is taken back by a tombstone. */
function previousValues(changes: readonly LocalChange[], now: number): LocalChange[] {
  return changes.map(change => {
    const record = getRecord(change.type, change.id);
    if (!record) return { type: change.type, id: change.id, patch: { deletedAt: now } };
    const patch: Record<string, unknown> = {};
    for (const field of Object.keys(change.patch)) {
      patch[field] = Object.hasOwn(record.fields, field) ? record.fields[field] : change.type === 'block' ? (BLOCK_FIELD_DEFAULTS[field] ?? null) : null;
    }
    return { type: change.type, id: change.id, patch };
  });
}

function push(page: string, step: Step): void {
  const undo = stack(undoStacks, page);
  undo.push(step);
  if (undo.length > MAX_STEPS) undo.shift();
  redoStacks.delete(page);
}

/** Writes one gesture on a page and keeps the way back. */
export function commit(page: string | null, changes: readonly LocalChange[], carets: { readonly before?: Caret | null; readonly after?: Caret | null } = {}, now: number = Date.now()): void {
  if (changes.length === 0) return;
  const before = page ? previousValues(changes, now) : [];
  writeLocal(changes, now);
  if (page) push(page, { before, after: changes, caretBefore: carets.before ?? null, caretAfter: carets.after ?? null, typing: null, at: now });
}

/** Typing saved in a block's text or caption (already written): joins the step of the burst it continues. */
export function recordTyping(page: string, block: string, field: 'text' | 'caption' | 'drawing', beforeText: string, afterText: string, carets: { readonly before?: Caret | null; readonly after?: Caret | null } = {}, now: number = Date.now()): void {
  if (beforeText === afterText) return;
  const undo = stack(undoStacks, page);
  const last = undo[undo.length - 1];
  const typing = `${block} ${field}`;
  const after: LocalChange[] = [{ type: 'block', id: block, patch: { [field]: afterText } }];
  // Typing just after an undo starts afresh: what was undone stays undone.
  const afterUndo = (redoStacks.get(page)?.length ?? 0) > 0;
  if (last && !afterUndo && last.typing === typing && now - last.at < TYPING_JOIN_MS) {
    last.after = after;
    last.caretAfter = carets.after ?? last.caretAfter;
    last.at = now;
    return;
  }
  push(page, { before: [{ type: 'block', id: block, patch: { [field]: beforeText } }], after, caretBefore: carets.before ?? null, caretAfter: carets.after ?? null, typing, at: now });
}

/** Takes the page's last step back; returns where the caret was before it. */
export function undoPage(page: string, now: number = Date.now()): Caret | null | undefined {
  const step = undoStacks.get(page)?.pop();
  if (!step) return undefined;
  writeLocal(step.before, now);
  stack(redoStacks, page).push(step);
  return step.caretBefore;
}

/** Does again what was just taken back; returns where the caret was after it. */
export function redoPage(page: string, now: number = Date.now()): Caret | null | undefined {
  const step = redoStacks.get(page)?.pop();
  if (!step) return undefined;
  writeLocal(step.after, now);
  stack(undoStacks, page).push({ ...step, typing: null });
  return step.caretAfter;
}

export function canUndo(page: string): boolean {
  return (undoStacks.get(page)?.length ?? 0) > 0;
}

export function canRedo(page: string): boolean {
  return (redoStacks.get(page)?.length ?? 0) > 0;
}

/** Test seam. */
export function resetPageHistory(): void {
  undoStacks.clear();
  redoStacks.clear();
}
