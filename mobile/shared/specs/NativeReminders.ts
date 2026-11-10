/**
 * What keeps the suite's notifications on time (`com.stephenprn.unlease.reminders`, mobile/shared/android):
 * whether Android lets them ring on the minute (notifications allowed, exact alarms, the battery's
 * restriction), the page that fixes each, whether the app was force-stopped before this start (Android
 * then took every alarm away, Notifee's too), and a refresh with the app closed: a run of the app's `remindersTask`
 * every so often (WorkManager) and after a restart, an update, a change of time, zone or language, or
 * exact alarms allowed again, so events written on another device are armed and the next weeks too.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface RemindersHealth {
  /** Notifications allowed for the app (Android 13 asks; any version lets them be turned off). */
  notifications: boolean;
  /** Exact alarms allowed: always from Android 13 (USE_EXACT_ALARM), a grant on Android 12. */
  exactAlarms: boolean;
  /** The battery's « Restreinte »: Android holds alarms and background work while the app is away. */
  backgroundRestricted: boolean;
  /** Left out of the battery's optimization (« Sans restriction »). */
  unrestricted: boolean;
}

export interface Spec extends TurboModule {
  health(): Promise<RemindersHealth>;
  /** Whether the app was force-stopped before this process started (always yes before Android 11, where nobody says). */
  stoppedBefore(): Promise<boolean>;
  /** Opens the page that fixes it: `notifications`, `exactAlarms`, `battery` (the app's own page), `unrestricted` (Android's question). */
  open(what: string): Promise<boolean>;
  /** Runs `remindersTask` every `minutes` (at least 15) with the app closed, and on the system's changes; 0 stops. */
  keepFresh(minutes: number): void;
}

export default TurboModuleRegistry.get<Spec>('Reminders');
