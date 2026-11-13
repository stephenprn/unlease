/**
 * « Aujourd'hui »: the day at a glance, the same on the web, the phone and the phone's widget. Each
 * client gathers what the day holds from what its views already read (the occurrences of the events
 * shown, and the layers kept on: the contacts' birthdays, Carnet's reminders, the days written in
 * pages); here it is put in the order a day is read:
 *
 * - what takes the whole day: birthdays, then all-day events (and a day inside a longer one), then
 *   the pages naming the day without a time;
 * - what has a time, in time order, each over, under way, next (all that start at that moment) or
 *   later, with the « now » line between what has started and what has not;
 * - Carnet's reminders missed these last days and still set (« Fait » clears one; an archived note
 *   is put away), most recent first;
 * - a short look at tomorrow: its birthdays and all-day events, then its first events.
 *
 * Pure: the clients hand it what they hold and the time it is, each minute, so « Dans 20 min »
 * counts down and the now line moves.
 */
import { t } from '@unlease/core/i18n';
import { formatClock } from '@unlease/core/services/format';
import type { LineColor } from '@unlease/design/colors';
import type { Note } from '@unlease/notes/models/entities';
import type { Day } from '../models/events';
import type { WeatherDay } from '../sync/routes';
import { clockWords, dayDistance, timeRange, weekdayDay } from './eventText';
import { remindersIn, type BirthdayItem, type ReminderItem } from './layers';
import type { Occurrence } from './occurrences';
import { addDays, dayToInstant, daysBetween } from './time';
import { temperatures, weatherKind, weatherTries, WEATHER_WORDS } from './weather';

const MINUTE = 60_000;

/** A day written in a page (Pages' `PageDate` fits it): Agenda's package sits under Pages', so it names only what it reads. */
export interface DayPage {
  readonly key: string;
  readonly pageId: string;
  /** '' for an untitled page. */
  readonly title: string;
  /** Its emoji, when it has one. */
  readonly icon?: string | null;
  readonly day: Day;
  /** `14:30`, or null for the day. */
  readonly time: string | null;
}

/** One thing of a day: an occurrence (its colour read once, null for the primary), or a layer's item. */
export type DayItem =
  | { readonly kind: 'event'; readonly key: string; readonly occurrence: Occurrence; readonly color: LineColor | null }
  | { readonly kind: 'birthday'; readonly key: string; readonly birthday: BirthdayItem }
  | { readonly kind: 'reminder'; readonly key: string; readonly reminder: ReminderItem }
  | { readonly kind: 'page'; readonly key: string; readonly page: DayPage };

/** Where a timed row stands against now: over (a reminder's moment passed: due), under way, the next to start, or later. */
export type RowState = 'past' | 'now' | 'next' | 'later';

export interface DayRow {
  readonly item: DayItem;
  /** It takes its whole day. */
  readonly allDay: boolean;
  /** Its start and end (ms); a reminder or a page's time is a moment (end = start); a whole-day row, the day's bounds. */
  readonly startAt: number;
  readonly endAt: number;
  /** Null for a whole-day row, which is neither before nor after now. */
  readonly state: RowState | null;
}

export interface TomorrowPlan {
  readonly day: Day;
  /** Its birthdays and all-day events, then its first events. */
  readonly rows: readonly DayRow[];
  /** Its events with a time not shown. */
  readonly more: number;
}

export interface TodayPlan {
  readonly day: Day;
  readonly allDay: readonly DayRow[];
  readonly timed: readonly DayRow[];
  /** Where the now line lies in `timed`: before the row at this index (`timed.length`: after the last). */
  readonly nowAt: number;
  /** Carnet's reminders missed before today and still set. */
  readonly overdue: readonly ReminderItem[];
  /** Null when tomorrow holds nothing shown here. */
  readonly tomorrow: TomorrowPlan | null;
  /** Nothing today: the day says so, and offers to add an event. */
  readonly empty: boolean;
}

/** How far back a reminder missed and still set is shown: a week (an import's years of past reminders stay in Carnet). */
export const OVERDUE_DAYS = 7;
/** Tomorrow's events with a time shown, after its whole days. */
export const TOMORROW_EVENTS = 3;

/** Whether an item touches `day`. */
export function itemTouches(item: DayItem, day: Day): boolean {
  switch (item.kind) {
    case 'event':
      return item.occurrence.firstDay <= day && item.occurrence.lastDay >= day;
    case 'birthday':
      return item.birthday.day === day;
    case 'reminder':
      return item.reminder.day === day;
    case 'page':
      return item.page.day === day;
  }
}

