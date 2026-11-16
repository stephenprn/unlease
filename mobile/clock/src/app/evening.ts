/**
 * The notices Clock arms through Notifee, beside the alarms the engine rings itself:
 *
 * - **The evening check** (`@unlease/clock/services/evening`): at the hour chosen (21:00), when
 *   tomorrow's first event starts before the alarm that wakes the person, or less than the margin
 *   after it, a notification says so, with « Sonner à 6:30 » (tomorrow's ring moved earlier, one batch:
 *   `ringEarlier`). Its words are read when it is armed, and armed again whenever the alarms, the
 *   events or the settings change, and every hour with the app closed (`remindersTask`); a clash found
 *   after the hour is said at once while the evening lasts (`eveningWorthRinging`).
 * - **The notice before an alarm** (« Alarme à 7:30 », quiet, an hour before by default, Google's
 *   « Upcoming alarm »), with « Ignorer » for a repeating alarm (that ring kept quiet: `skipNext`) or
 *   « Désactiver » for a one-time one; it goes away by itself as the alarm rings.
 *
 * Each is a book on `planAlarms` (`mobile/shared/src/app/alarms.ts`), as Agenda's reminders: what is
 * wanted now against what this phone armed, exact alarms where Android allows them.
 */
import notifee, { AlarmType, AndroidCategory, AndroidImportance, AndroidNotificationSetting, EventType, TriggerType, type Event, type Notification } from '@notifee/react-native';

import { t } from '@unlease/core/i18n';
import { addDays, instantToDay } from '@unlease/calendar/services/time';
import { clockWords } from '@unlease/calendar/services/eventText';
import { checkOn, eveningChecks, eveningWords, eveningWorthRinging, type EveningCheck } from '@unlease/clock/services/evening';
import { nextRing } from '@unlease/clock/services/schedule';
import { alarmName, ringDayWords } from '@unlease/clock/services/words';
import { mustArmAgain, planAlarms, readBook, rememberMode, type AlarmEntry } from '@shared/app/alarms';
import { flushNow, pullNow } from '@shared/app/sync/syncManager';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';
import { launchActivity } from '@shared/platform/launcherIcon';
import { keepRemindersFresh } from '@shared/platform/reminders';

import { bootstrap } from './bootstrap';
import { syncEngine } from './engine';
import { ringEarlier, skipNext, switchAlarm } from './store/actions';
import { ringingAlarmNow, ringingAlarmsNow } from './hooks/useRingingAlarms';
import { useClockUiStore } from './store/clockUi';
import { useLibraryStore } from './store/libraryStore';
import { refreshWeather } from './weather';

const EVENING_CHANNEL = 'clock.evening';
const UPCOMING_CHANNEL = 'clock.upcoming';
const EVENING_BOOK = 'clockEvening';
const UPCOMING_BOOK = 'clockUpcoming';
const ACTION_EARLIER = 'ring-earlier';
const ACTION_SKIP = 'skip';
const ACTION_OFF = 'off';
/** With the app closed, every hour: the evening check's words at most an hour old. */
const REFRESH_MINUTES = 60;
const MINUTE = 60_000;

/** A notice as armed: Notifee's id, its moment, what it says, and what its button does. */
interface Notice {
  readonly id: string;
  readonly at: number;
  readonly notification: Notification;
  /** Still worth showing once its moment went by unarmed. */
  readonly worth: (now: number) => boolean;
}

let channels: Promise<void> | null = null;

function ensureChannels(): Promise<void> {
  channels ??= (async () => {
    await notifee.createChannel({ id: EVENING_CHANNEL, name: t('The evening before'), description: t('An event too soon after tomorrow’s alarm, said the evening before'), importance: AndroidImportance.HIGH });
    await notifee.createChannel({ id: UPCOMING_CHANNEL, name: t('Upcoming alarms'), description: t('A quiet notice before an alarm, to skip it'), importance: AndroidImportance.LOW, vibration: false });
  })();
  return channels;
}

function eveningNotice(check: EveningCheck, twelveHours: boolean): Notice {
  const words = eveningWords(check, twelveHours);
  return {
    id: `evening:${check.evening}`,
    at: check.at,
    worth: now => eveningWorthRinging(check, now),
    notification: {
      id: `evening:${check.evening}`,
      title: words.title,
      body: words.body,
      data: { alarmId: check.alarm.id, day: check.earlier?.day ?? '', time: check.earlier?.time ?? '' },
      android: {
        channelId: EVENING_CHANNEL,
        category: AndroidCategory.REMINDER,
        importance: AndroidImportance.HIGH,
        smallIcon: 'ic_stat_clock',
        pressAction: { id: 'default', launchActivity: launchActivity() },
        ...(words.action && check.earlier ? { actions: [{ title: words.action, pressAction: { id: ACTION_EARLIER } }] } : {}),
      },
    },
  };
}

