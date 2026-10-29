/** A fresh, loaded library (memory or a fake IndexedDB) and clean interface state, per test. */
import { setStorageName } from '../app/env';
import { openDatabase } from '../app/db/database';
import { setFilesDatabase } from '../app/media/files';
import { resetImages } from '../app/media/images';
import { ensureInbox } from '../app/store/actions';
import { resetBoard } from '../app/store/board';
import { resetServerSettings } from '../app/store/serverSettings';
import { loadLibrary, resetLibrary } from '../app/store/library';
import { resetPageHistory } from '../app/store/pageHistory';
import { loadNavUi } from '../app/store/navUi';
import { loadPagesUi } from '../app/store/pagesUi';
import { loadSpotlightMemory } from '../app/store/spotlight';
import { resetSettings } from '../app/store/settings';
import { resetSyncState } from '../app/store/syncStatus';
import { resetUi } from '../app/store/ui';
import { resetLayers } from '../ui/components/layers';

let counter = 0;

/** A unique database name, so tests never share IndexedDB state. */
export function uniqueName(prefix = 'test'): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export interface Fresh {
  readonly db: IDBDatabase | null;
  readonly name: string;
}

export async function freshLibrary({ persistent = false, now }: { persistent?: boolean; now?: number } = {}): Promise<Fresh> {
  resetLibrary();
  resetUi();
  resetBoard();
  resetSettings();
  resetServerSettings();
  resetSyncState();
  resetImages();
  resetLayers();
  resetPageHistory();
  const name = uniqueName();
  setStorageName(name);
  loadPagesUi();
  loadNavUi();
  loadSpotlightMemory();
  const db = persistent ? await openDatabase(name) : null;
  setFilesDatabase(db);
  await loadLibrary({ db, name, now });
  ensureInbox();
  return { db, name };
}
