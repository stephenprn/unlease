/**
 * Where this browser keeps an app's data, and the device's settings every app shares.
 *
 * Each web app has its own IndexedDB database and its own localStorage keys, named after its slug
 * (`carnet`, `pages`: `APPS`, set as the app is installed), as each phone app has its own SQLite
 * file. Carnet's are the names its web app had before the suite had its own apps, so what a
 * browser held there is still there. The device's settings (the server, the language, the grains,
 * the first run done, the first run's colours) are the suite's (`unlease.settings`): every app on one
 * server's address reads them, so the second app asks nothing again. Each app's look is its own once
 * chosen in its Réglages (`unlease.look.<app>`, `store/settings`).
 *
 * The dev-only demo (`?demo=1`) and the tests swap in their own name for both, so they can never
 * touch the owner's real notes in the same browser profile.
 */
import { SUITE_SLUG, type AppId } from '@unlease/core/apps';

let storageName: string = SUITE_SLUG;
let deviceName: string = SUITE_SLUG;
let ownApp: AppId | null = null;

/** The app's own (`installApp`): its database and its keys. */
export function setAppStorage(slug: string): void {
  storageName = slug;
}

/** The demo's and the tests' own: the app's storage and the device's settings, apart from the real ones. */
export function setStorageName(name: string): void {
  storageName = name;
  deviceName = name;
}

/** The IndexedDB database name, and the prefix of the app's localStorage keys. */
export function getStorageName(): string {
  return storageName;
}

/** The prefix of the device's settings, every app's. */
export function getDeviceName(): string {
  return deviceName;
}

/** The app this web app is (`installApp`): its look is its own (`store/settings`). Null before it is installed. */
export function setOwnApp(app: AppId): void {
  ownApp = app;
}

export function getOwnApp(): AppId | null {
  return ownApp;
}
