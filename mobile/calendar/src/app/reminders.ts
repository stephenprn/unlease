/**
 * The events' reminders kept armed on the phone: those ringing in the next 30 days (`alarmsBetween`,
 * the calendars hidden left out), each re-armed when its moment or its words change, cancelled when
 * its event, its occurrence or its reminder goes (`planAlarms`). One whose moment went by unarmed
 * (an event written on another device and synced after it, the phone off) rings late while still
 * worth it (`stillWorthRinging`). What this phone armed is kept with its preferences, so a start
 * compares instead of arming again; a force stop, or exact alarms newly allowed, arms everything again.
 * With the app closed, `remindersTask` does the same every hour and after the system's changes
 * (`keepRemindersFresh`), pulling first what other devices wrote.
 */
import { t } from '@unlease/core/i18n';
import { formatClock } from '@unlease/core/services/format';
import { alarmsBetween, LATE_RING_MS, stillWorthRinging, type Alarm } from '@unlease/calendar/services/alarms';
import { hiddenFeedIds } from '@unlease/calendar/services/occurrences';
import { mustArmAgain, planAlarms, readBook, rememberMode, type AlarmEntry } from '@shared/app/alarms';
import { pullNow } from '@shared/app/sync/syncManager';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';
import { keepRemindersFresh } from '@shared/platform/reminders';
import { armEvent, canScheduleExact, disarmEvent, ringEventNow, type EventNotification } from '@platform/notifications';

import { bootstrap } from './bootstrap';
import { useLibraryStore } from './store/libraryStore';
import { publishWidgets } from './widgets';

const ARMED = 'calendar.armed';
const BOOK = 'calendar';
const HORIZON_MS = 30 * 86_400_000;
/** Android keeps at most 500 alarms per app (some makers fewer): the nearest ones, well below; the hourly run arms the next. */
const MOST = 64;
/** How often the reminders are seen to with the app closed: an event written elsewhere is armed within the hour. */
export const REFRESH_MINUTES = 60;

/** What a reminder says: the event's title, and when and where. */
export function notificationOf(alarm: Alarm): EventNotification {
  const when = alarm.allDay ? t('Toute la journée') : formatClock(alarm.startAt);
  return {
    id: alarm.key,
    seriesId: alarm.seriesId,
    occurrence: alarm.occurrence,
    at: alarm.fireAt,
    title: alarm.title.trim() || t('Sans titre'),
    body: alarm.place.trim() ? `${when} · ${alarm.place.trim()}` : when,
  };
}

/** What a reminder is armed with, as kept: a change of its moment or its words arms it again. */
const keyOf = (alarm: EventNotification): string => JSON.stringify([alarm.at, alarm.title, alarm.body]);

/** The reminders wanted now, by id: those to come, and those gone by within the hour still worth ringing. */
export function wantedAlarms(now: number): Map<string, EventNotification> {
  const state = useLibraryStore.getState();
  const alarms = alarmsBetween(Object.values(state.events), now - LATE_RING_MS, now + HORIZON_MS, { hiddenFeeds: hiddenFeedIds(Object.values(state.feeds)) })
    .filter(alarm => stillWorthRinging(alarm, now))
    .slice(0, MOST);
  return new Map(alarms.map(alarm => [alarm.key, notificationOf(alarm)]));
}

let running: Promise<void> = Promise.resolve();

/** Arms what is wanted and not armed (or armed otherwise), rings what went by unarmed, cancels what is no longer wanted. */
export function reconcileAlarms(now: number = Date.now()): Promise<void> {
  running = running.then(async () => {
    const exact = await canScheduleExact().catch(() => false);
    const mode = exact ? 'exact' : 'inexact';
    const { armAll, first } = await mustArmAgain(BOOK, mode);
    const armed = readBook(readPreferences()[ARMED]);
    const wanted = wantedAlarms(now);
    const entries = new Map<string, AlarmEntry>([...wanted].map(([id, alarm]) => [id, { at: alarm.at, key: keyOf(alarm) }]));
    const plan = planAlarms(entries, armed, now, { armAll, ringLate: !first });
    const next: Record<string, string> = {};
    let failed = false;
    for (const [id, entry] of entries) if (armed.get(id)?.key === entry.key) next[id] = entry.key;
    for (const id of plan.arm) {
      const ok = await armEvent(wanted.get(id)!, exact).then(
        () => true,
        () => false,
      );
      // Not kept when it failed (a moment that went by meanwhile, Android refusing): tried again next time.
      if (ok) next[id] = entries.get(id)!.key;
      else {
        delete next[id];
        failed = true;
      }
    }
    for (const id of plan.ringNow) {
      await ringEventNow(wanted.get(id)!).catch(() => undefined);
      next[id] = entries.get(id)!.key;
    }
    // A late one not rung (the first run keeps no record of what rang): kept, so it never rings later.
    for (const [id, entry] of entries) if (entry.at <= now) next[id] ??= entry.key;
    for (const id of plan.gone) await disarmEvent(id).catch(() => undefined);
    writePreference(ARMED, next);
    if (!failed) rememberMode(BOOK, mode);
  });
  // A run that failed leaves the next ones free to try.
  running = running.catch(() => undefined);
  return running;
}

/** Asked from the root at each start: the hourly run with the app closed. */
export function keepAlarmsFresh(): void {
  keepRemindersFresh(REFRESH_MINUTES);
}

/**
 * The headless task (index.js, `remindersTask`), with the app closed or not: what other devices wrote
 * pulled first (the loop has it already when the app is in front), then the reminders seen to, and
 * the widgets handed today's pictures (a countdown's repeating event moved on to its next time).
 */
export async function runRemindersTask(): Promise<void> {
  if (!bootstrap().ok) return;
  await pullNow().catch(() => undefined);
  await reconcileAlarms();
  await publishWidgets();
}
