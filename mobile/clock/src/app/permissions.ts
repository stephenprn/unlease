/**
 * What Clock asks Android for, and when: the notifications the first time an alarm is saved (on
 * Android 13 and later a ringing alarm shows nothing without them), once on this phone; after that,
 * Réglages says when they are off (`AlarmHealthSection`).
 */
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';
import { requestNotifications } from '@platform/notificationPermission';

const ASKED = 'clock.notificationsAsked';

/** The first alarm saved on this phone asks for the notifications; later ones ask nothing. */
export async function askNotificationsOnce(): Promise<void> {
  if (readPreferences()[ASKED] === true) return;
  writePreference(ASKED, true);
  await requestNotifications();
}