/** The evening checks wanted now: tonight's (said late while the evening lasts) and tomorrow evening's. */
function wantedEvening(now: number): Notice[] {
  const prefs = useClockUiStore.getState().prefs;
  if (!prefs.ringsHere) return [];
  const state = useLibraryStore.getState();
  return eveningChecks({ alarms: ringingAlarmsNow(now), agenda: { events: Object.values(state.events), feeds: Object.values(state.feeds) }, prefs, now }).map(check => eveningNotice(check, prefs.twelveHours));
}

/** The quiet notices before each alarm's next ring, while it is still to come. */
function wantedUpcoming(now: number): Notice[] {
  const prefs = useClockUiStore.getState().prefs;
  if (!prefs.ringsHere || prefs.upcomingMinutes === 0) return [];
  const today = instantToDay(now);
  const out: Notice[] = [];
  for (const alarm of ringingAlarmsNow(now)) {
    if (alarm.deletedAt !== null) continue;
    const ring = nextRing(alarm, now);
    if (!ring) continue;
    const at = ring.at - prefs.upcomingMinutes * MINUTE;
    const id = `upcoming:${alarm.id}:${ring.day}`;
    const clock = clockWords(alarm.time, prefs.twelveHours);
    const when = ring.day === today || ring.day === addDays(today, 1) ? ringDayWords(ring.day, today) : '';
    out.push({
      id,
      at,
      worth: moment => moment < ring.at - MINUTE,
      notification: {
        id,
        title: t('Alarm at {time}', { time: clock }),
        body: [when, alarm.label.trim() ? alarmName(alarm) : ''].filter(Boolean).join(' · '),
        data: { alarmId: alarm.id, day: ring.day },
        android: {
          channelId: UPCOMING_CHANNEL,
          category: AndroidCategory.ALARM,
          importance: AndroidImportance.LOW,
          smallIcon: 'ic_stat_clock',
          // Gone by itself as the alarm rings (and the engine's ringing notification takes over).
          timeoutAfter: Math.max(MINUTE, ring.at - Math.max(at, now)),
          pressAction: { id: 'default', launchActivity: launchActivity() },
          actions: [alarm.days.length > 0 ? { title: t('Skip'), pressAction: { id: ACTION_SKIP } } : { title: t('Turn off'), pressAction: { id: ACTION_OFF } }],
        },
      },
    });
  }
  return out;
}

/**
 * One book: arms what is wanted and not armed (or armed otherwise), shows what went by unarmed and
 * still matters, cancels the rest. `sayOnce`: a notice whose moment went by is never armed again (an
 * evening check said, then its hour moved later, is not said twice).
 */
async function reconcile(book: string, wanted: readonly Notice[], now: number, exact: boolean, sayOnce = false): Promise<void> {
  const mode = exact ? 'exact' : 'inexact';
  const { armAll, first } = await mustArmAgain(book, mode);
  const armed = readBook(readPreferences()[`${book}.armed`]);
  const byId = new Map(wanted.map(notice => [notice.id, notice]));
  const keyOf = (notice: Notice): string => JSON.stringify([notice.at, notice.notification.title, notice.notification.body, notice.notification.data]);
  const entries = new Map<string, AlarmEntry>(
    wanted.map(notice => {
      const before = armed.get(notice.id);
      return [notice.id, sayOnce && before && before.at <= now ? before : { at: notice.at, key: keyOf(notice) }];
    }),
  );
  const plan = planAlarms(entries, armed, now, { armAll, ringLate: !first });
  const next: Record<string, string> = {};
  let failed = false;
  for (const [id, entry] of entries) if (armed.get(id)?.key === entry.key) next[id] = entry.key;
  for (const id of plan.arm) {
    const notice = byId.get(id)!;
    try {
      await notifee.createTriggerNotification(notice.notification, {
        type: TriggerType.TIMESTAMP,
        timestamp: notice.at,
        alarmManager: { type: exact ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE : AlarmType.SET_AND_ALLOW_WHILE_IDLE },
      });
      next[id] = entries.get(id)!.key;
    } catch {
      // Not kept (a moment that went by meanwhile, Android refusing): tried again next time.
      failed = true;
    }
  }
  for (const id of plan.ringNow) {
    const notice = byId.get(id)!;
    if (notice.worth(now)) await notifee.displayNotification(notice.notification).catch(() => undefined);
    next[id] = entries.get(id)!.key;
  }
  // Gone by and not shown (the first run, or no longer worth it): kept, so it never shows later.
  for (const [id, entry] of entries) if (entry.at <= now) next[id] ??= entry.key;
  for (const id of plan.gone) {
    await notifee.cancelTriggerNotification(id).catch(() => undefined);
    // A notice still in the shade about what changed since (the event moved, the alarm skipped) goes too.
    await notifee.cancelDisplayedNotification(id).catch(() => undefined);
  }
  writePreference(`${book}.armed`, next);
  if (!failed) rememberMode(book, mode);
}

