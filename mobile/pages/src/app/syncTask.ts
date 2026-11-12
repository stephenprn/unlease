/** The sync run with the app closed (index.js, `syncTask`; `backgroundSyncTask`): what waits goes, what other devices wrote comes. */
import { backgroundSyncTask } from '@shared/app/sync/backgroundTask';

import { bootstrap } from './bootstrap';

export const runSyncTask = backgroundSyncTask(bootstrap);
