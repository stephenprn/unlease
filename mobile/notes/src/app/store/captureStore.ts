/** Carnet's ephemeral UI state (the capture sheet, links on their way to a collection, Claude sorting); never persisted. */
import { create } from 'zustand';

/** A link on its way to a line: what the transfer panel is showing. */
export interface Transfer {
  readonly linkId: string;
  readonly startedAt: number;
  /** Tracking parameters taken off the shared address. */
  readonly cleaned: number;
}

export interface CaptureState {
  readonly captureOpen: boolean;
  /** Prefill: a share or the clipboard. */
  readonly captureText: string;
  readonly transfers: readonly Transfer[];
  /** Claude is sorting links: one sort at a time, so no answer's slip hides another's "Annuler". */
  readonly sorting: boolean;
}

export const useCaptureStore = create<CaptureState>(() => ({
  captureOpen: false,
  captureText: '',
  transfers: [],
  sorting: false,
}));

export function openCapture(text = ''): void {
  useCaptureStore.setState({ captureOpen: true, captureText: text });
}

export function closeCapture(): void {
  useCaptureStore.setState({ captureOpen: false, captureText: '' });
}

export function startTransfer(linkId: string, cleaned = 0, now: number = Date.now()): void {
  useCaptureStore.setState(s => ({ transfers: [...s.transfers.filter(t => t.linkId !== linkId), { linkId, startedAt: now, cleaned }] }));
}

export function endTransfer(linkId: string): void {
  useCaptureStore.setState(s => ({ transfers: s.transfers.filter(t => t.linkId !== linkId) }));
}

export function setSorting(sorting: boolean): void {
  useCaptureStore.setState({ sorting });
}

export const selectCaptureOpen = (s: CaptureState) => s.captureOpen;
export const selectCaptureText = (s: CaptureState) => s.captureText;
export const selectTransfers = (s: CaptureState) => s.transfers;
export const selectSorting = (s: CaptureState) => s.sorting;
