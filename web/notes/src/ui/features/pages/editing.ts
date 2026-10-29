/**
 * The keyboard in a page, as Notion has it. In a block's text: Enter splits it (a list goes on, an
 * empty item leaves its list, an empty paragraph leaves the item it is in), Backspace at the start
 * turns it back into a paragraph or joins it to the one above, Tab nests it, the arrows leave it at
 * its first and last line, Ctrl+B/I/U/E and Ctrl+Maj+S set marks, Ctrl+K a link, Ctrl+Z undoes,
 * Échap selects the block. Markdown typed at a line's start makes the block (« # », « - », « 1. »,
 * « [] », « > », « " », « ``` »), and inline as it closes. « / » and « @ » typed after a space
 * open their menu; a space right after them closes it. « [[ » cites a page, « : » and a word offer
 * emojis. Enter on a date chosen alone opens its editor. With blocks selected: the arrows move the
 * selection, Enter writes (in the block, or in a new paragraph after one with no text; into a table
 * of contents' entries), Suppr deletes, Ctrl+C, X and D copy, cut and duplicate.
 */
import type { KeyboardEvent } from 'react';

import type { Block, BlockKind } from '@unlease/notes/models/blocks';
import { deleteRich, inlineShortcut, rangeHas, richLength, richToPlain, serializeRich, setFlag, sliceRich, type FlagMark } from '@unlease/core/services/richText';
import { isInBin } from '@unlease/notes/services/blocks';

import { mentionLabel } from '../../../app/hooks/usePages';
import { useLibraryStore } from '../../../app/store/library';
import { redoPage, undoPage } from '../../../app/store/pageHistory';
import { deleteBlocks, duplicateBlocks, indentBlocks, insertAfter, mergeBlocks, nudgeBlocks, outdentBlocks, splitBlock, turnInto, updateBlock } from '../../../app/store/pages';
import { setToggleOpen, usePagesUiStore } from '../../../app/store/pagesUi';
import { navigate, paths } from '../../router';
import { openDateEditor } from './DateEditor';
import {
  clearBlockSelection,
  editableOutline,
  editorRoot,
  editorState,
  emojiDeclined,
  flushAll,
  focusBlock,
  menuKey,
  neighbour,
  richHandle,
  selectableOutline,
  selectBlocks,
  setMenu,
  type FocusAt,
  type MenuState,
  type RichHandle,
} from './editorStore';
import { loadEmojiCatalogue } from './emojiSearch';
import { openFormat } from './formatState';
import { caretOnEdgeLine, caretRect, selectionOffsets } from './richDom';
import { openDrawingEditor } from '../drawing/DrawingBlock';

const state = () => useLibraryStore.getState();
const LIST_KINDS: ReadonlySet<BlockKind> = new Set(['bullet', 'numbered', 'todo']);
const FLAG_KEYS: Readonly<Record<string, FlagMark>> = { b: 'b', i: 'i', u: 'u', e: 'c' };

