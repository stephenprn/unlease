/**
 * Reminders through Notifee, armed on the phone itself: they must fire with no network.
 * One trigger per note, keyed by the note id, so re-arming is idempotent. The cook mode's timers
 * ring the same way, on their own channel, keyed by the timer's id.
 * Exact alarms need the user's grant on Android 14; without it the alarm is inexact.
 */
import notifee, {
  AlarmType,
  AndroidImportance,
  AndroidNotificationSetting,
  AuthorizationStatus,
  EventType,
  TriggerType,
  type Event,
} from '@notifee/react-native';

import { t } from '@unlease/core/i18n';

const CHANNEL = 'reminders';
export const ACTION_DONE = 'done';
export const ACTION_SNOOZE = 'snooze';

let channelReady: Promise<string> | null = null;

function ensureChannel(): Promise<string> {
  channelReady ??= notifee.createChannel({
    id: CHANNEL,
    name: t('Rappels'),
    description: t('Les rappels posés sur vos notes'),
    importance: AndroidImportance.HIGH,
    vibration: true,
  });
  return channelReady;
}

export async function ensurePermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus === AuthorizationStatus.AUTHORIZED;
}

export async function canScheduleExact(): Promise<boolean> {
  const settings = await notifee.getNotificationSettings();
  return settings.android.alarm === AndroidNotificationSetting.ENABLED;
}

export async function openExactAlarmSettings(): Promise<void> {
  await notifee.openAlarmPermissionSettings();
}

export interface ReminderNotification {
  readonly noteId: string;
  readonly at: number;
  readonly title: string;
  readonly body: string;
}

export async function arm(reminder: ReminderNotification): Promise<void> {
  const channelId = await ensureChannel();
  const exact = await canScheduleExact().catch(() => false);
  await notifee.createTriggerNotification(
    {
      id: reminder.noteId,
      title: reminder.title,
      body: reminder.body,
      data: { noteId: reminder.noteId },
      android: {
        channelId,
        smallIcon: 'ic_stat_carnet',
        pressAction: { id: 'default', launchActivity: 'default' },
        actions: [
          { title: t('Fait'), pressAction: { id: ACTION_DONE } },
          { title: t('Dans 1 h'), pressAction: { id: ACTION_SNOOZE } },
        ],
      },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: reminder.at,
      alarmManager: { type: exact ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE : AlarmType.SET_AND_ALLOW_WHILE_IDLE },
    },
  );
}

export async function disarm(noteId: string): Promise<void> {
  await notifee.cancelTriggerNotification(noteId);
  await notifee.cancelDisplayedNotification(noteId);
}

const TIMER_CHANNEL = 'timers';
let timerChannelReady: Promise<string> | null = null;

function ensureTimerChannel(): Promise<string> {
  timerChannelReady ??= notifee.createChannel({
    id: TIMER_CHANNEL,
    name: t('Minuteurs'),
    description: t('Les minuteurs lancés en cuisine'),
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  });
  return timerChannelReady;
}

export interface TimerAlarm {
  readonly id: string;
  /** What it timed: « Étape 3 ». */
  readonly label: string;
  readonly endsAt: number;
}

/** Pressing it brings the app back; shown a second time (the app rang it first), it stays quiet. */
function timerNotification(alarm: TimerAlarm, channelId: string) {
  return {
    id: alarm.id,
    title: t('Minuteur terminé'),
    body: alarm.label,
    data: { timerId: alarm.id },
    android: {
      channelId,
      smallIcon: 'ic_stat_carnet',
      onlyAlertOnce: true,
      pressAction: { id: 'default', launchActivity: 'default' },
    },
  };
}

/** A kitchen timer's ring, heard with the phone locked or the app away. */
export async function scheduleTimerAlarm(alarm: TimerAlarm): Promise<void> {
  // Notifee refuses a moment already past (a short timer that waited on the permission's question).
  if (alarm.endsAt <= Date.now() + 1000) return;
  const channelId = await ensureTimerChannel();
  const exact = await canScheduleExact().catch(() => false);
  await notifee.createTriggerNotification(timerNotification(alarm, channelId), {
    type: TriggerType.TIMESTAMP,
    timestamp: alarm.endsAt,
    alarmManager: { type: exact ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE : AlarmType.SET_AND_ALLOW_WHILE_IDLE },
  });
}

/** A timer the app saw end: its ring now, since an inexact alarm (no exact-alarm grant) can come minutes late. */
export async function ringTimerNow(alarm: TimerAlarm): Promise<void> {
  const channelId = await ensureTimerChannel();
  await notifee.cancelTriggerNotification(alarm.id);
  await notifee.displayNotification(timerNotification(alarm, channelId));
}

/** Stopped before it rang, or dismissed once it had: its ring goes, and its notification if it showed. */
export async function cancelTimerAlarm(id: string): Promise<void> {
  await notifee.cancelTriggerNotification(id);
  await notifee.cancelDisplayedNotification(id);
}

export interface ReminderEvent {
  readonly kind: 'open' | 'done' | 'snooze';
  readonly noteId: string;
}

export function readEvent(event: Event): ReminderEvent | null {
  const noteId = event.detail.notification?.data?.noteId;
  if (typeof noteId !== 'string') return null;
  if (event.type === EventType.PRESS) return { kind: 'open', noteId };
  if (event.type === EventType.ACTION_PRESS) {
    const action = event.detail.pressAction?.id;
    if (action === ACTION_DONE) return { kind: 'done', noteId };
    if (action === ACTION_SNOOZE) return { kind: 'snooze', noteId };
  }
  return null;
}

export function onForegroundEvent(listener: (event: ReminderEvent) => void): () => void {
  return notifee.onForegroundEvent(event => {
    const reminder = readEvent(event);
    if (reminder) listener(reminder);
  });
}

/** The notification that launched the app from cold, if any. */
export async function initialEvent(): Promise<ReminderEvent | null> {
  const initial = await notifee.getInitialNotification();
  const noteId = initial?.notification.data?.noteId;
  if (typeof noteId !== 'string') return null;
  if (initial?.pressAction.id === ACTION_DONE) return { kind: 'done', noteId };
  if (initial?.pressAction.id === ACTION_SNOOZE) return { kind: 'snooze', noteId };
  return { kind: 'open', noteId };
}
