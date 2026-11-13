/**
 * The sync run with the app closed (index.js, `syncTask`; `backgroundSyncTask`): what waits goes,
 * what other devices wrote comes, the birthdays it brought are seen to, and the phone’s copy of
 * the address book (when on) follows.
 */
import { backgroundSyncTask } from '@shared/app/sync/backgroundTask';

import { reconcileBirthdays } from './birthdayAlerts';
import { bootstrap } from './bootstrap';
import { contactsMirror } from './phoneMirror';

export const runSyncTask = backgroundSyncTask(bootstrap, async () => {
  await reconcileBirthdays();
  await contactsMirror.sync();
});
