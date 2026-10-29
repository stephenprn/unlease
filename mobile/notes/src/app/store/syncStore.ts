/**
 * What the sync loop is doing, for the dot in the header and the settings row.
 */
import { create } from 'zustand';

export type SyncPhase =
  /** No server configured: the phone works alone. */
  | 'local'
  | 'synced'
  | 'syncing'
  | 'offline'
  | 'unauthorized';

export interface SyncState {
  readonly phase: SyncPhase;
  readonly lastSyncAt: number | null;
  readonly pending: number;
  readonly message: string | null;
  /** This device's clock is minutes or more from the server's (`clockNote`). */
  readonly clock: string | null;
}

export const useSyncStore = create<SyncState>(() => ({ phase: 'local', lastSyncAt: null, pending: 0, message: null, clock: null }));

export const selectSyncPhase = (s: SyncState) => s.phase;
export const selectPendingCount = (s: SyncState) => s.pending;
export const selectLastSync = (s: SyncState) => s.lastSyncAt;
export const selectSyncMessage = (s: SyncState) => s.message;

export function setSyncState(patch: Partial<SyncState>): void {
  useSyncStore.setState(patch);
}
