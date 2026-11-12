/**
 * The sync run with the app closed (index.js, `syncTask`; `backgroundSyncTask`): what waits goes,
 * what other devices wrote comes, and the birthdays it brought are seen to.
 */
import { backgroundSyncTask } from '@shared/app/sync/backgroundTask';

import { reconcileBirthdays } from './birthdayAlerts';
import { bootstrap } from './bootstrap';

export const runSyncTask = backgroundSyncTask(bootstrap, () => reconcileBirthdays());
