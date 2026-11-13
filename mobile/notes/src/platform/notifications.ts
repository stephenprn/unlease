/**
 * Reminders through Notifee, armed on the phone itself: they must fire with no network.
 * One trigger per note, keyed by the note id, so re-arming is idempotent. The cook mode's timers
 * ring the same way, on their own channel, keyed by the timer's id.
 * Exact alarms, so a reminder rings on the minute: granted at install from Android 13
 * (USE_EXACT_ALARM, AndroidManifest.xml), asked on Android 12, where without the grant they are
 * inexact (Android may hold one up to an hour). A reminder says it is one (CATEGORY_REMINDER) and a
 * timer an alarm (CATEGORY_ALARM): « Ne pas déranger » lets each through as it is set to.
 */
import notifee, {
  AlarmType,
  AndroidCategory,
  AndroidImportance,
  AndroidNotificationSetting,
  AuthorizationStatus,
  EventType,
  TriggerType,
  type Event,
  type Notification,
} from '@notifee/react-native';

import { t, tc } from '@unlease/core/i18n';
import { launchActivity } from '@shared/platform/launcherIcon';

const CHANNEL = 'reminders';
export const ACTION_DONE = 'done';
export const ACTION_SNOOZE = 'snooze';

let channelReady: Promise<string> | null = null;

function ensureChannel(): Promise<string> {
  channelReady ??= notifee.createChannel({
    id: CHANNEL,
    name: t('Reminders'),
    description: t('The reminders set on your notes'),
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

/** A maker's own battery settings (Samsung's sleeping apps, Xiaomi's autostart…), when Notifee knows this phone's page; null elsewhere (a Pixel). */
export async function makerBatterySettings(): Promise<(() => void) | null> {
  const info = await notifee.getPowerManagerInfo();
  return info.activity ? () => void notifee.openPowerManagerSettings().catch(() => undefined) : null;
}

export interface ReminderNotification {
  readonly noteId: string;
  readonly at: number;
  readonly title: string;
  readonly body: string;
}

function reminderNotification(reminder: ReminderNotification, channelId: string): Notification {
  return {
    id: reminder.noteId,
    title: reminder.title,
    body: reminder.body,
    data: { noteId: reminder.noteId },
    android: {
      channelId,
      category: AndroidCategory.REMINDER,
      // Android 7's heads-up (from 8, the channel's importance says it).
      importance: AndroidImportance.HIGH,
      smallIcon: 'ic_stat_carnet',
      pressAction: { id: 'default', launchActivity: launchActivity() },
      actions: [
        { title: tc('ticked', 'Done'), pressAction: { id: ACTION_DONE } },
        { title: t('In 1 hour'), pressAction: { id: ACTION_SNOOZE } },
      ],
    },
  };
}

/** Armed for its moment, exactly when Android allows it; `exact` is what `canScheduleExact` answered. */
export async function arm(reminder: ReminderNotification, exact: boolean): Promise<void> {
  const channelId = await ensureChannel();
  await notifee.createTriggerNotification(reminderNotification(reminder, channelId), {
    type: TriggerType.TIMESTAMP,
    timestamp: reminder.at,
    alarmManager: { type: exact ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE : AlarmType.SET_AND_ALLOW_WHILE_IDLE },
  });
}

/** Rung at once: its moment went by unarmed (set on another device and synced after it, the phone off). */
export async function ringNow(reminder: ReminderNotification): Promise<void> {
  const channelId = await ensureChannel();
  await notifee.cancelTriggerNotification(reminder.noteId).catch(() => undefined);
  await notifee.displayNotification(reminderNotification(reminder, channelId));
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
    name: t('Timers'),
    description: t('Timers started while cooking'),
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
function timerNotification(alarm: TimerAlarm, channelId: string): Notification {
  return {
    id: alarm.id,
    title: t('Timer done'),
    body: alarm.label,
    data: { timerId: alarm.id },
    android: {
      channelId,
      // An alarm: « Ne pas déranger » lets it ring even set to alarms only.
      category: AndroidCategory.ALARM,
      importance: AndroidImportance.HIGH,
      smallIcon: 'ic_stat_carnet',
      onlyAlertOnce: true,
      pressAction: { id: 'default', launchActivity: launchActivity() },
    },
  };
}

/**
 * A kitchen timer's ring, heard with the phone locked or the app away: an alarm clock's alarm
 * (`setAlarmClock`), the one Android never holds back, Doze left before it and a battery set to
 * « Restreinte » letting it through; the status bar shows the clock while it runs, as a timer.
 */
export async function scheduleTimerAlarm(alarm: TimerAlarm): Promise<void> {
  // Notifee refuses a moment already past (a short timer that waited on the permission's question).
  if (alarm.endsAt <= Date.now() + 1000) return;
  const channelId = await ensureTimerChannel();
  const exact = await canScheduleExact().catch(() => false);
  await notifee.createTriggerNotification(timerNotification(alarm, channelId), {
    type: TriggerType.TIMESTAMP,
    timestamp: alarm.endsAt,
    alarmManager: { type: exact ? AlarmType.SET_ALARM_CLOCK : AlarmType.SET_AND_ALLOW_WHILE_IDLE },
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
