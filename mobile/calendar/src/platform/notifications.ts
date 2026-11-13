/**
 * Event reminders through Notifee, armed on the phone itself: they must ring with no network. One
 * trigger per occurrence and reminder (`Alarm.key`), so re-arming is idempotent. Exact alarms (a
 * meeting at 14:00 rings at 13:50, not some minutes after): Android 13 and later grant them to a
 * calendar at install (USE_EXACT_ALARM, AndroidManifest.xml); Android 12 asks, and without the grant
 * they are inexact (Android may hold one up to an hour). A reminder is an event's (CATEGORY_EVENT):
 * « Ne pas déranger » lets it through when events are allowed there.
 */
import notifee, { AlarmType, AndroidCategory, AndroidImportance, AndroidNotificationSetting, AndroidStyle, AuthorizationStatus, EventType, TriggerType, type Event, type Notification } from '@notifee/react-native';

import { t } from '@unlease/core/i18n';
import { launchActivity } from '@shared/platform/launcherIcon';

const CHANNEL = 'events';

let channelReady: Promise<string> | null = null;

function ensureChannel(): Promise<string> {
  channelReady ??= notifee.createChannel({
    id: CHANNEL,
    name: t('Event reminders'),
    description: t('The reminders set on your events'),
    importance: AndroidImportance.HIGH,
    vibration: true,
  });
  return channelReady;
}

/** Android 13 and later ask; older ones answer yes. */
export async function ensurePermission(): Promise<boolean> {
  try {
    const settings = await notifee.requestPermission();
    return settings.authorizationStatus === AuthorizationStatus.AUTHORIZED;
  } catch {
    return false;
  }
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

export interface EventNotification {
  /** Notifee's id: the alarm's key. */
  readonly id: string;
  readonly seriesId: string;
  readonly occurrence: string;
  readonly at: number;
  readonly title: string;
  readonly body: string;
}

function eventNotification(alarm: EventNotification, channelId: string): Notification {
  return {
    id: alarm.id,
    title: alarm.title,
    body: alarm.body,
    data: { eventId: alarm.seriesId, occurrence: alarm.occurrence },
    android: {
      channelId,
      category: AndroidCategory.EVENT,
      // Android 7's heads-up (from 8, the channel's importance says it).
      importance: AndroidImportance.HIGH,
      smallIcon: 'ic_stat_agenda',
      pressAction: { id: 'default', launchActivity: launchActivity() },
    },
  };
}

/** Armed for its moment, exactly when Android allows it; `exact` is what `canScheduleExact` answered. */
export async function armEvent(alarm: EventNotification, exact: boolean): Promise<void> {
  const channelId = await ensureChannel();
  await notifee.createTriggerNotification(eventNotification(alarm, channelId), {
    type: TriggerType.TIMESTAMP,
    timestamp: alarm.at,
    alarmManager: { type: exact ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE : AlarmType.SET_AND_ALLOW_WHILE_IDLE },
  });
}

/** Rung at once: its moment went by unarmed (synced after it, the phone off) and it still matters. */
export async function ringEventNow(alarm: EventNotification): Promise<void> {
  const channelId = await ensureChannel();
  await notifee.cancelTriggerNotification(alarm.id).catch(() => undefined);
  await notifee.displayNotification(eventNotification(alarm, channelId));
}

export async function disarmEvent(id: string): Promise<void> {
  await notifee.cancelTriggerNotification(id);
}

/**
 * The morning digest (`services/digest`): its own channel, quiet (no sound, no heads-up: the day is
 * read when the phone is picked up), the day's lines in the expanded form. One id for every day, so
 * today's replaces yesterday's in the shade; armed as the reminders are, exactly when allowed.
 */
const DIGEST_CHANNEL = 'digest';
export const DIGEST_ID = 'digest';

let digestChannelReady: Promise<string> | null = null;

function ensureDigestChannel(): Promise<string> {
  digestChannelReady ??= notifee.createChannel({
    id: DIGEST_CHANNEL,
    name: t('Morning summary'),
    description: t('Your day summed up each morning, at the time you choose'),
    importance: AndroidImportance.LOW,
    vibration: false,
  });
  return digestChannelReady;
}

export interface DigestNotification {
  /** The day it sums up: a tap opens « Aujourd'hui » on it. */
  readonly day: string;
  readonly at: number;
  readonly title: string;
  readonly body: string;
}

function digestNotification(digest: DigestNotification, channelId: string): Notification {
  return {
    id: DIGEST_ID,
    title: digest.title,
    body: digest.body.split('\n')[0] ?? '',
    data: { digestDay: digest.day },
    android: {
      channelId,
      // About the day's events: « Ne pas déranger » treats it as their reminders.
      category: AndroidCategory.EVENT,
      importance: AndroidImportance.LOW,
      style: { type: AndroidStyle.BIGTEXT, text: digest.body },
      smallIcon: 'ic_stat_agenda',
      pressAction: { id: 'default', launchActivity: launchActivity() },
    },
  };
}

export async function armDigest(digest: DigestNotification, exact: boolean): Promise<void> {
  const channelId = await ensureDigestChannel();
  await notifee.createTriggerNotification(digestNotification(digest, channelId), {
    type: TriggerType.TIMESTAMP,
    timestamp: digest.at,
    alarmManager: { type: exact ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE : AlarmType.SET_AND_ALLOW_WHILE_IDLE },
  });
}

/** Rung at once: its moment went by unarmed (the phone off, turned on since) and the morning is not over. */
export async function ringDigestNow(digest: DigestNotification): Promise<void> {
  const channelId = await ensureDigestChannel();
  await notifee.cancelTriggerNotification(DIGEST_ID).catch(() => undefined);
  await notifee.displayNotification(digestNotification(digest, channelId));
}

/** What a pressed notification opens: a reminder's event at its occurrence, or the morning digest's day (« Aujourd'hui »). */
export type PressedEvent = { readonly eventId: string; readonly occurrence: string } | { readonly digestDay: string };

function pressed(data: Record<string, unknown> | undefined): PressedEvent | null {
  const eventId = data?.eventId;
  if (typeof eventId === 'string') return { eventId, occurrence: typeof data?.occurrence === 'string' ? data.occurrence : '' };
  return typeof data?.digestDay === 'string' ? { digestDay: data.digestDay } : null;
}

export function onForegroundEvent(listener: (event: PressedEvent) => void): () => void {
  return notifee.onForegroundEvent((event: Event) => {
    if (event.type !== EventType.PRESS) return;
    const found = pressed(event.detail.notification?.data);
    if (found) listener(found);
  });
}

/** The reminder that launched the app from cold, if any. */
export async function initialEvent(): Promise<PressedEvent | null> {
  const initial = await notifee.getInitialNotification();
  return initial ? pressed(initial.notification.data) : null;
}

/** Notifee asks every app for a handler of what is pressed with the app closed: the press opens the app, which answers it. */
export function onBackgroundEvent(): void {
  notifee.onBackgroundEvent(async () => undefined);
}