/** When an item happens on `day`: the whole day, or its start and end (a moment for a reminder or a page's time). */
export function itemTiming(item: DayItem, day: Day): { readonly allDay: boolean; readonly startAt: number; readonly endAt: number } {
  const whole = { allDay: true, startAt: dayToInstant(day), endAt: dayToInstant(addDays(day, 1)) };
  switch (item.kind) {
    case 'event': {
      const occurrence = item.occurrence;
      if (occurrence.allDay || (occurrence.firstDay < day && occurrence.lastDay > day)) return whole;
      return { allDay: false, startAt: occurrence.startAt, endAt: occurrence.endAt };
    }
    case 'birthday':
      return whole;
    case 'reminder':
      return { allDay: false, startAt: item.reminder.at, endAt: item.reminder.at };
    case 'page': {
      if (!item.page.time) return whole;
      const at = dayToInstant(day) + (Number(item.page.time.slice(0, 2)) * 60 + Number(item.page.time.slice(3, 5))) * MINUTE;
      return { allDay: false, startAt: at, endAt: at };
    }
  }
}

/** What an item is called, before the client's « Sans titre ». */
function titleOf(item: DayItem): string {
  switch (item.kind) {
    case 'event':
      return item.occurrence.event.title.trim();
    case 'birthday':
      return item.birthday.name;
    case 'reminder':
      return item.reminder.title;
    case 'page':
      return item.page.title;
  }
}

/** Whole days: birthdays, then events, then pages. Timed things at one moment: events, then reminders, then pages. */
const RANK: Readonly<Record<DayItem['kind'], number>> = { birthday: 0, event: 1, reminder: 2, page: 3 };

const byTitle = (a: DayRow, b: DayRow): number => titleOf(a.item).localeCompare(titleOf(b.item)) || (a.item.key < b.item.key ? -1 : a.item.key > b.item.key ? 1 : 0);

/**
 * A day's rows, whole days first (`allDay`), then what has a time in time order, each with where it
 * stands against `now` (`timed`): under way while it runs, over once it ended (a moment once it
 * came), next for those that start first after now, later for the rest.
 */
export function dayRows(items: readonly DayItem[], day: Day, now: number): { readonly allDay: DayRow[]; readonly timed: DayRow[] } {
  const touching = items.filter(item => itemTouches(item, day));
  const timings = touching.map(item => ({ item, ...itemTiming(item, day) }));
  const allDay = timings
    .filter(row => row.allDay)
    .map((row): DayRow => ({ ...row, state: null }))
    .sort((a, b) => RANK[a.item.kind] - RANK[b.item.kind] || byTitle(a, b));
  const timed = timings.filter(row => !row.allDay);
  const nextAt = timed.reduce((soonest, row) => (row.startAt > now && row.startAt < soonest ? row.startAt : soonest), Number.POSITIVE_INFINITY);
  const state = (row: { startAt: number; endAt: number }): RowState => {
    if (row.startAt > now) return row.startAt === nextAt ? 'next' : 'later';
    return now < row.endAt ? 'now' : 'past';
  };
  return {
    allDay,
    timed: timed
      .map((row): DayRow => ({ ...row, state: state(row) }))
      .sort((a, b) => a.startAt - b.startAt || b.endAt - b.startAt - (a.endAt - a.startAt) || RANK[a.item.kind] - RANK[b.item.kind] || byTitle(a, b)),
  };
}

/** Where the now line lies among timed rows: before the first that has not started. */
export const nowIndex = (timed: readonly DayRow[], now: number): number => {
  const index = timed.findIndex(row => row.startAt > now);
  return index < 0 ? timed.length : index;
};

/** Carnet's reminders missed in the `days` before `today` and still set (« Fait » clears one), on notes neither archived nor in the bin: the most recent first. */
export function overdueReminders(notes: Iterable<Note>, today: Day, days: number = OVERDUE_DAYS): ReminderItem[] {
  const open = [...notes].filter(note => !note.archived);
  return remindersIn(open, dayToInstant(addDays(today, -days)), dayToInstant(today)).reverse();
}

export interface TodayInput {
  readonly today: Day;
  readonly now: number;
  /** What touches today and tomorrow, as the client's views show it. */
  readonly items: readonly DayItem[];
  /** Carnet's reminders missed and still set (`overdueReminders`); none while its layer is off. */
  readonly overdue?: readonly ReminderItem[];
  /** The day's page in Pages (« Note du jour »): its row stands apart, so its day is not listed twice. */
  readonly dailyPageId?: string | null;
}

