/** Reminder buttons pressed while the app is closed, in Notifee's headless JS context. */
import type { Event } from '@notifee/react-native';

import { disarm, readEvent } from '@platform/notifications';

import { bootstrap } from './bootstrap';
import { answerReminder, reconcileReminders } from './hooks/useReminders';
import { useLibraryStore } from './store/libraryStore';
import { flushNow } from './sync/syncManager';

export async function handleBackgroundEvent(event: Event): Promise<void> {
  const reminder = readEvent(event);
  if (!reminder || reminder.kind === 'open') return;
  if (!bootstrap().ok) return;
  await disarm(reminder.noteId).catch(() => undefined);
  answerReminder(reminder);
  await reconcileReminders(useLibraryStore.getState().notes).catch(() => undefined);
  // The answer reaches the other devices now, not when the app is next opened.
  await flushNow().catch(() => undefined);
}
