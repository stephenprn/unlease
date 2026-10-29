/**
 * A page's keyboard on the phone, as the web's (`web/notes/src/ui/features/pages/editing.ts`) under a
 * finger: Enter splits a block (a list goes on, an empty item leaves its list, an empty paragraph
 * leaves the item it is in), Backspace at the start turns a block back into a paragraph or joins it
 * to the one above, Markdown typed at a line's start makes the block (« # », « - », « 1. », « [] »,
 * « > », « " », « ``` ») and inline as it closes; « / » and « @ » typed after a space open the
 * insert sheet and the mention search, « [[ » the search for a page to cite.
 */
import type { Block, BlockKind } from '@unlease/notes/models/blocks';
import { deleteRich, inlineShortcut, rangeHas, richLength, richToPlain, serializeRich, setFlag, sliceRich, type FlagMark, type Run } from '@unlease/core/services/richText';
import { mentionLabel } from '@app/hooks/usePages';
import { useLibraryStore } from '@app/store/libraryStore';
import { deleteBlocks, mergeBlocks, outdentBlocks, splitBlock, turnInto } from '@app/store/pages';
import { usePagesUiStore } from '@app/store/pagesUi';

import { editableOutline, flushAll, focusBlock, neighbour, richHandle, setPendingMarks, useEditorStore, type FocusAt, type RichHandle } from './editorStore';
import { OPENING } from './inline';
import { openPageSheet } from './sheetStore';

const state = () => useLibraryStore.getState();
const LIST_KINDS: ReadonlySet<BlockKind> = new Set(['bullet', 'numbered', 'todo']);

