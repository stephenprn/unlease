/**
 * What the sync loop is doing, for the dot in the header and the settings
 * section. The same phases as the phone.
 */
import { create } from 'zustand';

export type SyncPhase =
  /** No server configured: this browser works alone. */
  | 'local'
  /** Connected and up to date (or waiting for news). */
  | 'synced'
  /** A push or pull is in flight, or about to be. */
  | 'syncing'
  /** The server could not be reached; changes wait here. */
  | 'offline'
  /** The server refused the token. */
  | 'unauthorized';

export interface SyncState {
  readonly phase: SyncPhase;
  readonly lastSyncAt: number | null;
  /** Local changes the server has not acknowledged. */
  readonly pending: number;
  readonly message: string | null;
  /** This browser's clock is minutes or more from the server's (`clockNote`). */
  readonly clock: string | null;
}

const INITIAL: SyncState = { phase: 'local', lastSyncAt: null, pending: 0, message: null, clock: null };

export const useSyncStore = create<SyncState>(() => INITIAL);

export const selectSyncPhase = (s: SyncState): SyncPhase => s.phase;
export const selectPendingCount = (s: SyncState): number => s.pending;
export const selectLastSync = (s: SyncState): number | null => s.lastSyncAt;
export const selectSyncMessage = (s: SyncState): string | null => s.message;

export function setSyncState(patch: Partial<SyncState>): void {
  useSyncStore.setState(patch);
}

/** Test seam. */
export function resetSyncState(): void {
  useSyncStore.setState(INITIAL, true);
}
