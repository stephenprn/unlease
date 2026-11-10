/**
 * The server's own settings (Claude's key, its model and budget, S3, Seafile, each app's options,
 * the apps it runs), as last read or written, and what its health check said. Only the apps it runs
 * are remembered across visits (device settings); the rest is asked for again. Each app follows what
 * it needs of them (`useServerSettingsStore.subscribe`).
 */
import { create } from 'zustand';

import type { AppId } from '@unlease/core/apps';
import type { ServerSettings } from '@unlease/core/sync/settings';

import { setServerApps } from './settings';

/** What `/api/health` answers, without a token. */
export interface Health {
  readonly ok: boolean;
  /** Claude reads links: a key is set. */
  readonly analysis: boolean;
  readonly version: string;
  /** The apps it runs; an older server runs Carnet alone. */
  readonly apps: readonly AppId[];
  /** Its own first run is over. */
  readonly setup: boolean;
}

interface ServerSettingsState {
  readonly settings: ServerSettings | null;
  readonly health: Health | null;
}

export const useServerSettingsStore = create<ServerSettingsState>(() => ({ settings: null, health: null }));

export const selectServerSettings = (s: ServerSettingsState): ServerSettings | null => s.settings;

/** What the server answered: kept here, and the apps it runs remembered on this device. */
export function setServerSettings(settings: ServerSettings | null): void {
  useServerSettingsStore.setState(settings ? { settings } : { settings: null, health: null });
  if (settings) setServerApps(settings.apps.enabled);
}

/** What its health check said, at a connection. */
export function setServerHealth(health: Health): void {
  useServerSettingsStore.setState({ health });
  setServerApps(health.apps);
}

/** Test seam. */
export function resetServerSettings(): void {
  useServerSettingsStore.setState({ settings: null, health: null }, true);
}
