/**
 * What the home-screen widget « Prochaine alarme » is handed (`widgets.ts`), as JSON: never the
 * database. Which alarm rings next is the engine's to say (Kotlin counts it from its plan, what already
 * rang and the snoozes, so it stays true with the app closed); this side adds what only the app knows:
 * - `mornings`: by alarm and day (`<id>|2026-11-18`), for every ring of the next week, the day's first
 *   event as the home says it (« 08:15 · Train pour Lyon »), how far it stands from the alarm
 *   (« 15 min après le réveil »), and, when it comes too soon, why (« Moins de 30 min pour se
 *   préparer. », in Safran);
 * - `days`: the next two weeks' days in words (« Mer. 18 nov. »; the widget says « Aujourd’hui » and
 *   « Demain » itself, from the phone's date as it draws);
 * - `words`: what the widget says, in the app's language.
 */
import { t, tc } from '@unlease/core/i18n';
import type { Day } from '@unlease/calendar/models/events';
import { clockWords, longDay, weekdayDay } from '@unlease/calendar/services/eventText';
import { spanWords } from '@unlease/calendar/services/today';
import { addDays, instantToDay, instantToWall } from '@unlease/calendar/services/time';
import type { Alarm } from '@unlease/clock/models/alarm';
import type { ClockPrefs } from '@unlease/clock/models/prefs';
import { clashWith, dayAhead, firstEvent, type AgendaRecords } from '@unlease/clock/services/morning';
import { ringAt, ringsOn, wakingOn } from '@unlease/clock/services/schedule';
import { distanceWords } from '@unlease/clock/services/words';
import type { Timer } from '@unlease/clock/models/timer';
import type { WorldClock } from '@unlease/clock/models/worldClock';
import { lengthWords, quickLengths } from '@unlease/clock/services/timers';

/** The rings a widget may show the morning of: this week's, today's already rung included (a ring under way, a snooze). */
export const WIDGET_MORNING_DAYS = 8;
/** The days named in words: two weeks, as far as the engine looks for a next ring. */
const WIDGET_DAY_NAMES = 15;

export interface WidgetMorning {
  /** « 08:15 · Train pour Lyon », or the day's all-day events; '' when the calendar holds nothing after the alarm. */
  readonly event: string;
  /** « 15 min après le réveil », « Toute la journée », or, with no event, the home's quiet line (« Rien dans votre agenda ce jour-là. »). */
  readonly after: string;
  /** Why that event comes too soon (« Moins de 30 min pour se préparer. »); '' when the morning leaves room. */
  readonly clash: string;
}

export interface AlarmWidgetPayload {
  readonly locale: string;
  readonly twelveHours: boolean;
  readonly words: {
    readonly today: string;
    readonly tomorrow: string;
    readonly none: string;
    readonly notHere: string;
    /** The same where one line is all there is. */
    readonly offHere: string;
    /** `{time}` stays for the widget to fill with the snooze's end. */
    readonly snoozed: string;
    readonly ringing: string;
    readonly newAlarm: string;
  };
  readonly days: Readonly<Record<Day, string>>;
  readonly mornings: Readonly<Record<string, WidgetMorning>>;
  /** What the timers', the stopwatch's, the world clocks' and the big clock's widgets add (`toolsWidgetPayload`). */
  readonly tools?: ToolsWidgetPayload;
}

/**
 * What only the app knows for the other widgets: the saved timers (each a row that starts it with the
 * app closed), the lengths offered when none is saved, the cities west to east, the words.
 */
export interface ToolsWidgetPayload {
  readonly timers: readonly { readonly id: string; readonly label: string; readonly seconds: number; readonly length: string; readonly sound: string; readonly vibrate: boolean }[];
  readonly quick: readonly { readonly seconds: number; readonly length: string }[];
  readonly cities: readonly { readonly zone: string; readonly name: string; readonly lat: number | null; readonly lon: number | null }[];
  readonly words: Readonly<Record<string, string>>;
}

