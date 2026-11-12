/**
 * The sync run with the app closed (index.js, `syncTask`; `backgroundSyncTask`): what waits goes,
 * what other devices wrote comes, and the reminders it brought are armed.
 */
import { backgroundSyncTask } from '@shared/app/sync/backgroundTask';

import { bootstrap } from './bootstrap';
import { reconcileReminders } from './hooks/useReminders';
import { useLibraryStore } from './store/libraryStore';

export const runSyncTask = backgroundSyncTask(bootstrap, () => reconcileReminders(useLibraryStore.getState().notes));
