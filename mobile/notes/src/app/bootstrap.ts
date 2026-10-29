/** Everything true before the first screen renders. Synchronous: op-sqlite opens over JSI. */
import { openDatabase } from '@data/db/database';
import { databaseDirectory } from '@platform/storage';

import { ensureInbox } from './store/actions';
import { loadLibrary } from './store/libraryStore';
import { loadPagesUi } from './store/pagesUi';
import { loadSettings } from './store/settingsStore';
import { startWidgets } from './widgets';

export type BootResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

let booted = false;

export function bootstrap(): BootResult {
  if (booted) return { ok: true };
  try {
    openDatabase({ snapshotDirectory: databaseDirectory() });
    loadSettings();
    loadPagesUi();
    loadLibrary();
    ensureInbox();
    // The home-screen widgets follow the library from here, wherever JavaScript runs.
    startWidgets();
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
