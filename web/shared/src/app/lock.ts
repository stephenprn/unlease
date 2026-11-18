/**
 * The suite's lock in this web app (`core/services/lock`): the password's check from its synced
 * record, and whether this page has the lock open. Open lives in memory only, for this app's page:
 * Carnet opened in one tab leaves Pages shut in another. It shuts again by itself after a minute
 * hidden, five minutes without a key or a click, when the page is left, or from « Verrouiller ».
 *
 * The record (`lock`, Carnet's type) is read through the shell's records, so any app whose module
 * syncs Carnet's types (Carnet, Pages) has it; the shell knows its name from core, never Carnet.
 */
import { createSHA256, pbkdf2 } from 'hash-wasm';
import { create } from 'zustand';

import { fromBase64Url, toBase64Url } from '@unlease/core/services/bytes';
import { LOCK_ID, LOCK_TYPE, lockOpens, makeLockCheck, readLockFields, tokenResets, type LockKdf, type LockState } from '@unlease/core/services/lock';

import { getRecord, useRecordsRevision, writeLocal } from './store/records';
import { useSettingsStore } from './store/settings';

/** PBKDF2 in WebAssembly (`hash-wasm`, inlined in the bundle): a server reached over plain HTTP has no `crypto.subtle`. */
const browserKdf: LockKdf = {
  random: length => crypto.getRandomValues(new Uint8Array(length)),
  pbkdf2: async (secret, salt, iterations) =>
    toBase64Url(await pbkdf2({ password: secret, salt: fromBase64Url(salt) ?? new Uint8Array(), iterations, hashLength: 32, hashFunction: createSHA256(), outputType: 'binary' })),
};

interface OpenState {
  readonly open: boolean;
}

const useOpenStore = create<OpenState>(() => ({ open: false }));

/** The lock's record now (no password yet: `check` null). */
export const lockState = (): LockState => readLockFields(getRecord(LOCK_TYPE, LOCK_ID)?.fields);

/** The lock's record, re-read at every change of the records. */
export function useLockState(): LockState {
  useRecordsRevision();
  return lockState();
}

export const isLockOpen = (): boolean => useOpenStore.getState().open;

/** Whether this page has the lock open. */
export const useLockOpen = (): boolean => useOpenStore(state => state.open);

function setOpen(open: boolean): void {
  if (useOpenStore.getState().open === open) return;
  useOpenStore.setState({ open });
  armIdle();
}

/** Shut now (« Verrouiller », the page hidden or left). */
export const closeLock = (): void => setOpen(false);

/** Opens the lock with its password; false when it is not this password (or none is set). */
export async function openLock(password: string): Promise<boolean> {
  const { check } = lockState();
  if (!check || !(await lockOpens(browserKdf, check, password))) return false;
  setOpen(true);
  return true;
}

/** A new password for every device, the lock left open here. Its check is derived here; the password never leaves the page. */
export async function setLockPassword(password: string): Promise<void> {
  const check = await makeLockCheck(browserKdf, password);
  writeLocal([{ type: LOCK_TYPE, id: LOCK_ID, patch: { check, setAt: Date.now() } }]);
  setOpen(true);
}

/** Whether `typed` is this device's server token: what lets a forgotten password be replaced. */
export const tokenOpensReset = (typed: string): boolean => tokenResets(typed, useSettingsStore.getState().server?.token);

/** Carnet's protected section shown on every device, or not. */
export function setLockSection(on: boolean, also: readonly { readonly type: string; readonly id: string; readonly patch: Record<string, unknown> }[] = []): void {
  writeLocal([{ type: LOCK_TYPE, id: LOCK_ID, patch: { section: on } }, ...also]);
}

// ── shutting again by itself ──────────────────────────────────────────────

/** Five minutes without a key, a click or a touch. */
const IDLE_MS = 5 * 60_000;
/** A minute hidden (another tab, the window minimised). */
const HIDDEN_MS = 60_000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

function armIdle(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (useOpenStore.getState().open) idleTimer = setTimeout(closeLock, IDLE_MS);
}

function onVisibility(): void {
  if (hiddenTimer) clearTimeout(hiddenTimer);
  hiddenTimer = null;
  if (document.visibilityState === 'hidden' && useOpenStore.getState().open) hiddenTimer = setTimeout(closeLock, HIDDEN_MS);
}

let following = false;

/** Once, at start, by the apps that lock something: the lock shuts itself as said above. */
export function followLock(): void {
  if (following || typeof window === 'undefined') return;
  following = true;
  document.addEventListener('visibilitychange', onVisibility);
  for (const kind of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.addEventListener(kind, armIdle, { passive: true, capture: true });
  window.addEventListener('pagehide', closeLock);
}
