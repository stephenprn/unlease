/**
 * The server's own settings (Claude's key, its model and budget, S3, Seafile, each app's options,
 * the apps it runs), as last read or written, and what its health check said. Only the apps it runs
 * and which optional services it set up (`useServerFeature`) are remembered across visits (device
 * settings); the rest is asked for again. Each app follows what it needs of them
 * (`useServerSettingsStore.subscribe`).
 */
import { create } from 'zustand';

import type { AppId } from '@unlease/core/apps';
import { serverFeatures, type ServerFeature, type ServerSettings } from '@unlease/core/sync/settings';

import { selectServerFeatureState, setServerApps, setServerFeatures, useSettingsStore, type FeatureState } from './settings';

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
  if (settings) {
    setServerApps(settings.apps.enabled);
    setServerFeatures(serverFeatures(settings));
  }
}

/** What its health check said, at a connection. */
export function setServerHealth(health: Health): void {
  useServerSettingsStore.setState({ health });
  setServerApps(health.apps);
  setServerFeatures({ claude: health.analysis });
}

/**
 * Whether the server has said it set up one of the Administration's optional services (Claude, the
 * backup to S3, the drive, Seerr): what leans on it shows only then. Remembered across visits, so a
 * start offline shows what the server last said; not known yet (a first connection, the answer on
 * its way) counts as not set up, since an entry would lead nowhere; without a server, none is.
 */
export const useServerFeature = (feature: ServerFeature): boolean => useSettingsStore(s => selectServerFeatureState(feature)(s) === 'on');

/** The same, with `unknown` apart: a place reached by its address leaves only once the server said `off`. */
export const useServerFeatureState = (feature: ServerFeature): FeatureState => useSettingsStore(selectServerFeatureState(feature));

/** `useServerFeature` outside a component (a command, a key). */
export const hasServerFeature = (feature: ServerFeature): boolean => selectServerFeatureState(feature)(useSettingsStore.getState()) === 'on';

/** Test seam. */
export function resetServerSettings(): void {
  useServerSettingsStore.setState({ settings: null, health: null }, true);
}
