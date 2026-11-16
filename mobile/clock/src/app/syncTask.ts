/**
 * The sync run with the app closed (index.js, `syncTask`; `backgroundSyncTask`): what waits goes,
 * what other devices wrote comes (an alarm set on another phone, an event moved in Agenda), the
 * alarm engine is handed the alarms again and the notices are seen to.
 */
import { backgroundSyncTask } from '@shared/app/sync/backgroundTask';

import { bootstrap } from './bootstrap';
import { syncEngine } from './engine';
import { reconcileNotices } from './evening';

export const runSyncTask = backgroundSyncTask(bootstrap, async () => {
  await syncEngine();
  // At once, not on the app's timer: Android may freeze this process before it fires.
  await reconcileNotices();
});
