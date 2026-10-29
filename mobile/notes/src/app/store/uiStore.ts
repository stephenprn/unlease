/** Ephemeral UI state (snackbar, capture sheet, transfer panel, drawer); never persisted. */
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

/** A link on its way to a line: what the transfer panel is showing. */
export interface Transfer {
  readonly linkId: string;
  readonly startedAt: number;
  /** Tracking parameters taken off the shared address. */
  readonly cleaned: number;
}

export interface UiState {
  readonly snack: Snack | null;
  readonly captureOpen: boolean;
  /** Prefill: a share or the clipboard. */
  readonly captureText: string;
  readonly transfers: readonly Transfer[];
  readonly drawerOpen: boolean;
  /** The stylesheets that give Seafile, Seerr and Immich this phone's colours (« Habiller vos autres services »). */
  readonly servicesCssOpen: boolean;
  /** Claude is sorting links: one sort at a time, so no answer's slip hides another's "Annuler". */
  readonly sorting: boolean;
}

export const useUiStore = create<UiState>(() => ({
  snack: null,
  captureOpen: false,
  captureText: '',
  transfers: [],
  drawerOpen: false,
  servicesCssOpen: false,
  sorting: false,
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

export function setServicesCssOpen(open: boolean): void {
  useUiStore.setState({ servicesCssOpen: open });
}

export function setSorting(sorting: boolean): void {
  useUiStore.setState({ sorting });
}

export const selectSnack = (s: UiState) => s.snack;
export const selectCaptureOpen = (s: UiState) => s.captureOpen;
export const selectCaptureText = (s: UiState) => s.captureText;
export const selectTransfers = (s: UiState) => s.transfers;
export const selectDrawerOpen = (s: UiState) => s.drawerOpen;
export const selectServicesCssOpen = (s: UiState) => s.servicesCssOpen;
export const selectSorting = (s: UiState) => s.sorting;
