/** Everything true before the first screen renders. Synchronous: op-sqlite opens over JSI. */
import { APPS } from '@unlease/core/apps';
import { openDatabase } from '@shared/data/db/database';
import { loadSettings } from '@shared/app/store/settingsStore';
import { startBackgroundSync } from '@shared/app/sync/syncManager';
import { startLauncherIcon } from '@shared/app/launcherIcon';
import { startSuiteLink } from '@shared/app/suiteLink';
import { databaseDirectory } from '@shared/platform/storage';

import { startWalletUploads } from './files';
import { loadLibrary } from './store/libraryStore';
import { loadPrefs } from './store/prefs';
import { followLocking, openCardsAtStart } from './store/vault';

export type { BootResult } from '@shared/ui/AppShell';
import type { BootResult } from '@shared/ui/AppShell';

/** Frozen once a device holds data: renaming orphans it. */
export const DATABASE_NAME = `${APPS.wallet.slug}.sqlite`;

let booted = false;

export function bootstrap(): BootResult {
  if (booted) return { ok: true };
  try {
    openDatabase({ name: DATABASE_NAME, snapshotDirectory: databaseDirectory() });
    loadSettings();
    loadPrefs();
    loadLibrary();
    startWalletUploads();
    // The suite's other apps on this phone read this one's connection and appearance.
    startSuiteLink();
    startLauncherIcon();
    startBackgroundSync();
    followLocking();
    // The cards open from the Keystore, without asking.
    void openCardsAtStart();
    booted = true;
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Test seam. */
export function resetBootstrap(): void {
  booted = false;
}
