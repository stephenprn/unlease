/**
 * The suite's lock on this phone (`core/services/lock`): the password's check from its synced record,
 * whether this app has the lock open, and the fingerprint that stands for the password once it was
 * typed here (`platform/lock`). Open lives in memory only, for this app: Carnet opened leaves Pages
 * shut. It shuts again a minute after the app leaves the screen, or from « Verrouiller ».
 *
 * The record (`lock`, Carnet's type) reaches this store from Carnet's projection (`receiveLock`),
 * which every app that locks something folds (Carnet, Pages); the shell knows its name from core.
 */
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

import { t } from '@unlease/core/i18n';
import { LOCK_ID, LOCK_TYPE, lockOpens, lockStamp, makeLockCheck, NO_LOCK, readLockFields, tokenResets, type LockState } from '@unlease/core/services/lock';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';
import { lockNative, phoneKdf } from '@shared/platform/lock';

import { activeLibrary, type LocalChange } from './store/library';
import { useSettingsStore } from './store/settingsStore';

interface LockStore {
  readonly state: LockState;
  readonly open: boolean;
  /** This phone keeps the stamp behind the fingerprint. */
  readonly fingerprint: boolean;
  /** « Déverrouiller avec l’empreinte la prochaine fois ? », asked once the password opened the lock. */
  readonly offerFingerprint: boolean;
}

const useLockStore = create<LockStore>(() => ({ state: NO_LOCK, open: false, fingerprint: false, offerFingerprint: false }));

/** The lock's record as Carnet's projection folds it: every change of it lands here. */
export function receiveLock(fields: Readonly<Record<string, unknown>> | undefined): void {
  const state = readLockFields(fields);
  const before = useLockStore.getState().state;
  if (before.check === state.check && before.setAt === state.setAt && before.section === state.section) return;
  useLockStore.setState({ state });
}

export const lockState = (): LockState => useLockStore.getState().state;
export const useLockState = (): LockState => useLockStore(store => store.state);
export const isLockOpen = (): boolean => useLockStore.getState().open;
export const useLockOpen = (): boolean => useLockStore(store => store.open);
export const useFingerprintOn = (): boolean => useLockStore(store => store.fingerprint);
export const useFingerprintOffer = (): boolean => useLockStore(store => store.offerFingerprint);

/** Shut now (« Verrouiller », the app gone a minute). */
export const closeLock = (): void => useLockStore.setState({ open: false, offerFingerprint: false });

const OFFERED = 'lock.fingerprintOffered';

function offerAfterPassword(): void {
  const native = lockNative();
  if (!native || useLockStore.getState().fingerprint || readPreferences()[OFFERED] === true) return;
  if (native.biometrics() !== 'ready') return;
  useLockStore.setState({ offerFingerprint: true });
}

/** Opens the lock with its password; false when it is not this password (or none is set). */
export async function openLock(password: string): Promise<boolean> {
  const { check } = lockState();
  const kdf = phoneKdf();
  if (!check || !kdf || !(await lockOpens(kdf, check, password))) return false;
  useLockStore.setState({ open: true });
  offerAfterPassword();
  return true;
}

export type FingerprintOutcome = 'open' | 'cancelled' | 'invalidated' | 'changed';

/** Opens the lock with the fingerprint (or the screen lock), where this phone keeps the stamp. */
export async function openWithFingerprint(): Promise<FingerprintOutcome> {
  const native = lockNative();
  if (!native) return 'cancelled';
  const read = await native.readStamp(t('Unlock'), t('Your protected notes and pages'));
  if (read === 'invalidated') {
    useLockStore.setState({ fingerprint: false });
    return 'invalidated';
  }
  if (!read) return 'cancelled';
  if (read !== lockStamp(lockState().check)) {
    // The password changed on another device since it was typed here: it is asked once again.
    native.forgetStamp();
    useLockStore.setState({ fingerprint: false });
    writePreference(OFFERED, false);
    return 'changed';
  }
  useLockStore.setState({ open: true });
  return 'open';
}

/** Keeps the stamp behind the fingerprint (asked once now); false when the person cancels. */
export async function enableFingerprint(): Promise<boolean> {
  const native = lockNative();
  const stamp = lockStamp(lockState().check);
  if (!native || !stamp) return false;
  const kept = await native.keepStamp(stamp, t('Use your fingerprint'), t('Your protected notes and pages'));
  useLockStore.setState({ fingerprint: kept });
  return kept;
}

export function disableFingerprint(): void {
  lockNative()?.forgetStamp();
  useLockStore.setState({ fingerprint: false });
}

export function dismissFingerprintOffer(): void {
  writePreference(OFFERED, true);
  useLockStore.setState({ offerFingerprint: false });
}

/** Whether the fingerprint or the screen lock can stand for the password here. */
export const fingerprintReady = (): boolean => lockNative()?.biometrics() === 'ready';

/** A new password for every device, the lock left open here. Its check is derived here; the password never leaves the phone. */
export async function setLockPassword(password: string): Promise<void> {
  const kdf = phoneKdf();
  if (!kdf) throw new Error('no lock module');
  const check = await makeLockCheck(kdf, password);
  // The fingerprint stood for the password before: it is offered again for the new one.
  lockNative()?.forgetStamp();
  writePreference(OFFERED, false);
  activeLibrary().writeLocal([{ type: LOCK_TYPE, id: LOCK_ID, patch: { check, setAt: Date.now() } }]);
  useLockStore.setState({ open: true, fingerprint: false });
  offerAfterPassword();
}

/** Whether `typed` is this phone's server token: what lets a forgotten password be replaced. */
export const tokenOpensReset = (typed: string): boolean => tokenResets(typed, useSettingsStore.getState().server?.token);

/** Carnet's protected section shown on every device, or not; `also` in the same batch (its notes back on the board). */
export function setLockSection(on: boolean, also: readonly LocalChange[] = []): void {
  activeLibrary().writeLocal([{ type: LOCK_TYPE, id: LOCK_ID, patch: { section: on } }, ...also]);
}

/** No screenshot nor recents thumbnail while `on` (what the lock guards shows). */
export function useSecureWhile(on: boolean): void {
  useEffect(() => {
    if (!on) return undefined;
    lockNative()?.setSecure(true);
    return () => lockNative()?.setSecure(false);
  }, [on]);
}

// ── shutting again as the app leaves the screen ──────────────────────────

/** A minute away: long enough to answer a message, short enough to leave the phone on a table. */
const AWAY_MS = 60_000;
let leftAt: number | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function onAppState(next: AppStateStatus): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (next === 'active') {
    // Back in front after the delay (the timer may not have run in the background).
    if (leftAt !== null && Date.now() - leftAt >= AWAY_MS) closeLock();
    leftAt = null;
    return;
  }
  if (next !== 'background') return;
  leftAt = Date.now();
  if (isLockOpen()) timer = setTimeout(closeLock, AWAY_MS);
}

let following = false;

/** Once, at start, by the apps that lock something: whether the fingerprint is kept, and shutting again by itself. */
export function startLock(): void {
  if (following) return;
  following = true;
  useLockStore.setState({ fingerprint: lockNative()?.hasStamp() ?? false });
  AppState.addEventListener('change', onAppState);
}