let running: Promise<void> = Promise.resolve();

/** Sees to both books now. */
export function reconcileNotices(now: number = Date.now()): Promise<void> {
  running = running
    .then(async () => {
      await ensureChannels();
      const settings = await notifee.getNotificationSettings().catch(() => null);
      const exact = settings?.android.alarm === AndroidNotificationSetting.ENABLED;
      await reconcile(EVENING_BOOK, wantedEvening(now), now, exact, true);
      await reconcile(UPCOMING_BOOK, wantedUpcoming(now), now, exact);
    })
    .catch(() => undefined);
  return running;
}

let pending: ReturnType<typeof setTimeout> | null = null;

function soon(): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    reconcileNotices().catch(() => undefined);
  }, 800);
}

/** Starts keeping the notices armed as the alarms, the events and the settings change; returns what stops it. */
export function startNotices(): () => void {
  keepRemindersFresh(REFRESH_MINUTES);
  soon();
  // The forecast for the next ring, asked while the app is in front (Android gives the place only then).
  refreshWeather().catch(() => undefined);
  const stopLibrary = useLibraryStore.subscribe((state, before) => {
    if (state.alarms !== before.alarms || state.events !== before.events || state.feeds !== before.feeds) soon();
  });
  const stopPrefs = useClockUiStore.subscribe((state, before) => {
    if (state.prefs !== before.prefs) soon();
  });
  // A press on a notice is heard by the app's providers (foreground) and index.js (background), once each.
  return () => {
    stopLibrary();
    stopPrefs();
    if (pending) clearTimeout(pending);
  };
}

/** Whether the evening check about `day` still asks to ring at `time`, as the records stand now. */
function stillEarlier(day: string, time: string): boolean {
  const prefs = useClockUiStore.getState().prefs;
  const state = useLibraryStore.getState();
  const check = checkOn({ alarms: ringingAlarmsNow(), agenda: { events: Object.values(state.events), feeds: Object.values(state.feeds) }, prefs, now: Date.now() }, addDays(day, -1));
  return check?.earlier?.day === day && check.earlier.time === time;
}

/**
 * A press on one of a notice's buttons (Notifee's foreground and background events): ring earlier
 * that morning, skip the next ring, or switch a one-time alarm off; each one batch, sent at once, the
 * engine handed the alarms again, the notice dismissed.
 */
export async function onNoticeEvent({ type, detail }: Event): Promise<void> {
  if (type !== EventType.ACTION_PRESS) return;
  const action = detail.pressAction?.id;
  const data = detail.notification?.data ?? {};
  const alarmId = typeof data.alarmId === 'string' ? data.alarmId : '';
  if (!alarmId || (action !== ACTION_EARLIER && action !== ACTION_SKIP && action !== ACTION_OFF)) return;
  if (!bootstrap().ok) return;
  const alarm = ringingAlarmNow(alarmId);
  if (!alarm || alarm.deletedAt !== null) return;
  if (action === ACTION_EARLIER && typeof data.day === 'string' && typeof data.time === 'string' && data.day && data.time) {
    // Only while the check still asks for it: an event moved since may want another time (the app says which).
    if (stillEarlier(data.day, data.time)) ringEarlier(alarmId, data.day, data.time);
  }
  else if (action === ACTION_SKIP) {
    // Only the ring the notice named: an alarm changed since keeps its own next one.
    if (nextRing(alarm, Date.now())?.day === data.day) skipNext(alarmId);
  } else if (action === ACTION_OFF) switchAlarm(alarmId, false);
  if (detail.notification?.id) await notifee.cancelNotification(detail.notification.id).catch(() => undefined);
  await syncEngine().catch(() => undefined);
  await reconcileNotices();
  await flushNow().catch(() => undefined);
}

/**
 * The hourly refresh with the app closed (`remindersTask`, and after a restart, an update, a change
 * of the clock, the zone or the language): what other devices wrote pulled first, the engine handed
 * the alarms again, the forecast asked ahead of the next ring, the notices seen to.
 */
export async function runRemindersTask(): Promise<void> {
  if (!bootstrap().ok) return;
  await pullNow().catch(() => undefined);
  await syncEngine().catch(() => undefined);
  await refreshWeather().catch(() => undefined);
  await reconcileNotices();
}
