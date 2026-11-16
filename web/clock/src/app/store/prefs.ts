/**
 * What this browser keeps of Clock's own (Réglages, never synced: `ClockPrefs`), in localStorage
 * beside the shell's settings: a new alarm's sound, whether it shows the weather and the day's events
 * as it rings, the clock's format and the week's first day. How an alarm rings (the snooze, the
 * volume, the evening check) is each phone's: the web rings nothing, so it keeps the defaults of those.
 * Every access is guarded: blocked storage only means nothing is remembered.
 */
import { create } from 'zustand';

import { CLOCK_PREFS_DEFAULTS, readClockPrefs, type ClockPrefs } from '@unlease/clock/models/prefs';

import { getStorageName } from '@shared/app/env';

export const usePrefsStore = create<ClockPrefs>(() => CLOCK_PREFS_DEFAULTS);

const storageKey = (): string => `${getStorageName()}.clock`;

export function loadPrefs(): void {
  let stored: unknown = {};
  try {
    stored = JSON.parse(localStorage.getItem(storageKey()) ?? '{}');
  } catch {
    // Unreadable or blocked: the defaults.
  }
  usePrefsStore.setState(readClockPrefs(stored), true);
}

/** A setting changed: at once, as every setting is (DESIGN's Forms). */
export function savePrefs(patch: Partial<ClockPrefs>): void {
  usePrefsStore.setState(readClockPrefs({ ...usePrefsStore.getState(), ...patch }), true);
  try {
    localStorage.setItem(storageKey(), JSON.stringify(usePrefsStore.getState()));
  } catch {
    // Blocked storage: the choice holds for this visit only.
  }
}

/** Test seam. */
export function resetPrefs(): void {
  usePrefsStore.setState(CLOCK_PREFS_DEFAULTS, true);
}
