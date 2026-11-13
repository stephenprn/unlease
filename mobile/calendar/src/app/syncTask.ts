/**
 * The sync run with the app closed (index.js, `syncTask`; `backgroundSyncTask`): what waits goes,
 * what other devices wrote comes, the reminders it brought are armed, the widgets drawn again and
 * the phone's copy of the calendar (when on) brought in step.
 */
import { backgroundSyncTask } from '@shared/app/sync/backgroundTask';

import { bootstrap } from './bootstrap';
import { calendarMirror } from './phoneMirror';
import { reconcileAlarms } from './reminders';
import { publishWidgets } from './widgets';

export const runSyncTask = backgroundSyncTask(bootstrap, async () => {
  await reconcileAlarms();
  await publishWidgets();
  await calendarMirror.sync();
});
