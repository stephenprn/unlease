/** Everything true before the first screen renders. Synchronous: op-sqlite opens over JSI. */
import { APPS } from '@unlease/core/apps';
import { openDatabase } from '@shared/data/db/database';
import { loadSettings } from '@shared/app/store/settingsStore';
import { startLauncherIcon } from '@shared/app/launcherIcon';
import { startSuiteLink } from '@shared/app/suiteLink';
import { databaseDirectory } from '@shared/platform/storage';

import { startPageUploads } from './pageFiles';
import { loadLibrary } from './store/libraryStore';
import { startMentionNames } from './mentionNames';
import { loadPagesUi } from './store/pagesUi';

export type { BootResult } from '@shared/ui/AppShell';
import type { BootResult } from '@shared/ui/AppShell';

/** Frozen once a device holds data: renaming orphans it. */
export const DATABASE_NAME = `${APPS.pages.slug}.sqlite`;

let booted = false;

export function bootstrap(): BootResult {
  if (booted) return { ok: true };
  try {
    openDatabase({ name: DATABASE_NAME, snapshotDirectory: databaseDirectory() });
    loadSettings();
    loadLibrary();
    // The people Carnet's notes mention, named from Contacts' records where a page embeds a note.
    startMentionNames();
    loadPagesUi();
    startPageUploads();
    // The suite's other apps on this phone read this one's connection and appearance.
    startSuiteLink();
    // The launcher's icon in this app's primary, switched once the app has left the screen.
    startLauncherIcon();
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
