/**
 * The sheets a page opens over itself on the phone, one at a time: what to insert (« / » or +), a
 * block's actions, its kind, a mention or what a bookmark or an embed shows, an icon, a move, a
 * code block's language, a callout's colour, words' colour or link, a date in the words, an emoji
 * for them. The last one stays described while it closes, so its exit plays with its content.
 */
import { useRef } from 'react';
import { create } from 'zustand';

export type PageSheet =
  /** After `block`, or in its place when it is empty; `slashAt`: where « / » was typed in it, taken out on a pick. */
  | { readonly kind: 'insert'; readonly block: string; readonly slashAt?: number }
  | { readonly kind: 'block'; readonly block: string }
  | { readonly kind: 'turn'; readonly block: string }
  /**
   * A mention (or a date) at `at`, `typed` there to ask for it and replaced: « @ », or « [[ » (a page
   * cited: pages alone); or a bookmark or an embed after `block` (in its place when `replace`).
   */
  | { readonly kind: 'target'; readonly purpose: 'mention' | 'bookmark' | 'embed'; readonly block: string; readonly at?: number; readonly typed?: '@' | '[['; readonly replace?: boolean }
  /** `block`: the page itself or a callout. */
  | { readonly kind: 'emoji'; readonly block: string; readonly allowNone: boolean }
  /** An emoji for `block`'s words, at `at`. */
  | { readonly kind: 'insertEmoji'; readonly block: string; readonly at: number }
  /** The date at `at` in `block`'s words; once closed, the caret goes back to `caret`. */
  | { readonly kind: 'date'; readonly block: string; readonly at: number; readonly caret: number }
  | { readonly kind: 'move'; readonly blocks: readonly string[] }
  | { readonly kind: 'movePage'; readonly page: string }
  | { readonly kind: 'language'; readonly block: string }
  | { readonly kind: 'calloutColor'; readonly block: string }
  | { readonly kind: 'textColor'; readonly block: string; readonly start: number; readonly end: number }
  | { readonly kind: 'link'; readonly block: string; readonly start: number; readonly end: number };

export interface PageSheetsState {
  readonly sheet: PageSheet | null;
  readonly open: boolean;
}

export const usePageSheets = create<PageSheetsState>(() => ({ sheet: null, open: false }));

export function openPageSheet(sheet: PageSheet): void {
  usePageSheets.setState({ sheet, open: true });
}

export function closePageSheet(): void {
  usePageSheets.setState({ open: false });
}

/** The sheet of this kind while it is open (or closing), with what it was opened for. */
export function useSheetOf<K extends PageSheet['kind']>(kind: K): { readonly visible: boolean; readonly sheet: Extract<PageSheet, { kind: K }> | null } {
  const sheet = usePageSheets(s => (s.sheet?.kind === kind ? (s.sheet as Extract<PageSheet, { kind: K }>) : null));
  const open = usePageSheets(s => s.open && s.sheet?.kind === kind);
  // Kept while another sheet takes its place, so this one's exit plays with its content.
  const last = useRef(sheet);
  if (sheet) last.current = sheet;
  return { visible: open, sheet: last.current };
}