export function toolsWidgetPayload(timers: readonly Timer[], recent: readonly number[], cities: readonly WorldClock[]): ToolsWidgetPayload {
  return {
    timers: timers.map(timer => ({ id: timer.id, label: timer.label.trim(), seconds: timer.seconds, length: lengthWords(timer.seconds), sound: timer.sound, vibrate: timer.vibrate })),
    quick: quickLengths(recent).map(seconds => ({ seconds, length: lengthWords(seconds) })),
    cities: cities.map(clock => ({ zone: clock.zone, name: clock.name, lat: clock.lat, lon: clock.lon })),
    words: {
      timers: t('Timers'),
      newTimer: t('New timer'),
      startTimer: t('Start {name}', { name: '{name}' }),
      start: tc('timer', 'Start'),
      worldClocks: t('World clocks'),
      addCity: t('Add a city'),
      noCities: t('Add the cities you follow in Clock.'),
      today: t('Today'),
      tomorrow: t('Tomorrow'),
      yesterday: t('Yesterday'),
      sameTime: t('Same time'),
    },
  };
}

const capitalize = (value: string): string => value.charAt(0).toLocaleUpperCase() + value.slice(1);

/** What waits after this alarm on this day: as the home's morning panel says it. */
function morningOf(alarm: Alarm, day: Day, at: number, live: readonly Alarm[], agenda: AgendaRecords, prefs: Pick<ClockPrefs, 'marginMinutes' | 'twelveHours'>, now: number, zone: string): WidgetMorning {
  const ahead = dayAhead(agenda, day);
  // The day's first alarm is what wakes the person: the clash and the day's first event count from it; a later one, from itself.
  const wakeup = wakingOn(live, day, zone);
  const isWakeup = wakeup?.alarm.id === alarm.id;
  const first = isWakeup ? firstEvent(ahead, day === instantToDay(now, zone) ? now : Number.NEGATIVE_INFINITY) : firstEvent(ahead, at);
  // Only while the ring is still to come: a clash this morning once it rang is history.
  const clash = isWakeup && at > now ? clashWith(ahead, at, prefs.marginMinutes, zone) : null;
  const clashWords = clash ? (clash.minutes < 0 ? t('It starts before your alarm.') : t('Less than {span} to get ready.', { span: spanWords(prefs.marginMinutes) })) : '';
  if (first) {
    const clock = clockWords(instantToWall(first.startAt, zone).slice(11, 16), prefs.twelveHours);
    const title = first.event.title.trim() || t('Untitled');
    return { event: `${clock} · ${title}`, after: distanceWords(Math.round((first.startAt - at) / 60_000)), clash: clashWords };
  }
  if (isWakeup && ahead.allDay.length > 0) {
    return { event: ahead.allDay.map(item => item.event.title.trim() || t('Untitled')).join(', '), after: t('All day'), clash: clashWords };
  }
  // Nothing to get up for: said as the home says it.
  const quiet = !isWakeup ? t('Nothing in your calendar after this alarm.') : day === instantToDay(now, zone) && ahead.timed.length > 0 ? t('Nothing left in your calendar today.') : t('Nothing in your calendar that day.');
  return { event: '', after: quiet, clash: clashWords };
}

/**
 * The widget's picture: `alarms` as they ring (`ringingAlarmsNow`, as the engine's plan holds them),
 * Agenda's records, the device's settings and language.
 */
export function alarmWidgetPayload(alarms: Iterable<Alarm>, agenda: AgendaRecords, prefs: Pick<ClockPrefs, 'marginMinutes' | 'twelveHours'>, locale: string, now: number, zone = ''): AlarmWidgetPayload {
  const live = [...alarms].filter(alarm => alarm.deletedAt === null && alarm.enabled);
  const today = instantToDay(now, zone);
  const days: Record<Day, string> = {};
  for (let index = 2; index < WIDGET_DAY_NAMES; index += 1) {
    const day = addDays(today, index);
    days[day] = index < 7 ? capitalize(weekdayDay(day)) : longDay(day);
  }
  const mornings: Record<string, WidgetMorning> = {};
  for (let index = 0; index < WIDGET_MORNING_DAYS; index += 1) {
    const day = addDays(today, index);
    for (const alarm of live) {
      if (!ringsOn(alarm, day)) continue;
      mornings[`${alarm.id}|${day}`] = morningOf(alarm, day, ringAt(day, alarm.time, zone), live, agenda, prefs, now, zone);
    }
  }
  return {
    locale,
    twelveHours: prefs.twelveHours,
    words: {
      today: t('Today'),
      tomorrow: t('Tomorrow'),
      none: t('No alarm'),
      notHere: t('Alarms don’t ring on this phone'),
      offHere: t('Not on this phone'),
      snoozed: t('Snoozed until {time}', { time: '{time}' }),
      ringing: t('Ringing'),
      newAlarm: t('New alarm'),
    },
    days,
    mornings,
  };
}
