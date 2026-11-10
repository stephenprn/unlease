/**
 * What keeps the notifications on time, through the Reminders TurboModule (`specs/NativeReminders.ts`):
 * what Android allows, the page that fixes each, whether a force stop took the alarms away, the refresh
 * with the app closed. Only the apps that ring register it (Carnet, Contacts, Agenda); missing, every
 * answer is the healthy one and nothing runs in the background.
 */
import NativeReminders, { type RemindersHealth } from '../../specs/NativeReminders';

export type { RemindersHealth };

/** What fixes each: the notifications' page, « Alarmes et rappels », the app's page (its battery), Android's question. */
export type ReminderSetting = 'notifications' | 'exactAlarms' | 'battery' | 'unrestricted';

const HEALTHY: RemindersHealth = { notifications: true, exactAlarms: true, backgroundRestricted: false, unrestricted: false };

export async function remindersHealth(): Promise<RemindersHealth> {
  return (await NativeReminders?.health().catch(() => null)) ?? HEALTHY;
}

let stopped: Promise<boolean> | null = null;

/** Whether the app was force-stopped before this process started: Android took every alarm away. Asked once. */
export function stoppedBefore(): Promise<boolean> {
  stopped ??= NativeReminders ? NativeReminders.stoppedBefore().catch(() => false) : Promise.resolve(false);
  return stopped;
}

export async function openReminderSetting(what: ReminderSetting): Promise<boolean> {
  return (await NativeReminders?.open(what).catch(() => false)) ?? false;
}

let fresh: number | null = null;

/** The app's `remindersTask` run every `minutes` with the app closed, and after the system's changes; 0 stops it. Told once per process and value. */
export function keepRemindersFresh(minutes: number): void {
  if (fresh === minutes) return;
  fresh = minutes;
  NativeReminders?.keepFresh(minutes);
}

/** Test seam: the force stop asked again, the refresh told again. */
export function resetReminders(): void {
  stopped = null;
  fresh = null;
}
