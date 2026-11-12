/**
 * The app's `syncTask` (index.js), run by WorkManager with the app closed or in the background
 * (`com.stephenprn.unlease.backgroundsync`): the app started without a screen, one exchange and the
 * files after it, then whatever the app does with what came (its reminders armed). How the exchange
 * went is told first, so the worker knows whether to try again even if what follows runs out of time.
 */
import { reportBackgroundSync } from '@shared/platform/backgroundSync';

import { syncInBackground } from './syncManager';

export function backgroundSyncTask(bootstrap: () => { readonly ok: boolean }, after?: () => Promise<void>): () => Promise<void> {
  return async () => {
    if (!bootstrap().ok) {
      reportBackgroundSync('retry');
      return;
    }
    const outcome = await syncInBackground().catch(() => 'retry' as const);
    reportBackgroundSync(outcome);
    if (after) await after().catch(() => undefined);
  };
}
