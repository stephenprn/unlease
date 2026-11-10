/**
 * The reminders seen to in the headless task the native side starts (RemindersRefresh, mobile/shared),
 * the app open or not: every hour, and after a restart, an update, a change of time, zone or language.
 * What other devices wrote is pulled first (the loop has it already when the app is in front).
 */
import { pullNow } from '@shared/app/sync/syncManager';

import { bootstrap } from './bootstrap';
import { reconcileReminders } from './hooks/useReminders';
import { useLibraryStore } from './store/libraryStore';

export async function runRemindersTask(): Promise<void> {
  if (!bootstrap().ok) return;
  await pullNow().catch(() => undefined);
  await reconcileReminders(useLibraryStore.getState().notes);
}
