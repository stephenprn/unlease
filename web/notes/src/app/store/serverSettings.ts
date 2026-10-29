/**
 * The server's own settings (link reading by Claude: on or off, the key's
 * hint, the model, the budget), as last read or written. Only `reading` is
 * remembered across visits (device settings); the rest is asked for again.
 */
import { create } from 'zustand';

import type { ServerSettings } from '@unlease/core/sync/settings';

import { setReading, setSeerrUrl } from './settings';

interface ServerSettingsState {
  readonly settings: ServerSettings | null;
}

export const useServerSettingsStore = create<ServerSettingsState>(() => ({ settings: null }));

export const selectServerSettings = (s: ServerSettingsState): ServerSettings | null => s.settings;

/** What the server answered: kept here, and what the device remembers of it (reading on or off for links saved offline, Seerr linked). */
export function setServerSettings(settings: ServerSettings | null): void {
  useServerSettingsStore.setState({ settings });
  if (!settings) return;
  setReading(settings.analysis.enabled);
  setSeerrUrl(settings.seerr.url);
}

/** Test seam. */
export function resetServerSettings(): void {
  useServerSettingsStore.setState({ settings: null }, true);
}
