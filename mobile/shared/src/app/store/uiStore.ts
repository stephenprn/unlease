/** Ephemeral UI state every app shares (the snackbar, the drawer, the services' stylesheets, the look to send); never persisted. */
import { create } from 'zustand';

/** What a slip says, told by its leading icon: news, a gesture done, something refused, something that failed. */
export type SnackTone = 'info' | 'success' | 'warning' | 'error';

export interface Snack {
  readonly id: number;
  readonly message: string;
  readonly tone: SnackTone;
  readonly action?: { readonly label: string; readonly run: () => void };
  /** Claude at work: the slip stays until its answer replaces it. */
  readonly sticky?: boolean;
}

export interface UiState {
  readonly snack: Snack | null;
  readonly drawerOpen: boolean;
  /** The stylesheets that give Seafile, Seerr and Immich this phone's colours (« Habiller vos autres services »). */
  readonly servicesCssOpen: boolean;
  /** « Appliquer aux autres »: this app's look, to send to the suite's other apps on this phone. */
  readonly lookShareOpen: boolean;
}

export const useUiStore = create<UiState>(() => ({
  snack: null,
  drawerOpen: false,
  servicesCssOpen: false,
  lookShareOpen: false,
}));

let snackId = 0;

export function showSnack(message: string, action?: Snack['action'], options: { readonly sticky?: boolean; readonly tone?: SnackTone } = {}): number {
  snackId += 1;
  useUiStore.setState({ snack: { id: snackId, message, tone: options.tone ?? 'info', ...(action ? { action } : {}), ...(options.sticky ? { sticky: true } : {}) } });
  return snackId;
}

export function dismissSnack(id: number): void {
  if (useUiStore.getState().snack?.id === id) useUiStore.setState({ snack: null });
}

export function setDrawerOpen(open: boolean): void {
  useUiStore.setState({ drawerOpen: open });
}

export function setServicesCssOpen(open: boolean): void {
  useUiStore.setState({ servicesCssOpen: open });
}

export function setLookShareOpen(open: boolean): void {
  useUiStore.setState({ lookShareOpen: open });
}

export const selectSnack = (s: UiState) => s.snack;
export const selectDrawerOpen = (s: UiState) => s.drawerOpen;
export const selectServicesCssOpen = (s: UiState) => s.servicesCssOpen;
export const selectLookShareOpen = (s: UiState) => s.lookShareOpen;
