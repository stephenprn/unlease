/** A fresh, loaded library (memory or a fake IndexedDB) and clean interface state, per test: the shell's, and the app's (with the data of those it reads). */
import { setStorageName } from '@shared/app/env';
import { openDatabase } from '@shared/app/db/database';
import { setFilesDatabase } from '@shared/app/media/files';
import { resetImages } from '@shared/app/media/images';
import { setQuery } from '@shared/app/store/search';
import { resetServerSettings } from '@shared/app/store/serverSettings';
import { loadLibrary, resetLibrary } from '@shared/app/store/records';
import { loadNavUi } from '@shared/app/store/navUi';
import { loadSpotlightMemory } from '@shared/app/store/spotlight';
import { resetSettings } from '@shared/app/store/settings';
import { resetSyncState } from '@shared/app/store/syncStatus';
import { resetUi } from '@shared/app/store/ui';
import { appData } from '@shared/modules';
import { resetLayers } from '@shared/ui/components/layers';

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
  setQuery('');
  resetSettings();
  resetServerSettings();
  resetSyncState();
  resetImages();
  resetLayers();
  for (const data of appData()) data.reset?.();
  const name = uniqueName();
  setStorageName(name);
  for (const data of appData()) data.load?.();
  loadNavUi();
  loadSpotlightMemory();
  const db = persistent ? await openDatabase(name) : null;
  setFilesDatabase(db);
  await loadLibrary({ db, name, now });
  for (const data of appData()) data.boot?.();
  return { db, name };
}
