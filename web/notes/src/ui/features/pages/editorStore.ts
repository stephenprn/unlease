/**
 * The page editor's own state, shared by its blocks: which blocks are selected (as Notion selects
 * whole blocks), which menu is open (the "/" menu, the "@" and "[[" pickers, the emojis ":" offers), every editable block's handle,
 * and where the caret goes next. One page is edited at a time, so this lives in one module.
 */
import { create } from 'zustand';

import type { BlockTarget } from '@unlease/notes/models/blocks';
import type { Run } from '@unlease/core/services/richText';

import { placeCaretAtX, richLengthOf, setSelectionOffsets } from './richDom';

/** What one editable block lets the editor do. */
export interface RichHandle {
  readonly element: HTMLElement;
  /** Saves what is typed now, as one step of the page's undo. */
  flush(): void;
  /** What it shows now, typed text included. */
  runs(): Run[];
  /** New content (a mark set, a mention taken out), saved at once as one step; the caret or selection then. */
  write(runs: readonly Run[], select: { readonly start: number; readonly end?: number } | null): void;
  /** What is typed next at the caret goes after the mark it ends (a shortcut just closed it). */
  leaveMark(): void;
}

export type MenuState =
  /** "/" typed at `start`: the text after it filters the blocks to add. */
  | { readonly kind: 'slash'; readonly block: string; readonly start: number; readonly query: string }
  /** "@" typed at `start`: the text after it searches what to mention, or names a date. */
  | { readonly kind: 'mention'; readonly block: string; readonly start: number; readonly query: string }
  /** "[[" typed at `start`: the text after it searches a page to cite. */
  | { readonly kind: 'cite'; readonly block: string; readonly start: number; readonly query: string }
  /** ":" typed at `start` and a word after it: the emojis it names. */
  | { readonly kind: 'emoji'; readonly block: string; readonly start: number; readonly query: string }
  /** A bookmark or an embed asked for from the "/" menu: what it shows is picked with a field of its own. */
  | { readonly kind: 'target'; readonly block: string; readonly display: 'bookmark' | 'embed'; readonly replace: boolean };

export interface EditorState {
  /** The page being edited. */
  readonly page: string | null;
  readonly selected: ReadonlySet<string>;
  /** Where a range selection started (Maj+click, Maj+arrows). */
  readonly anchor: string | null;
  readonly menu: MenuState | null;
  /** The mention under the pointer, for its "show as" bar. */
  readonly hovered: { readonly target: BlockTarget; readonly block: string; readonly rect: DOMRect } | null;
  /** The block whose caption has the caret, or is about to: it shows even empty. */
  readonly caption: string | null;
}

const EMPTY: ReadonlySet<string> = new Set();

export const useEditorStore = create<EditorState>(() => ({ page: null, selected: EMPTY, anchor: null, menu: null, hovered: null, caption: null }));

export const editorState = (): EditorState => useEditorStore.getState();

export function openEditor(page: string): void {
  useEditorStore.setState({ page, selected: EMPTY, anchor: null, menu: null, hovered: null, caption: null });
}

export function closeEditor(page: string): void {
  if (editorState().page === page) useEditorStore.setState({ page: null, selected: EMPTY, anchor: null, menu: null, hovered: null, caption: null });
}

export function selectBlocks(ids: readonly string[], anchor: string | null = ids[0] ?? null): void {
  useEditorStore.setState({ selected: new Set(ids), anchor, menu: null });
}

export function clearBlockSelection(): void {
  if (editorState().selected.size === 0) return;
  useEditorStore.setState({ selected: EMPTY, anchor: null });
}

export function setMenu(menu: MenuState | null): void {
  useEditorStore.setState({ menu });
}

/** A « : » whose emojis were turned down (Échap): the word typed on after it opens nothing more. */
let declinedEmoji: { readonly block: string; readonly start: number } | null = null;

export function declineEmoji(block: string, start: number): void {
  declinedEmoji = { block, start };
}

export function emojiDeclined(block: string, start: number): boolean {
  return declinedEmoji?.block === block && declinedEmoji.start === start;
}

export function setHovered(hovered: EditorState['hovered']): void {
  useEditorStore.setState({ hovered });
}

/** Where the caret goes in a block's caption (ids never hold a space). */
export const captionCaret = (id: string): string => `${id} caption`;

/** A block's caption shown, even empty, while it has the caret. */
export function holdCaption(id: string): void {
  if (editorState().caption !== id) useEditorStore.setState({ caption: id });
}

