/**
 * The app's `syncTask` (index.js), run by WorkManager with the app closed or in the background
 * (`com.stephenprn.unlease.backgroundsync`): the app started without a screen, one exchange and the
 * files after it, then whatever the app does with what came (its reminders armed). How the exchange
 * went is told first, so the worker knows whether to try again even if what follows runs out of time.
 */
import { AppState } from 'react-native';

import { reportBackgroundSync } from '@shared/platform/backgroundSync';

import { syncInBackground } from './syncManager';

/** How long a task waits for the app's screen, when it starts with the app in front. */
const SCREEN_FIRST_MS = 1500;

/**
 * Lets the app's screen come first. Android hands the app whatever was due the moment its process
 * starts, which is often as it is opened: a task's exchange and the alarms it arms again would then
 * run between the app's first frames. In front, the app's own loop has the same work in hand, so a
 * task there can wait; with the app closed it goes at once.
 */
export function afterTheScreen(): Promise<void> {
  if (AppState.currentState !== 'active') return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, SCREEN_FIRST_MS));
}

export function backgroundSyncTask(bootstrap: () => { readonly ok: boolean }, after?: () => Promise<void>): () => Promise<void> {
  return async () => {
    if (!bootstrap().ok) {
      reportBackgroundSync('retry');
      return;
    }
    await afterTheScreen();
    const outcome = await syncInBackground().catch(() => 'retry' as const);
    reportBackgroundSync(outcome);
    if (after) await after().catch(() => undefined);
  };
}