/** The day at a glance (see the module's head). */
export function planToday({ today, now, items, overdue = [], dailyPageId = null }: TodayInput): TodayPlan {
  const kept = dailyPageId ? items.filter(item => !(item.kind === 'page' && item.page.pageId === dailyPageId)) : items;
  const { allDay, timed } = dayRows(kept, today, now);
  const tomorrow = addDays(today, 1);
  const next = dayRows(
    kept.filter(item => item.kind === 'event' || item.kind === 'birthday'),
    tomorrow,
    now,
  );
  // What starts tomorrow: an event under way since today is already listed today.
  const tomorrowTimed = next.timed.filter(row => row.item.kind === 'event' && row.item.occurrence.firstDay === tomorrow);
  const tomorrowRows = [...next.allDay, ...tomorrowTimed.slice(0, TOMORROW_EVENTS)];
  return {
    day: today,
    allDay,
    timed,
    nowAt: nowIndex(timed, now),
    overdue,
    tomorrow: tomorrowRows.length > 0 ? { day: tomorrow, rows: tomorrowRows, more: Math.max(0, tomorrowTimed.length - TOMORROW_EVENTS) } : null,
    empty: allDay.length === 0 && timed.length === 0,
  };
}

/** « 20 min », « 1 h », « 1 h 05 »: a span of time, at least a minute. */
export function spanWords(minutes: number): string {
  const whole = Math.max(1, Math.round(minutes));
  if (whole < 60) return t('{minutes} min', { minutes: whole });
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? t('{hours} h', { hours }) : t('{hours} h {minutes}', { hours, minutes: String(rest).padStart(2, '0') });
}

/**
 * What a timed row says at its end as time passes: « Dans 20 min » for what comes next, « Encore
 * 25 min » while it runs (« En cours » when it ends after today), nothing otherwise. Counted in whole
 * minutes up, so it never says « Dans 0 min ».
 */
export function rowStateWords(row: Pick<DayRow, 'state' | 'startAt' | 'endAt'>, now: number, today: Day): string {
  if (row.state === 'next') return t('In {span}', { span: spanWords(Math.ceil((row.startAt - now) / MINUTE)) });
  if (row.state === 'now') {
    if (row.endAt > dayToInstant(addDays(today, 1))) return t('Happening now');
    return t('{span} left', { span: spanWords(Math.ceil((row.endAt - now) / MINUTE)) });
  }
  return '';
}

/**
 * A row's time on `day`: « 14:30 – 15:30 », « Toute la journée », « Jusqu’à 10:00 » (begun the day
 * before), « À partir de 22:00 » (going on past midnight), a reminder's or a page's moment.
 */
export function rowTimeWords(row: Pick<DayRow, 'item' | 'allDay'>, day: Day, twelveHours = false): string {
  if (row.allDay) return t('All day');
  const item = row.item;
  switch (item.kind) {
    case 'event': {
      const occurrence = item.occurrence;
      if (occurrence.firstDay < day) return t('Until {clock}', { clock: clockWords(formatClock(occurrence.endAt), twelveHours) });
      if (occurrence.lastDay > day) return t('From {clock}', { clock: clockWords(formatClock(occurrence.startAt), twelveHours) });
      return timeRange(occurrence, twelveHours);
    }
    case 'reminder':
      return clockWords(formatClock(item.reminder.at), twelveHours);
    case 'page':
      return item.page.time ? clockWords(item.page.time, twelveHours) : t('All day');
    case 'birthday':
      return t('All day');
  }
}

/** When a reminder was missed: « Hier · 18:00 », « sam. 7 nov. · 09:00 ». */
export function overdueWords(reminder: Pick<ReminderItem, 'at' | 'day'>, today: Day, twelveHours = false): string {
  const clock = clockWords(formatClock(reminder.at), twelveHours);
  if (daysBetween(reminder.day, today) === 1) {
    const yesterday = dayDistance(reminder.day, today);
    return `${yesterday.charAt(0).toLocaleUpperCase()}${yesterday.slice(1)} · ${clock}`;
  }
  return `${weekdayDay(reminder.day, Number(today.slice(0, 4)))} · ${clock}`;
}

/** Where the day's weather is asked, in order (`weatherTries`): its events' places (whole days first, as the day view's head), then the person's own. */
export function weatherPlaces(rows: readonly Pick<DayRow, 'item'>[], home: string): string[] {
  return weatherTries(
    rows.flatMap(row => (row.item.kind === 'event' ? [row.item.occurrence.event.place] : [])),
    home,
  );
}

/** The day's weather in one line, the same on both clients and the widget: « Nuageux · 14° / 7° », and the rain from a 30 % chance (« · 40 % de pluie »). */
export function weatherWords(day: WeatherDay): string {
  const rain = day.rain >= 30 ? ` · ${t('{rain}% chance of rain', { rain: Math.round(day.rain) })}` : '';
  return `${WEATHER_WORDS[weatherKind(day.code)]} · ${temperatures(day.max, day.min)}${rain}`;
}