/** A caption left: it hides again if it is empty. */
export function releaseCaption(id: string): void {
  if (editorState().caption === id) useEditorStore.setState({ caption: null });
}

/** A block's caption shown, empty if it has none yet, with the caret in it. */
export function openCaption(id: string): void {
  holdCaption(id);
  focusBlock(captionCaret(id), 'end');
}

// ── the editable blocks ────────────────────────────────────────────────────

const handles = new Map<string, RichHandle>();

export function registerRich(id: string, handle: RichHandle): () => void {
  handles.set(id, handle);
  return () => {
    if (handles.get(id) === handle) handles.delete(id);
  };
}

export function richHandle(id: string): RichHandle | undefined {
  return handles.get(id);
}

/** Fields with drafts of their own (a code block, a caption, the page's title): saved with the rich blocks. */
const flushers = new Set<() => void>();

export function registerFlusher(flush: () => void): () => void {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}

/** Everything typed and not yet saved, saved: before an undo, a move, leaving the page. */
export function flushAll(): void {
  for (const handle of handles.values()) handle.flush();
  for (const flush of flushers) flush();
}

// ── reading order ──────────────────────────────────────────────────────────

/** The page editor on screen. */
export function editorRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-page-editor]');
}

/** The blocks a caret can go in (text, code, the title), top to bottom as they show. */
export function editableOutline(): string[] {
  const root = editorRoot();
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('[data-caret-block]')].map(element => element.dataset.caretBlock!);
}

/** The blocks that can be selected whole, in reading order (a table counts as one, columns do not). */
export function selectableOutline(): string[] {
  const root = editorRoot();
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('[data-select-block]')].map(element => element.dataset.selectBlock!);
}

export function neighbour(list: readonly string[], id: string, step: -1 | 1): string | null {
  const index = list.indexOf(id);
  return index < 0 ? null : (list[index + step] ?? null);
}

// ── where the caret goes next ──────────────────────────────────────────────

export type FocusAt = number | 'start' | 'end' | { readonly x: number; readonly edge: 'top' | 'bottom' };

let pending: { readonly id: string; readonly at: FocusAt } | null = null;
/** How a block that is not rich text takes the caret (a code block's field, the title). */
const focusers = new Map<string, (at: FocusAt) => void>();

export function registerFocuser(id: string, focus: (at: FocusAt) => void): () => void {
  focusers.set(id, focus);
  return () => {
    if (focusers.get(id) === focus) focusers.delete(id);
  };
}

/**
 * Puts the caret in a block once the gesture's changes are drawn: a block just made, or one drawn
 * anew (its kind changed, it moved), takes it as it mounts; one that stays takes it right after.
 */
export function focusBlock(id: string, at: FocusAt): void {
  pending = { id, at };
  clearBlockSelection();
  queueMicrotask(applyPendingFocus);
  requestAnimationFrame(applyPendingFocus);
}

/** Called by a block when it is drawn, and after each gesture. */
export function applyPendingFocus(): void {
  const wanted = pending;
  if (!wanted) return;
  const handle = handles.get(wanted.id);
  const focuser = focusers.get(wanted.id);
  if ((!handle || !handle.element?.isConnected) && !focuser) return;
  pending = null;
  if (focuser) {
    focuser(wanted.at);
    return;
  }
  placeIn(handle!.element, wanted.at);
}

function placeIn(element: HTMLElement, at: FocusAt): void {
  element.focus({ preventScroll: true });
  if (typeof at === 'object') {
    if (!placeCaretAtX(element, at.x, at.edge)) setSelectionOffsets(element, at.edge === 'top' ? 0 : richLengthOf(element));
  } else {
    setSelectionOffsets(element, at === 'start' ? 0 : at === 'end' ? richLengthOf(element) : at);
  }
  element.scrollIntoView({ block: 'nearest' });
}

// ── the open menu's keys ────────────────────────────────────────────────────

/** The open menu's keys (arrows, Enter, Échap) while the caret stays in the text that opened it. */
let menuKeys: ((event: { readonly key: string; preventDefault(): void }) => boolean) | null = null;

export function setMenuKeys(handler: typeof menuKeys): () => void {
  menuKeys = handler;
  return () => {
    if (menuKeys === handler) menuKeys = null;
  };
}

/** True when the open menu took the key. */
export function menuKey(event: { readonly key: string; preventDefault(): void }): boolean {
  return menuKeys?.(event) ?? false;
}
