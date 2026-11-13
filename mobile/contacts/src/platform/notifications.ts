/**
 * Birthday notifications through Notifee, armed on the phone itself: they must come with no network.
 * One trigger per contact and per « how many days before », keyed so re-arming is idempotent. Exact
 * alarms, so one comes at the hour chosen (Android may hold an inexact one up to an hour): granted at
 * install from Android 13 (USE_EXACT_ALARM, AndroidManifest.xml), asked on Android 12. A birthday's
 * is a reminder (CATEGORY_REMINDER): « Ne pas déranger » lets it through when reminders are allowed there.
 */
import notifee, { AlarmType, AndroidCategory, AndroidImportance, AndroidNotificationSetting, AuthorizationStatus, EventType, TriggerType, type Event, type Notification } from '@notifee/react-native';

import { t } from '@unlease/core/i18n';
import { launchActivity } from '@shared/platform/launcherIcon';

const CHANNEL = 'birthdays';
export const ACTION_CALL = 'call';
export const ACTION_MESSAGE = 'message';

let channelReady: Promise<string> | null = null;

function ensureChannel(): Promise<string> {
  channelReady ??= notifee.createChannel({
    id: CHANNEL,
    name: t('Birthdays'),
    description: t('Your contacts’ birthdays, on the day'),
    importance: AndroidImportance.HIGH,
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

/** A maker's own battery settings (Samsung's sleeping apps, Xiaomi's autostart…), when Notifee knows this phone's page; null elsewhere (a Pixel). */
export async function makerBatterySettings(): Promise<(() => void) | null> {
  const info = await notifee.getPowerManagerInfo();
  return info.activity ? () => void notifee.openPowerManagerSettings().catch(() => undefined) : null;
}

export interface BirthdayNotification {
  /** `birthday-<contact>-<days before>`. */
  readonly id: string;
  readonly contactId: string;
  readonly at: number;
  readonly title: string;
  readonly body: string;
  /** Whether « Appeler » is offered (the contact has a number). */
  readonly canCall: boolean;
  /** Whether « Message » is offered (a number to text or an e-mail: on the day, the wish goes through one). */
  readonly canWrite: boolean;
}

function birthdayNotification(alert: BirthdayNotification, channelId: string): Notification {
  return {
    id: alert.id,
    title: alert.title,
    body: alert.body,
    data: { contactId: alert.contactId },
    android: {
      channelId,
      category: AndroidCategory.REMINDER,
      // Android 7's heads-up (from 8, the channel's importance says it).
      importance: AndroidImportance.HIGH,
      smallIcon: 'ic_stat_contacts',
      pressAction: { id: 'default', launchActivity: launchActivity() },
      // Both open the app, which calls or writes: only an activity may start a call.
      actions: [
        ...(alert.canCall ? [{ title: t('Call'), pressAction: { id: ACTION_CALL, launchActivity: launchActivity() } }] : []),
        ...(alert.canWrite ? [{ title: t('Message'), pressAction: { id: ACTION_MESSAGE, launchActivity: launchActivity() } }] : []),
      ],
    },
  };
}

/** Armed for its moment, exactly when Android allows it; `exact` is what `canScheduleExact` answered. */
export async function armBirthday(alert: BirthdayNotification, exact: boolean): Promise<void> {
  const channelId = await ensureChannel();
  await notifee.createTriggerNotification(birthdayNotification(alert, channelId), {
    type: TriggerType.TIMESTAMP,
    timestamp: alert.at,
    alarmManager: { type: exact ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE : AlarmType.SET_AND_ALLOW_WHILE_IDLE },
  });
}

/** Shown at once: its hour went by unarmed today (the birthday written since, the phone off). */
export async function ringBirthdayNow(alert: BirthdayNotification): Promise<void> {
  const channelId = await ensureChannel();
  await notifee.cancelTriggerNotification(alert.id).catch(() => undefined);
  await notifee.displayNotification(birthdayNotification(alert, channelId));
}

/** Its trigger only: one that rang stays in the shade until the person answers it. */
export async function forgetBirthday(id: string): Promise<void> {
  await notifee.cancelTriggerNotification(id);
}

export async function disarmBirthday(id: string): Promise<void> {
  await notifee.cancelTriggerNotification(id);
  await notifee.cancelDisplayedNotification(id);
}

export interface BirthdayEvent {
  readonly kind: 'open' | 'call' | 'message';
  readonly contactId: string;
}

function eventOf(contactId: unknown, action: string | undefined): BirthdayEvent | null {
  if (typeof contactId !== 'string') return null;
  if (action === ACTION_CALL) return { kind: 'call', contactId };
  if (action === ACTION_MESSAGE) return { kind: 'message', contactId };
  return { kind: 'open', contactId };
}

export function readEvent(event: Event): BirthdayEvent | null {
  if (event.type !== EventType.PRESS && event.type !== EventType.ACTION_PRESS) return null;
  return eventOf(event.detail.notification?.data?.contactId, event.type === EventType.ACTION_PRESS ? event.detail.pressAction?.id : undefined);
}

export function onForegroundEvent(listener: (event: BirthdayEvent) => void): () => void {
  return notifee.onForegroundEvent(event => {
    const birthday = readEvent(event);
    if (birthday) listener(birthday);
  });
}

/** The notification that launched the app from cold, if any. */
export async function initialEvent(): Promise<BirthdayEvent | null> {
  const initial = await notifee.getInitialNotification();
  if (!initial) return null;
  return eventOf(initial.notification.data?.contactId, initial.pressAction.id === 'default' ? undefined : initial.pressAction.id);
}

/** Notifee asks every app for a handler of what is pressed with the app closed: each press opens the app, which answers it. */
export function onBackgroundEvent(): void {
  notifee.onBackgroundEvent(async () => undefined);
}
