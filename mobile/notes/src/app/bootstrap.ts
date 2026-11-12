/** Everything true before the first screen renders. Synchronous: op-sqlite opens over JSI. */
import { APPS } from '@unlease/core/apps';
import { openDatabase } from '@shared/data/db/database';
import { loadSettings } from '@shared/app/store/settingsStore';
import { startBackgroundSync } from '@shared/app/sync/syncManager';
import { startLauncherIcon } from '@shared/app/launcherIcon';
import { startSuiteLink } from '@shared/app/suiteLink';
import { databaseDirectory } from '@shared/platform/storage';

import { ensureInbox } from './store/actions';
import { loadLayout } from './store/layoutStore';
import { loadLineViews } from './store/lineViewStore';
import { loadLibrary } from './store/libraryStore';
import { startMentionNames } from './mentionNames';
import { startShareShortcuts } from './shareShortcuts';
import { startPhotoUploads } from './sync/photoUploads';
import { startWidgets } from './widgets';

export type { BootResult } from '@shared/ui/AppShell';
import type { BootResult } from '@shared/ui/AppShell';

/** Frozen once a device holds data: renaming orphans it. */
export const DATABASE_NAME = `${APPS.notes.slug}.sqlite`;

let booted = false;

export function bootstrap(): BootResult {
  if (booted) return { ok: true };
  try {
    openDatabase({ name: DATABASE_NAME, snapshotDirectory: databaseDirectory() });
    loadSettings();
    loadLayout();
    loadLineViews();
    loadLibrary();
    // The people formatted notes mention are named from Contacts' records, from here on.
    startMentionNames();
    ensureInbox();
    startPhotoUploads();
    // The suite's other apps on this phone read this one's connection and appearance.
    startSuiteLink();
    // The launcher's icon in this app's primary, switched once the app has left the screen.
    startLauncherIcon();
    // The home-screen widgets follow the library from here, wherever JavaScript runs.
    startWidgets();
    // Its collections in the share sheet's first row, kept to those links were last filed into.
    startShareShortcuts();
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
