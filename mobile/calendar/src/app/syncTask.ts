/**
 * The sync run with the app closed (index.js, `syncTask`; `backgroundSyncTask`): what waits goes,
 * what other devices wrote comes, the reminders it brought are armed and the widgets drawn again.
 */
import { backgroundSyncTask } from '@shared/app/sync/backgroundTask';

import { bootstrap } from './bootstrap';
import { reconcileAlarms } from './reminders';
import { publishWidgets } from './widgets';

export const runSyncTask = backgroundSyncTask(bootstrap, async () => {
  await reconcileAlarms();
  await publishWidgets();
});
