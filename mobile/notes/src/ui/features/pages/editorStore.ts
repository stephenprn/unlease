/**
 * The page editor's state on the phone: which block holds the caret and what is selected in it,
 * the marks the next typed letters take, « :word » being typed (its emoji ride on the bar), where
 * the caret is asked to go next (a block that may not be drawn yet takes it once it is), and each
 * block's text field, reachable by its id.
 */
import { create } from 'zustand';

import { RICH_KINDS, type Block } from '@unlease/notes/models/blocks';
import type { Marks, Run } from '@unlease/core/services/richText';
import { useLibraryStore } from '@app/store/libraryStore';
import { usePagesUiStore } from '@app/store/pagesUi';

import type { EmojiQuery } from './inline';

/** Where the caret goes in a block: its start, its end, or an offset in its text (a mention counts one). */
export type FocusAt = 'start' | 'end' | number;

/** A block's text field, as the editor's gestures reach it. */
export interface RichHandle {
  /** The runs as typed, saved or not. */
  runs(): Run[];
  /** The selection, in the runs' offsets. */
  selection(): { readonly start: number; readonly end: number };
  /** New runs, saved at once; the caret put at `caret` (null: left where it is). */
  write(runs: readonly Run[], caret: { readonly start: number; readonly end?: number } | null): void;
  /** What is typed and not yet saved, saved now. */
  flush(): void;
}

export interface EditorState {
  /** The block whose text holds the caret; null when none does (the title is not a block). */
  readonly focused: string | null;
  /** The selection in that block, in the runs' offsets. */
  readonly selection: { readonly start: number; readonly end: number } | null;
  /** Marks chosen with no text selected: the next letters typed wear them. */
  readonly pendingMarks: Marks | null;
  /** « :word » just typed before the caret in the focused block: the bar offers the emoji it names. */
  readonly emojiQuery: (EmojiQuery & { readonly block: string }) | null;
  /** A caret asked for: the block takes it once drawn with its latest text. */
  readonly focusRequest: { readonly id: string; readonly at: FocusAt; readonly tick: number } | null;
  /** Bumped by undo and redo: every field takes its text back from the library, even the focused one. */
  readonly epoch: number;
}

export const useEditorStore = create<EditorState>(() => ({ focused: null, selection: null, pendingMarks: null, emojiQuery: null, focusRequest: null, epoch: 0 }));

const handles = new Map<string, RichHandle>();
let tick = 0;

export function registerHandle(id: string, handle: RichHandle): () => void {
  handles.set(id, handle);
  return () => {
    if (handles.get(id) === handle) handles.delete(id);
  };
}

export function richHandle(id: string): RichHandle | undefined {
  return handles.get(id);
}

/** Every field's typing saved: before a gesture reads the library. */
export function flushAll(): void {
  for (const handle of handles.values()) handle.flush();
}

export function focusBlock(id: string, at: FocusAt): void {
  tick += 1;
  useEditorStore.setState({ focusRequest: { id, at, tick } });
}

export function setFocused(id: string | null, selection: { readonly start: number; readonly end: number } | null = null): void {
  const state = useEditorStore.getState();
  if (state.focused === id && sameRange(state.selection, selection)) return;
  useEditorStore.setState({ focused: id, selection, ...(state.focused !== id ? { pendingMarks: null, emojiQuery: null } : {}) });
}

const sameRange = (a: { start: number; end: number } | null, b: { start: number; end: number } | null): boolean => a === b || (!!a && !!b && a.start === b.start && a.end === b.end);

export function setPendingMarks(marks: Marks | null): void {
  useEditorStore.setState({ pendingMarks: marks });
}

/** « :word » typed in a block, or none; the same query again changes nothing, so the bar is not drawn again. */
export function setEmojiQuery(block: string, query: EmojiQuery | null): void {
  const current = useEditorStore.getState().emojiQuery;
  if (!query) {
    if (current?.block === block) useEditorStore.setState({ emojiQuery: null });
    return;
  }
  if (current?.block === block && current.start === query.start && current.end === query.end && current.word === query.word) return;
  useEditorStore.setState({ emojiQuery: { ...query, block } });
}

/** After undo or redo. */
export function resyncFields(): void {
  useEditorStore.setState(state => ({ epoch: state.epoch + 1 }));
}

/** The page's blocks in reading order as shown: what a closed toggle holds and what a sub-page holds are not. */
export function visibleOutline(pageId: string): string[] {
  const { blocks, blocksByParent } = useLibraryStore.getState();
  const open = usePagesUiStore.getState().openToggles;
  const out: string[] = [];
  const walk = (parent: string, depth: number): void => {
    if (depth > 200) return;
    for (const id of blocksByParent[parent] ?? []) {
      const block = blocks[id];
      if (!block || block.deletedAt !== null) continue;
      if (block.kind === 'page') {
        if (block.trashedAt === null) out.push(id);
        continue;
      }
      if (block.kind !== 'columns' && block.kind !== 'column' && block.kind !== 'row') out.push(id);
      if (block.kind === 'table') continue;
      if (block.kind === 'toggle' && !open.has(id)) continue;
      walk(id, depth + 1);
    }
  };
  walk(pageId, 0);
  return out;
}

/** The blocks typed in, in reading order. */
export function editableOutline(pageId: string): string[] {
  const { blocks } = useLibraryStore.getState();
  return visibleOutline(pageId).filter(id => isTyped(blocks[id]));
}

export const isTyped = (block: Block | undefined): boolean => !!block && (RICH_KINDS.has(block.kind) || block.kind === 'code');

export function neighbour(outline: readonly string[], id: string, step: -1 | 1): string | null {
  const index = outline.indexOf(id);
  return index < 0 ? null : (outline[index + step] ?? null);
}
