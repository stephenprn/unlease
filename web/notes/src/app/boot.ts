/**
 * Everything that must be true before the first screen renders: settings
 * read, the database open, every record in memory, "Non classé" seeded.
 *
 * Without IndexedDB (a blocked profile, some private windows) the app still
 * opens and works from memory; the boot result says so, and the app tells the
 * person, because a reload would lose what was written.
 */
import { t } from '@unlease/core/i18n';

import { openDatabase } from './db/database';
import { getStorageName } from './env';
import { setFilesDatabase } from './media/files';
import { ensureInbox } from './store/actions';
import { flushLibrary, loadLibrary, onPendingChange, onStorageError } from './store/library';
import { loadNavUi } from './store/navUi';
import { loadPagesUi } from './store/pagesUi';
import { loadSpotlightMemory } from './store/spotlight';
import { loadSettings } from './store/settings';
import { setSyncState } from './store/syncStatus';
import { showError } from './store/ui';

export interface BootResult {
  /** False when nothing will survive a reload. */
  readonly persistent: boolean;
}

let lastStorageWarning = 0;

export async function boot(): Promise<BootResult> {
  loadSettings();
  loadPagesUi();
  loadNavUi();
  loadSpotlightMemory();
  const db = await openDatabase(getStorageName()).catch(() => null);
  // Asks the browser never to clear this site's storage on its own: edits and files not yet sent live there.
  void navigator.storage?.persist?.().catch(() => false);
  setFilesDatabase(db);
  await loadLibrary({ db, name: getStorageName() });
  ensureInbox();

  onPendingChange(pending => setSyncState({ pending }));
  onStorageError(() => {
    // Once a minute at most: a full disk fails every write.
    if (Date.now() - lastStorageWarning < 60_000) return;
    lastStorageWarning = Date.now();
    showError(t('Impossible d’enregistrer sur cet appareil : l’espace de stockage du navigateur est plein ou bloqué.'));
  });
  // Write-behind storage: commit what is queued when the page goes away.
  window.addEventListener('pagehide', () => void flushLibrary());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushLibrary();
  });
  return { persistent: db !== null };
}