/** The sign each menu typed in the text opens on. */
const SIGNS: Readonly<Record<Exclude<MenuState['kind'], 'target'>, string>> = { slash: '/', mention: '@', cite: '[[', emoji: ':' };
/** What may stand before « [[ » or « : »: a space or an opening sign (the line's start too). */
const OPENING = /[\s([{«"'“‘]/;
/** An emoji's word right before the caret: « : » at an opening, then two letters at least. */
const EMOJI_WORD = /(?:^|[\s([{«"'“‘]):(\p{L}{2}[\p{L}\p{N}_+-]*)$/u;
/** What an emoji's word may hold as it is typed on. */
const EMOJI_QUERY = /^\p{L}{2}[\p{L}\p{N}_+-]*$/u;

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

export const isMod = (event: { readonly metaKey: boolean; readonly ctrlKey: boolean }): boolean => event.metaKey || event.ctrlKey;

/** The caret (or selection) of a block's editable as offsets; its end when it has none. */
export function caretOf(handle: RichHandle): { readonly start: number; readonly end: number } {
  const selection = selectionOffsets(handle.element);
  if (selection) return selection;
  const length = richLength(handle.runs());
  return { start: length, end: length };
}

/** Under a list item, a toggle or a callout (not straight in a page or a column). */
function nestedInItem(block: Block): boolean {
  const parent = block.parentId ? state().blocks[block.parentId] : undefined;
  return !!parent && parent.kind !== 'page' && parent.kind !== 'column';
}

/** The caret into the block before or after this one in the page (`step`), if there is one. */
function focusNeighbour(id: string, step: -1 | 1, at: FocusAt): boolean {
  const next = neighbour(editableOutline(), id, step);
  if (!next) return false;
  focusBlock(next, at);
  return true;
}

/** Ctrl+Z, Ctrl+Maj+Z, Ctrl+Y, anywhere in the page. */
export function historyKey(event: KeyboardEvent, page: string): boolean {
  if (!isMod(event) || event.altKey) return false;
  const key = event.key.toLowerCase();
  if (key !== 'z' && key !== 'y') return false;
  event.preventDefault();
  flushAll();
  const caret = (key === 'z' && event.shiftKey) || key === 'y' ? redoPage(page) : undoPage(page);
  if (caret) focusBlock(caret.block, caret.offset);
  return true;
}

/** A mark on the selection, or off when all of it already wears it. */
export function toggleFlag(handle: RichHandle, flag: FlagMark): void {
  const runs = handle.runs();
  const { start, end } = caretOf(handle);
  if (start === end) return;
  handle.write(setFlag(runs, start, end, flag, !rangeHas(runs, start, end, flag)), { start, end });
}

/** After each input in a block: the open menu follows what is typed; Markdown becomes blocks and marks. */
export function afterTyping(page: string, block: Block, handle: RichHandle): void {
  const runs = handle.runs();
  const caret = selectionOffsets(handle.element);
  if (!caret || caret.start !== caret.end) return;
  const at = caret.start;
  const plain = richToPlain(runs);
  const menu = editorState().menu;
  if (menu && menu.kind !== 'target' && menu.block === block.id) {
    const sign = SIGNS[menu.kind];
    const query = plain.slice(menu.start + sign.length, at);
    // A space right after the sign: it was only a « / », an « @ » or a « [[ » in the sentence. An emoji's word ends at anything but a letter.
    const gone =
      at < menu.start + sign.length ||
      plain.slice(menu.start, menu.start + sign.length) !== sign ||
      /^\s/.test(query) ||
      query.includes('\n') ||
      query.length > 40 ||
      /\s\s/.test(query) ||
      (menu.kind === 'emoji' && !EMOJI_QUERY.test(query));
    if (gone) setMenu(null);
    else if (query !== menu.query) setMenu({ ...menu, query });
    return;
  }
  const typed = plain[at - 1];
  const before = plain[at - 2];
  if ((typed === '/' || typed === '@') && (before === undefined || /\s/.test(before))) {
    setMenu({ kind: typed === '/' ? 'slash' : 'mention', block: block.id, start: at - 1, query: '' });
    return;
  }
  if (typed === '[' && before === '[' && (at < 3 || OPENING.test(plain[at - 3]!))) {
    setMenu({ kind: 'cite', block: block.id, start: at - 2, query: '' });
    return;
  }
  const word = typed && /[\p{L}\p{N}_+-]/u.test(typed) ? EMOJI_WORD.exec(plain.slice(0, at)) : null;
  if (word && !emojiDeclined(block.id, at - word[1]!.length - 1)) {
    // The catalogue comes with the first word typed; the menu shows once it is here.
    loadEmojiCatalogue().catch(() => undefined);
    setMenu({ kind: 'emoji', block: block.id, start: at - word[1]!.length - 1, query: word[1]! });
    return;
  }
  if (block.kind === 'text' && typed === '`' && plain.slice(0, at) === '```') {
    handle.write(deleteRich(runs, 0, at), null);
    turnInto(page, [block.id], 'code', { language: 'plain', label: mentionLabel });
    focusBlock(block.id, 'start');
    return;
  }
  if (block.kind === 'text' && typed === ' ') {
    const shortcut = LINE_SHORTCUTS.find(entry => entry.pattern.test(plain.slice(0, at)));
    if (shortcut) {
      handle.write(deleteRich(runs, 0, at), null);
      turnInto(page, [block.id], shortcut.kind, { label: mentionLabel, ...(shortcut.checked !== undefined ? { checked: shortcut.checked } : {}) });
      focusBlock(block.id, 'start');
      return;
    }
  }
  if (typed === '*' || typed === '~' || typed === '`') {
    const shortcut = inlineShortcut(runs, at);
    if (!shortcut) return;
    handle.write(shortcut.runs, { start: shortcut.caret });
    handle.leaveMark();
  }
}

/**
 * Enter: an empty item leaves its list (or its parent item), an empty paragraph inside an item, a
 * toggle or a callout comes out of it; otherwise the block splits at the caret.
 */
function enter(page: string, block: Block, handle: RichHandle): void {
  handle.flush();
  const runs = handle.runs();
  const { start, end } = caretOf(handle);
  if (richLength(runs) === 0 && (LIST_KINDS.has(block.kind) || block.kind === 'toggle' || block.kind === 'callout' || (block.kind === 'text' && nestedInItem(block)))) {
    if (nestedInItem(block)) outdentBlocks(page, [block.id], [block.id], { block: block.id, offset: 0 });
    else turnInto(page, [block.id], 'text', { caret: { block: block.id, offset: 0 } });
    focusBlock(block.id, 'start');
    return;
  }
  const intoChildren = block.kind === 'toggle' && usePagesUiStore.getState().openToggles.has(block.id);
  const next = splitBlock(page, block.id, serializeRich(sliceRich(runs, 0, start)), serializeRich(sliceRich(runs, end)), { intoChildren, caret: { block: block.id, offset: start } });
  if (next) focusBlock(next, 'start');
}

/** Backspace at a block's start: back to a paragraph, out of its parent item, or into the block above. */
function backspaceAtStart(page: string, block: Block, handle: RichHandle): boolean {
  handle.flush();
  if (block.kind !== 'text') {
    turnInto(page, [block.id], 'text', { caret: { block: block.id, offset: 0 } });
    focusBlock(block.id, 'start');
    return true;
  }
  if (nestedInItem(block)) {
    outdentBlocks(page, [block.id], [block.id], { block: block.id, offset: 0 });
    focusBlock(block.id, 'start');
    return true;
  }
  const previous = neighbour(editableOutline(), block.id, -1);
  if (!previous) return false;
  const runs = handle.runs();
  const previousHandle = richHandle(previous);
  if (!previousHandle) {
    // The title or a code block above: an empty paragraph goes, a written one stays; the caret moves up.
    if (richLength(runs) === 0) deleteBlocks(page, [block.id], { block: previous, offset: 'end' });
    focusBlock(previous, 'end');
    return true;
  }
  previousHandle.flush();
  const caret = mergeBlocks(page, previous, block.id, serializeRich(runs));
  if (caret) focusBlock(caret.block, caret.offset);
  return true;
}

/** Suppr at a block's end: the next block's text joins this one. */
function deleteAtEnd(page: string, block: Block, handle: RichHandle): boolean {
  const next = neighbour(editableOutline(), block.id, 1);
  const nextHandle = next ? richHandle(next) : undefined;
  if (!next || !nextHandle) return false;
  handle.flush();
  nextHandle.flush();
  const caret = mergeBlocks(page, block.id, next, serializeRich(nextHandle.runs()));
  if (caret) focusBlock(caret.block, caret.offset);
  return true;
}

/** Keys in a block's text; an open menu takes them first. */
export function richKey(event: KeyboardEvent<HTMLElement>, page: string, block: Block, handle: RichHandle): void {
  if (editorState().menu) {
    if (menuKey(event)) return;
    // Nothing in the menu to pick: Enter is the text's again, and the menu goes.
    if (event.key === 'Enter') setMenu(null);
  }
  if (historyKey(event, page)) return;
  const key = event.key;
  const lower = key.toLowerCase();
  if (isMod(event) && !event.altKey) {
    const flag = FLAG_KEYS[lower];
    if (flag && !event.shiftKey) {
      event.preventDefault();
      toggleFlag(handle, flag);
    } else if (lower === 's' && event.shiftKey) {
      event.preventDefault();
      toggleFlag(handle, 's');
    } else if (lower === 'k' && !event.shiftKey) {
      event.preventDefault();
      const caret = caretOf(handle);
      if (caret.start !== caret.end) openFormat({ block: block.id, start: caret.start, end: caret.end, link: true });
    } else if ((key === 'ArrowUp' || key === 'ArrowDown') && event.shiftKey) {
      event.preventDefault();
      handle.flush();
      const caret = caretOf(handle);
      if (nudgeBlocks(page, [block.id], key === 'ArrowUp' ? -1 : 1, selectableOutline())) focusBlock(block.id, caret.start);
    } else if (key === 'Enter') {
      event.preventDefault();
      handle.flush();
      if (block.kind === 'todo') updateBlock(page, block.id, { checked: !block.checked });
      else if (block.kind === 'toggle') setToggleOpen(block.id, !usePagesUiStore.getState().openToggles.has(block.id));
    } else if (lower === 'd' && !event.shiftKey) {
      event.preventDefault();
      handle.flush();
      const [copy] = duplicateBlocks(page, [block.id], selectableOutline());
      if (copy) focusBlock(copy, 'end');
    } else if (lower === 'a' && !event.shiftKey) {
      const caret = caretOf(handle);
      // The whole block already selected: the second press selects every block.
      if (caret.start === 0 && caret.end === richLength(handle.runs())) {
        event.preventDefault();
        handle.flush();
        selectBlocks(selectableOutline());
        editorRoot()?.focus({ preventScroll: true });
      }
    }
    return;
  }
  if (event.altKey) return;
  switch (key) {
    case 'Enter': {
      event.preventDefault();
      if (event.shiftKey) {
        document.execCommand('insertText', false, '\n');
        return;
      }
      // A date chosen alone (a click, Maj+arrow): Entrée opens its editor.
      const caret = selectionOffsets(handle.element);
      if (caret && caret.end === caret.start + 1 && sliceRich(handle.runs(), caret.start, caret.end)[0]?.kind === 'date') openDateEditor(block.id, caret.start);
      else enter(page, block, handle);
      return;
    }
    case 'Backspace': {
      const caret = selectionOffsets(handle.element);
      if (caret && caret.start === 0 && caret.end === 0 && backspaceAtStart(page, block, handle)) event.preventDefault();
      return;
    }
    case 'Delete': {
      const caret = selectionOffsets(handle.element);
      const length = richLength(handle.runs());
      if (caret && caret.start === length && caret.end === length && deleteAtEnd(page, block, handle)) event.preventDefault();
      return;
    }
    case 'Tab': {
      event.preventDefault();
      handle.flush();
      const caret = caretOf(handle);
      const at = { block: block.id, offset: caret.start };
      if (event.shiftKey ? outdentBlocks(page, [block.id], [block.id], at) : indentBlocks(page, [block.id], [block.id], at)) focusBlock(block.id, caret.start);
      return;
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      const up = key === 'ArrowUp';
      const caret = selectionOffsets(handle.element);
      if (event.shiftKey || !caret || caret.start !== caret.end || !caretOnEdgeLine(handle.element, up ? 'top' : 'bottom')) return;
      const x = caretRect()?.left ?? handle.element.getBoundingClientRect().left;
      if (focusNeighbour(block.id, up ? -1 : 1, { x, edge: up ? 'bottom' : 'top' })) event.preventDefault();
      return;
    }
    case 'ArrowLeft':
    case 'ArrowRight': {
      const left = key === 'ArrowLeft';
      const caret = selectionOffsets(handle.element);
      if (event.shiftKey || !caret || caret.start !== caret.end || caret.start !== (left ? 0 : richLength(handle.runs()))) return;
      if (focusNeighbour(block.id, left ? -1 : 1, left ? 'end' : 'start')) event.preventDefault();
      return;
    }
    case 'Escape':
      event.preventDefault();
      handle.flush();
      selectBlocks([block.id]);
      editorRoot()?.focus({ preventScroll: true });
      return;
  }
}

/** The first entry of a table of contents drawn in the page takes the focus; false when it has none. */
function focusTocEntry(id: string): boolean {
  const toc = [...(editorRoot()?.querySelectorAll<HTMLElement>('[data-select-block]') ?? [])].find(element => element.dataset.selectBlock === id);
  const entry = toc?.querySelector<HTMLElement>('[data-toc-entry]');
  entry?.focus();
  return !!entry;
}

/** Keys while blocks are selected (the editor holds the focus, no caret in a block). */
export function selectionKey(event: KeyboardEvent<HTMLElement>, page: string): void {
  const { selected, anchor } = editorState();
  if (selected.size === 0) return;
  if (historyKey(event, page)) {
    clearBlockSelection();
    return;
  }
  const outline = selectableOutline();
  const ids = outline.filter(id => selected.has(id));
  const first = ids[0];
  const last = ids[ids.length - 1];
  if (!first || !last) return;
  const key = event.key;
  const lower = key.toLowerCase();
  const mod = isMod(event);
  const stop = (): void => {
    event.preventDefault();
    event.stopPropagation();
  };
  if (key === 'Escape') {
    stop();
    clearBlockSelection();
  } else if ((key === 'ArrowUp' || key === 'ArrowDown') && mod && event.shiftKey) {
    stop();
    nudgeBlocks(page, ids, key === 'ArrowUp' ? -1 : 1, outline);
  } else if (key === 'ArrowUp' || key === 'ArrowDown') {
    stop();
    const step = key === 'ArrowUp' ? -1 : 1;
    if (event.shiftKey && anchor && outline.includes(anchor)) {
      // The end away from the anchor moves; the range runs from the anchor to it.
      const head = anchor === first ? last : first;
      const moved = outline[Math.max(0, Math.min(outline.length - 1, outline.indexOf(head) + step))]!;
      const [from, to] = [outline.indexOf(anchor), outline.indexOf(moved)].sort((a, b) => a - b) as [number, number];
      selectBlocks(outline.slice(from, to + 1), anchor);
    } else {
      selectBlocks([neighbour(outline, step === -1 ? first : last, step) ?? (step === -1 ? first : last)]);
    }
  } else if (key === 'Enter') {
    // Into the first block's text; a sub-page opens; past a block with no text, a new paragraph.
    stop();
    clearBlockSelection();
    if (editableOutline().includes(first)) focusBlock(first, 'end');
    else if (ids.length === 1 && state().blocks[first]?.kind === 'page') {
      flushAll();
      navigate(paths.page(first));
    } else if (ids.length === 1 && state().blocks[first]?.kind === 'toc' && focusTocEntry(first)) {
      // Into the table of contents: the arrows move between its entries, Échap selects it again.
    } else if (ids.length === 1 && state().blocks[first]?.kind === 'drawing' && !isInBin(state().blocks, first)) {
      openDrawingEditor(page, first);
    } else {
      const id = insertAfter(page, last, { kind: 'text', text: '' });
      if (id) focusBlock(id, 'start');
    }
  } else if (key === 'Backspace' || key === 'Delete') {
    stop();
    const after = neighbour(outline, last, 1) ?? neighbour(outline, first, -1);
    deleteBlocks(page, ids);
    clearBlockSelection();
    if (after && editableOutline().includes(after)) focusBlock(after, 'start');
    else if (after) selectBlocks([after]);
  } else if (key === 'Tab') {
    stop();
    if (event.shiftKey) outdentBlocks(page, ids, outline);
    else indentBlocks(page, ids, outline);
  } else if (mod && lower === 'a') {
    stop();
    selectBlocks(outline);
  } else if (mod && lower === 'd') {
    stop();
    const copies = duplicateBlocks(page, ids, outline);
    if (copies.length > 0) selectBlocks(copies);
  } else if (mod && (lower === 'c' || lower === 'x' || lower === 'v')) {
    // The browser's own copy, cut and paste events follow, which the editor answers with the blocks.
    return;
  } else if (!mod && key.length === 1) {
    // A letter with blocks selected must not reach the app's own shortcuts (« c » starts a note).
    stop();
  }
}

/** A block turned into another kind from a menu, the caret kept in it. */
export function changeKind(page: string, block: Block, kind: BlockKind, caret: FocusAt = 'end'): void {
  richHandle(block.id)?.flush();
  turnInto(page, [block.id], kind, { label: mentionLabel, ...(kind === 'code' ? { language: 'plain' } : {}) });
  focusBlock(block.id, caret);
}
