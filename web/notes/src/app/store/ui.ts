/**
 * Ephemeral interface state shared across screens: the snackbar, the capture
 * dialog, the transfer panel, the navigation drawer, the shortcuts help.
 * Nothing here is persisted.
 */
import { create } from 'zustand';

import { tc } from '@unlease/core/i18n';

/** What a slip says, by its leading glyph: news, a change made, something to look at, a refusal. */
export type SnackTone = 'info' | 'success' | 'warning' | 'error';

export interface Snack {
  readonly id: number;
  readonly message: string;
  readonly tone: SnackTone;
  readonly action?: { readonly label: string; readonly run: () => void };
  /** Claude at work: the slip stays until its answer replaces it. */
  readonly sticky?: boolean;
}

/** A link on its way to a collection: what the transfer panel is showing. */
export interface Transfer {
  readonly linkId: string;
  readonly startedAt: number;
  /** Tracking parameters taken off the shared address. */
  readonly cleaned: number;
}

export interface UiState {
  readonly snack: Snack | null;
  readonly captureOpen: boolean;
  /** Text to prefill the capture dialog with (a paste, the clipboard). */
  readonly captureText: string;
  readonly transfers: readonly Transfer[];
  /** The modal drawer on narrow screens; the wide layout keeps it docked. */
  readonly drawerOpen: boolean;
  readonly shortcutsOpen: boolean;
  /** The stylesheets that give Seafile, Seerr and Immich this browser's colours (« Habiller vos autres services »). */
  readonly servicesCssOpen: boolean;
  /** The spotlight (⌘P, Ctrl+P or Ctrl+K): search everything, go anywhere. */
  readonly spotlightOpen: boolean;
  readonly newLineOpen: boolean;
  /** Where the next editor puts the caret: a new note starts in its body or first item. */
  readonly editorFocus: 'body' | 'check' | null;
  /** Claude is sorting links: one sort at a time, so no answer's slip hides another's "Annuler". */
  readonly sorting: boolean;
  /** Notes being deleted with collections holding links among them: the app asks where those go (the ids stay after it closes). */
  readonly deleteLines: { readonly ids: readonly string[]; readonly open: boolean };
}

const INITIAL: UiState = {
  snack: null,
  captureOpen: false,
  captureText: '',
  transfers: [],
  drawerOpen: false,
  shortcutsOpen: false,
  servicesCssOpen: false,
  spotlightOpen: false,
  newLineOpen: false,
  editorFocus: null,
  sorting: false,
  deleteLines: { ids: [], open: false },
};

export const useUiStore = create<UiState>(() => INITIAL);

let snackId = 0;

export function showSnack(message: string, action?: Snack['action'], options: { readonly sticky?: boolean; readonly tone?: SnackTone } = {}): number {
  snackId += 1;
  useUiStore.setState({ snack: { id: snackId, message, tone: options.tone ?? 'info', ...(action ? { action } : {}), ...(options.sticky ? { sticky: true } : {}) } });
  return snackId;
}

/** Something refused or failed: what went wrong, and how to put it right when there is a way. */
export function showError(message: string, action?: Snack['action']): number {
  return showSnack(message, action, { tone: 'error' });
}

/** Done, but not quite as asked (part of it, or with a caveat). */
export function showWarning(message: string, action?: Snack['action']): number {
  return showSnack(message, action, { tone: 'warning' });
}

/** Links added (some new: done) or all saved already (news). */
export const addedTone = (placed: readonly { readonly existing: unknown }[]): SnackTone => (placed.some(plan => plan.existing === null) ? 'success' : 'info');

/** A change made, and the way back. */
export function showUndo(message: string, undo: () => void): void {
  showSnack(message, { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
}

export function dismissSnack(id: number): void {
  if (useUiStore.getState().snack?.id === id) useUiStore.setState({ snack: null });
}

export function openCapture(text = ''): void {
  useUiStore.setState({ captureOpen: true, captureText: text });
}

export function closeCapture(): void {
  useUiStore.setState({ captureOpen: false, captureText: '' });
}

export function startTransfer(linkId: string, cleaned = 0, now: number = Date.now()): void {
  useUiStore.setState(s => ({ transfers: [...s.transfers.filter(t => t.linkId !== linkId), { linkId, startedAt: now, cleaned }] }));
}

export function endTransfer(linkId: string): void {
  useUiStore.setState(s => ({ transfers: s.transfers.filter(t => t.linkId !== linkId) }));
}

export function setDrawerOpen(open: boolean): void {
  useUiStore.setState({ drawerOpen: open });
}

export function setShortcutsOpen(open: boolean): void {
  useUiStore.setState({ shortcutsOpen: open });
}

export function setServicesCssOpen(open: boolean): void {
  useUiStore.setState({ servicesCssOpen: open });
}

export function setSpotlightOpen(open: boolean): void {
  useUiStore.setState({ spotlightOpen: open });
}

export function setNewLineOpen(open: boolean): void {
  useUiStore.setState({ newLineOpen: open });
}

export function setSorting(sorting: boolean): void {
  useUiStore.setState({ sorting });
}

/** From the selection bar's "Supprimer" or the "#" key. */
export function askDeleteLines(ids: readonly string[]): void {
  useUiStore.setState({ deleteLines: { ids, open: true } });
}

export function closeDeleteLines(): void {
  useUiStore.setState(s => ({ deleteLines: { ...s.deleteLines, open: false } }));
}

export function setEditorFocus(focus: UiState['editorFocus']): void {
  useUiStore.setState({ editorFocus: focus });
}

/** Read once by the editor that opens next. */
export function takeEditorFocus(): UiState['editorFocus'] {
  const focus = useUiStore.getState().editorFocus;
  if (focus) useUiStore.setState({ editorFocus: null });
  return focus;
}

export const selectSnack = (s: UiState): Snack | null => s.snack;
export const selectCaptureOpen = (s: UiState): boolean => s.captureOpen;
export const selectCaptureText = (s: UiState): string => s.captureText;
export const selectTransfers = (s: UiState): readonly Transfer[] => s.transfers;
export const selectDrawerOpen = (s: UiState): boolean => s.drawerOpen;
export const selectShortcutsOpen = (s: UiState): boolean => s.shortcutsOpen;
export const selectServicesCssOpen = (s: UiState): boolean => s.servicesCssOpen;
export const selectSpotlightOpen = (s: UiState): boolean => s.spotlightOpen;
export const selectNewLineOpen = (s: UiState): boolean => s.newLineOpen;
export const selectSorting = (s: UiState): boolean => s.sorting;
export const selectDeleteLines = (s: UiState): UiState['deleteLines'] => s.deleteLines;

/** Test seam. */
export function resetUi(): void {
  useUiStore.setState(INITIAL, true);
}
