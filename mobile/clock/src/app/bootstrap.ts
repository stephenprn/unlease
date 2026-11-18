/** Everything true before the first screen renders. Synchronous: op-sqlite opens over JSI. */
import { APPS } from '@unlease/core/apps';
import { openDatabase } from '@shared/data/db/database';
import { loadSettings } from '@shared/app/store/settingsStore';
import { startBackgroundSync } from '@shared/app/sync/syncManager';
import { startLauncherIcon } from '@shared/app/launcherIcon';
import { startSuiteLink } from '@shared/app/suiteLink';
import { databaseDirectory } from '@shared/platform/storage';

import { startEngine } from './engine';
import { startNotices } from './evening';
import { loadClockUi } from './store/clockUi';
import { loadLibrary } from './store/libraryStore';
import { startWidgets } from './widgets';

export type { BootResult } from '@shared/ui/AppShell';
import type { BootResult } from '@shared/ui/AppShell';

/** Frozen once a device holds data: renaming orphans it. */
export const DATABASE_NAME = `${APPS.clock.slug}.sqlite`;

let booted = false;

export function bootstrap(): BootResult {
  if (booted) return { ok: true };
  try {
    openDatabase({ name: DATABASE_NAME, snapshotDirectory: databaseDirectory() });
    loadSettings();
    loadLibrary();
    loadClockUi();
    // The alarm engine is handed every alarm and how this phone rings them, now and whenever either changes.
    startEngine();
    // The evening check and the notice before an alarm, kept armed as the alarms, the events and the settings change.
    startNotices();
    // « Prochaine alarme » on the home screen is handed each morning's first event, now and whenever it changes.
    startWidgets();
    // The suite's other apps on this phone read this one's connection and appearance.
    startSuiteLink();
    // The launcher's icon in this app's primary, switched once the app has left the screen.
    startLauncherIcon();
    // Sync with the app closed.
    startBackgroundSync();
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
