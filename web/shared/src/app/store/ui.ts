/**
 * Ephemeral interface state shared across screens: the snackbar, the
 * navigation drawer, the shortcuts help, the spotlight. Nothing here is
 * persisted. Each app keeps its own beside it (Carnet's capture dialog:
 * `@notes/app/store/notesUi`).
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
  /** A second way on, before the action: where the thing put back now is (« Voir la page » beside « Annuler »). */
  readonly also?: { readonly label: string; readonly run: () => void };
  /** Claude at work: the slip stays until its answer replaces it. */
  readonly sticky?: boolean;
}

export interface UiState {
  readonly snack: Snack | null;
  /** The modal drawer on narrow screens; the wide layout keeps it docked. */
  readonly drawerOpen: boolean;
  readonly shortcutsOpen: boolean;
  /** The stylesheets that give Seafile, Seerr and Immich this browser's colours (« Habiller vos autres services »). */
  readonly servicesCssOpen: boolean;
  /** « Appliquer aux autres »: this app's look, to write into the suite's other web apps on this browser. */
  readonly lookShareOpen: boolean;
  /** The spotlight (⌘P, Ctrl+P or Ctrl+K): search everything, go anywhere. */
  readonly spotlightOpen: boolean;
}

const INITIAL: UiState = {
  snack: null,
  drawerOpen: false,
  shortcutsOpen: false,
  servicesCssOpen: false,
  lookShareOpen: false,
  spotlightOpen: false,
};

export const useUiStore = create<UiState>(() => INITIAL);

let snackId = 0;

export function showSnack(
  message: string,
  action?: Snack['action'],
  options: { readonly sticky?: boolean; readonly tone?: SnackTone; readonly also?: Snack['also'] } = {},
): number {
  snackId += 1;
  useUiStore.setState({
    snack: { id: snackId, message, tone: options.tone ?? 'info', ...(action ? { action } : {}), ...(options.also ? { also: options.also } : {}), ...(options.sticky ? { sticky: true } : {}) },
  });
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

/** A change made, and the way back; `also`, where to go and see it (a page restored: « Voir la page »). */
export function showUndo(message: string, undo: () => void, also?: Snack['also']): void {
  showSnack(message, { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success', ...(also ? { also } : {}) });
}

export function dismissSnack(id: number): void {
  if (useUiStore.getState().snack?.id === id) useUiStore.setState({ snack: null });
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

export function setLookShareOpen(open: boolean): void {
  useUiStore.setState({ lookShareOpen: open });
}

export function setSpotlightOpen(open: boolean): void {
  useUiStore.setState({ spotlightOpen: open });
}

export const selectSnack = (s: UiState): Snack | null => s.snack;
export const selectDrawerOpen = (s: UiState): boolean => s.drawerOpen;
export const selectShortcutsOpen = (s: UiState): boolean => s.shortcutsOpen;
export const selectServicesCssOpen = (s: UiState): boolean => s.servicesCssOpen;
export const selectLookShareOpen = (s: UiState): boolean => s.lookShareOpen;
export const selectSpotlightOpen = (s: UiState): boolean => s.spotlightOpen;

/** Test seam. */
export function resetUi(): void {
  useUiStore.setState(INITIAL, true);
}
