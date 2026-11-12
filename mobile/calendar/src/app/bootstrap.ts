/** Everything true before the first screen renders. Synchronous: op-sqlite opens over JSI. */
import { APPS } from '@unlease/core/apps';
import { setMentionNamer } from '@unlease/notes/services/noteMentions';
import { openDatabase } from '@shared/data/db/database';
import { loadSettings } from '@shared/app/store/settingsStore';
import { startBackgroundSync } from '@shared/app/sync/syncManager';
import { loadMapsChoice } from '@shared/app/store/mapsStore';
import { startLauncherIcon } from '@shared/app/launcherIcon';
import { startSuiteLink } from '@shared/app/suiteLink';
import { databaseDirectory } from '@shared/platform/storage';

import { startFileUploads } from './eventFiles';
import { nameOf } from './mentionNames';
import { loadCalendarUi } from './store/calendarUi';
import { loadLibrary, useLibraryStore } from './store/libraryStore';
import { startWidgets } from './widgets';

export type { BootResult } from '@shared/ui/AppShell';
import type { BootResult } from '@shared/ui/AppShell';

/** Frozen once a device holds data: renaming orphans it. */
export const DATABASE_NAME = `${APPS.calendar.slug}.sqlite`;

let booted = false;

export function bootstrap(): BootResult {
  if (booted) return { ok: true };
  try {
    openDatabase({ name: DATABASE_NAME, snapshotDirectory: databaseDirectory() });
    loadSettings();
    loadLibrary();
    loadCalendarUi();
    // Where its places open: the maps app chosen, or asked each time.
    loadMapsChoice();
    // A note's text read here (a reminder's title) names what it mentions from this phone's records.
    setMentionNamer(target => nameOf(useLibraryStore.getState(), target));
    startFileUploads();
    // The home-screen widgets are handed what they draw now, and whenever it changes.
    startWidgets();
    // The suite's other apps on this phone read this one's connection and appearance.
    startSuiteLink();
    // The launcher's icon in this app's primary, switched once the app has left the screen.
    startLauncherIcon();
    // Sync with the app closed: after its files' uploads, which say what is left to send.
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