/** A line typed as Markdown at a paragraph's start, and the block it asks for. */
const LINE_SHORTCUTS: readonly { readonly pattern: RegExp; readonly kind: BlockKind; readonly checked?: boolean }[] = [
  { pattern: /^####\s$/, kind: 'h4' },
  { pattern: /^###\s$/, kind: 'h3' },
  { pattern: /^##\s$/, kind: 'h2' },
  { pattern: /^#\s$/, kind: 'h1' },
  { pattern: /^[-*+]\s$/, kind: 'bullet' },
  { pattern: /^1[.)]\s$/, kind: 'numbered' },
  { pattern: /^\[\s?\]\s$/, kind: 'todo', checked: false },
  { pattern: /^\[[xX]\]\s$/, kind: 'todo', checked: true },
  { pattern: /^>\s$/, kind: 'toggle' },
  { pattern: /^"\s$/, kind: 'callout' },
];

/** Whether the character at `offset` is code or keys: « [[ » typed there stays text. */
function inCode(runs: readonly Run[], offset: number): boolean {
  const run = sliceRich(runs, offset, offset + 1)[0];
  return run?.kind === 'text' && (!!run.marks.c || !!run.marks.k);
}

/** Under a list item, a toggle or a callout (not straight in a page or a column). */
function nestedInItem(block: Block): boolean {
  const parent = block.parentId ? state().blocks[block.parentId] : undefined;
  return !!parent && parent.kind !== 'page' && parent.kind !== 'column';
}

/** A mark on the selection, or off when all of it already wears it; with nothing selected, on the letters typed next. */
export function toggleFlag(handle: RichHandle, flag: FlagMark): void {
  const runs = handle.runs();
  const { start, end } = handle.selection();
  if (start === end) {
    const pending = useEditorStore.getState().pendingMarks;
    const current = pending ?? {};
    const next: Record<string, unknown> = { ...current };
    if (current[flag]) delete next[flag];
    else next[flag] = true;
    setPendingMarks(next);
    return;
  }
  handle.write(setFlag(runs, start, end, flag, !rangeHas(runs, start, end, flag)), { start, end });
}

/** After each edit in a block (`inserted`: what it typed): the sheets « / », « @ » and « [[ » open, Markdown becomes blocks and marks. */
export function afterTyping(page: string, block: Block, handle: RichHandle, caret: number, inserted?: string): void {
  const runs = handle.runs();
  const plain = richToPlain(runs);
  const typed = plain[caret - 1];
  const before = plain[caret - 2];
  if ((typed === '/' || typed === '@') && (before === undefined || /\s/.test(before))) {
    handle.flush();
    if (typed === '/') openPageSheet({ kind: 'insert', block: block.id, slashAt: caret - 1 });
    else openPageSheet({ kind: 'target', purpose: 'mention', block: block.id, at: caret - 1, typed: '@' });
    return;
  }
  if (inserted === '[' && before === '[' && (caret < 3 || OPENING.test(plain[caret - 3]!)) && !inCode(runs, caret - 1)) {
    handle.flush();
    openPageSheet({ kind: 'target', purpose: 'mention', block: block.id, at: caret - 2, typed: '[[' });
    return;
  }
  if (block.kind === 'text' && typed === '`' && plain.slice(0, caret) === '```') {
    handle.write(deleteRich(runs, 0, caret), null);
    turnInto(page, [block.id], 'code', { language: 'plain', label: mentionLabel });
    focusBlock(block.id, 'start');
    return;
  }
  if (block.kind === 'text' && typed === ' ') {
    const shortcut = LINE_SHORTCUTS.find(entry => entry.pattern.test(plain.slice(0, caret)));
    if (shortcut) {
      handle.write(deleteRich(runs, 0, caret), null);
      turnInto(page, [block.id], shortcut.kind, { label: mentionLabel, ...(shortcut.checked !== undefined ? { checked: shortcut.checked } : {}) });
      focusBlock(block.id, 'start');
      return;
    }
  }
  if (typed === '*' || typed === '~' || typed === '`') {
    const shortcut = inlineShortcut(runs, caret);
    if (shortcut) handle.write(shortcut.runs, { start: shortcut.caret });
  }
}

/**
 * Enter: an empty item leaves its list (or its parent item), an empty paragraph inside an item, a
 * toggle or a callout comes out of it; otherwise the block splits at the caret.
 */
export function enter(page: string, block: Block, handle: RichHandle): void {
  handle.flush();
  const runs = handle.runs();
  const { start, end } = handle.selection();
  if (richLength(runs) === 0 && (LIST_KINDS.has(block.kind) || block.kind === 'toggle' || block.kind === 'callout' || (block.kind === 'text' && nestedInItem(block)))) {
    if (nestedInItem(block)) outdentBlocks(page, [block.id], [block.id], { block: block.id, offset: 0 });
    else turnInto(page, [block.id], 'text', { caret: { block: block.id, offset: 0 } });
    focusBlock(block.id, 'start');
    return;
  }
  const intoChildren = block.kind === 'toggle' && usePagesUiStore.getState().openToggles.has(block.id);
  const head = serializeRich(sliceRich(runs, 0, start));
  const next = splitBlock(page, block.id, head, serializeRich(sliceRich(runs, end)), { intoChildren, caret: { block: block.id, offset: start } });
  // The block keeps what was before the caret: its field shows it at once, before the library answers.
  if (next !== block.id) handle.write(sliceRich(runs, 0, start), null);
  if (next) focusBlock(next, 'start');
}

/** Backspace at a block's start: back to a paragraph, out of its parent item, or into the block above. */
export function backspaceAtStart(page: string, block: Block, handle: RichHandle): void {
  handle.flush();
  if (block.kind !== 'text') {
    turnInto(page, [block.id], 'text', { caret: { block: block.id, offset: 0 } });
    focusBlock(block.id, 'start');
    return;
  }
  if (nestedInItem(block)) {
    outdentBlocks(page, [block.id], [block.id], { block: block.id, offset: 0 });
    focusBlock(block.id, 'start');
    return;
  }
  const previous = neighbour(editableOutline(page), block.id, -1);
  const runs = handle.runs();
  if (!previous) {
    // The first block: an empty one goes and the caret climbs to the title.
    if (richLength(runs) === 0 && (state().blocksByParent[page]?.length ?? 0) > 1) deleteBlocks(page, [block.id]);
    return;
  }
  const previousBlock = state().blocks[previous];
  const previousHandle = richHandle(previous);
  if (!previousHandle || previousBlock?.kind === 'code') {
    // A code block above: an empty paragraph goes, a written one stays; the caret moves up.
    if (richLength(runs) === 0) deleteBlocks(page, [block.id], { block: previous, offset: 'end' });
    focusBlock(previous, 'end');
    return;
  }
  previousHandle.flush();
  const caret = mergeBlocks(page, previous, block.id, serializeRich(runs));
  if (caret) focusBlock(caret.block, caret.offset);
}

/** A block turned into another kind from a sheet, the caret kept in it. */
export function changeKind(page: string, block: Block, kind: BlockKind, caret: FocusAt = 'end'): void {
  flushAll();
  turnInto(page, [block.id], kind, { label: mentionLabel, ...(kind === 'code' ? { language: 'plain' } : {}) });
  if (kind !== 'page') focusBlock(block.id, caret);
}
