/**
 * Checklist gestures a keyboard makes possible: splitting an item at the
 * caret, merging it into the one above, pasting several lines. Each is one
 * `writeLocal` batch, so one gesture is one clock, as every phone action is;
 * the positions come from the same fractional keys the phone's `addCheck`
 * uses, so the order syncs the same way.
 */
import { placeAt } from '@unlease/core/services/fractionalIndex';
import { createId } from '@unlease/core/services/ids';
import { checkFields } from '@unlease/notes/sync/entities';

import { useLibraryStore, writeLocal, type LocalChange } from './library';

const state = () => useLibraryStore.getState();

/** A checklist's items in order, as `placeAt` reads them, without `except`. */
export function checkSiblings(noteId: string, except: string | null = null) {
  const { checks, checksByNote } = state();
  return (checksByNote[noteId] ?? []).flatMap(cid => {
    const item = checks[cid];
    return cid !== except && item ? [item] : [];
  });
}

/** Keys for `count` new items right after `id` (checked or not), and the items tied with it moved out of the way. */
export function placeAfterCheck(noteId: string, id: string | null, count = 1): { positions: string[]; changes: LocalChange[] } {
  const siblings = checkSiblings(noteId);
  const index = id === null ? 0 : siblings.findIndex(item => item.id === id) + 1;
  const { positions, moved } = placeAt(siblings, index, count);
  return { positions, changes: moved.map(item => ({ type: 'check' as const, id: item.id, patch: { position: item.position } })) };
}

/**
 * Enter inside an item: the text before the caret stays, the rest becomes a
 * new item right after it. `text` is what the field holds now (it may be ahead
 * of the store while typing). Returns the new item's id.
 */
export function splitCheck(id: string, text: string, caret: number, now: number = Date.now()): string | null {
  const item = state().checks[id];
  if (!item) return null;
  const newId = createId(now);
  const placed = placeAfterCheck(item.noteId, id);
  writeLocal(
    [
      { type: 'check', id, patch: { text: text.slice(0, caret) } },
      {
        type: 'check',
        id: newId,
        patch: checkFields({
          noteId: item.noteId,
          text: text.slice(caret),
          checked: false,
          position: placed.positions[0]!,
          indent: item.indent,
          createdAt: now,
          deletedAt: null,
        }),
      },
      ...placed.changes,
    ],
    now,
  );
  return newId;
}

/** Backspace at the start of an item: its text joins the item above, and it goes. */
export function mergeIntoPrevious(previousId: string, id: string, text: string, now: number = Date.now()): number {
  const previous = state().checks[previousId];
  if (!previous) return 0;
  writeLocal(
    [
      { type: 'check', id: previousId, patch: { text: previous.text + text } },
      { type: 'check', id, patch: { deletedAt: now } },
    ],
    now,
  );
  return previous.text.length;
}

/**
 * A paste of several lines into an item: the first line goes in at the caret,
 * each other line becomes an item after it, and what followed the caret ends
 * the last one. Returns the ids of the new items, in order.
 */
export function pasteLines(id: string, text: string, start: number, end: number, lines: readonly string[], now: number = Date.now()): string[] {
  const item = state().checks[id];
  if (!item || lines.length === 0) return [];
  const before = text.slice(0, start);
  const after = text.slice(end);
  if (lines.length === 1) {
    writeLocal([{ type: 'check', id, patch: { text: `${before}${lines[0]}${after}` } }], now);
    return [];
  }
  const rest = lines.slice(1);
  const placed = placeAfterCheck(item.noteId, id, rest.length);
  const keys = placed.positions;
  const ids = rest.map(() => createId(now));
  const changes: LocalChange[] = [{ type: 'check', id, patch: { text: `${before}${lines[0]}` } }];
  rest.forEach((line, index) => {
    const last = index === rest.length - 1;
    changes.push({
      type: 'check',
      id: ids[index]!,
      patch: checkFields({
        noteId: item.noteId,
        text: (last ? `${line}${after}` : line).slice(0, 5000),
        checked: false,
        position: keys[index]!,
        indent: item.indent,
        createdAt: now,
        deletedAt: null,
      }),
    });
  });
  changes.push(...placed.changes);
  writeLocal(changes, now);
  return ids;
}

const BULLET = /^\s*(?:[-*•–]|\[[ xX]?\]|☐|☑)\s+/;

/**
 * The lines a paste brings. The first goes in at the caret as it is (even
 * empty: a paste that starts with a line break ends the item there); the
 * others lose their list bullets and blank ones are dropped.
 */
export function splitPastedLines(text: string): string[] {
  const [first = '', ...rest] = text.split(/\r?\n/);
  return [
    first.replace(BULLET, ''),
    ...rest.map(line => line.replace(BULLET, '').trim()).filter(line => line.length > 0),
  ];
}
