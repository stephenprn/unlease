/**
 * The app this web app is, and what the server says of the suite's apps: whether it runs this one
 * (as last heard, `serverApps`), or another (Carnet's « Garder une copie » asks Pages'). An app the
 * server turned off keeps its data here and on the server; its web app says so instead of its
 * places (`AppOffScreen`).
 */
import { APPS, appsShownBy, type AppId } from '@unlease/core/apps';
import { typesOfApps } from '@unlease/core/sync/schema';

import { theApp } from '../modules';
import { useSettingsStore, type SettingsState } from './store/settings';

/** The server runs this app: connected, and not said otherwise (unknown counts as yes). */
export function serverRuns(app: AppId, state: Pick<SettingsState, 'server' | 'serverApps'> = useSettingsStore.getState()): boolean {
  return state.server !== null && (state.serverApps === null || state.serverApps.includes(app));
}

export function useServerRuns(app: AppId): boolean {
  return useSettingsStore(state => serverRuns(app, state));
}

/** Connected to a server that said it does not run this app (its Administration turned it off, or it was never chosen). */
export function appOffIn(app: AppId, state: Pick<SettingsState, 'server' | 'serverApps'>): boolean {
  return state.server !== null && state.serverApps !== null && !state.serverApps.includes(app);
}

/** As `appOffIn` for this web app's own, re-rendering when it changes. */
export function useAppOff(): boolean {
  const id = theApp().id;
  return useSettingsStore(state => appOffIn(id, state));
}

/** The record types this browser pulls: this app's, and those of the apps it reads (Pages: Carnet's). */
export function syncedTypes(): string[] {
  return typesOfApps([...appsShownBy(theApp().id)]);
}

/** An app's name (`APPS`), for words that name it. */
export const appName = (id: AppId): string => APPS[id].name;
