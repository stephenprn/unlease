/**
 * What this phone alone remembers of Clock (never synced): how it rings the alarms (`ClockPrefs`:
 * whether it rings at all, the snooze, how long an alarm rings, how its volume rises, the volume
 * keys, a new alarm's sound and what it shows, where the weather is read, the evening check, the
 * notice before an alarm, the clock's format and the week's first day).
 */
import { create } from 'zustand';

import { CLOCK_PREFS_DEFAULTS, readClockPrefs, type ClockPrefs } from '@unlease/clock/models/prefs';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';

const KEY = 'clock.prefs';

interface ClockUiState {
  readonly prefs: ClockPrefs;
}

export const useClockUiStore = create<ClockUiState>(() => ({ prefs: CLOCK_PREFS_DEFAULTS }));

export const selectPrefs = (s: ClockUiState): ClockPrefs => s.prefs;

export function loadClockUi(): void {
  useClockUiStore.setState({ prefs: readClockPrefs(readPreferences()[KEY]) });
}

/** A change of settings, kept at once. */
export function setPrefs(patch: Partial<ClockPrefs>): void {
  const prefs = readClockPrefs({ ...useClockUiStore.getState().prefs, ...patch });
  writePreference(KEY, prefs);
  useClockUiStore.setState({ prefs });
}
