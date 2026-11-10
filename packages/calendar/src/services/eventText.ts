/**
 * How an event reads: when it happens (« lun. 2 nov. · 14:30 – 15:30 », « Du 2 au 4 nov. »), its
 * reminders (« 10 minutes avant »), the views' titles (« novembre 2026 », « 2 – 8 nov. 2026 »).
 * Hand-written like `core/services/format`: the same on Hermes, the browsers and Node.
 */
import { getLocale, localized, t, tx } from '@unlease/core/i18n';
import { formatClock, monthNames, plural, weekdayNames } from '@unlease/core/services/format';
import { birthdayOf, elides } from '@unlease/contacts/services/birthdays';
import type { CalendarEvent, Day } from '../models/events';
import type { Occurrence } from './occurrences';
import { addDays, clockPart, daysBetween, deviceZone, isDay, isoWeek, partsOf, weekdayOf } from './time';

const english = (): boolean => getLocale() === 'en';
const NBSP = ' ';
const SHORT_MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const SHORT_MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHORT_DAYS_FR = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const SHORT_DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NARROW_DAYS_FR = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const NARROW_DAYS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const capitalize = (value: string): string => value.charAt(0).toLocaleUpperCase() + value.slice(1);

export const shortMonth = (month: number): string => (english() ? SHORT_MONTHS_EN : SHORT_MONTHS_FR)[month - 1]!;
export const shortWeekday = (weekday: number): string => (english() ? SHORT_DAYS_EN : SHORT_DAYS_FR)[weekday]!;
/** « L », « M »: a month grid's head. */
export const narrowWeekday = (weekday: number): string => (english() ? NARROW_DAYS_EN : NARROW_DAYS_FR)[weekday]!;

/** « 2 nov. », « 2 nov. 2027 » outside `year` (English « 2 Nov »). */
export function shortDay(day: Day, year?: number): string {
  const p = partsOf(day);
  const withYear = year !== undefined && p.year !== year;
  return english() ? `${p.day}${NBSP}${shortMonth(p.month)}${withYear ? ` ${p.year}` : ''}` : `${p.day}${NBSP}${shortMonth(p.month)}${withYear ? `${NBSP}${p.year}` : ''}`;
}

/** « lun. 2 nov. » (English « Mon 2 Nov »). */
export function weekdayDay(day: Day, year?: number): string {
  return `${shortWeekday(weekdayOf(day))} ${shortDay(day, year)}`;
}

/** « Lundi 2 novembre 2026 » (English « Monday 2 November 2026 »). */
export function longDay(day: Day): string {
  const p = partsOf(day);
  return capitalize(`${weekdayNames()[weekdayOf(day)]} ${p.day}${NBSP}${monthNames()[p.month - 1]} ${p.year}`);
}

/** « Novembre 2026 ». */
export function monthTitle(month: string): string {
  const p = partsOf(`${month.slice(0, 7)}-01`);
  return capitalize(`${monthNames()[p.month - 1]} ${p.year}`);
}

/** « 2 – 8 nov. 2026 », « 30 nov. – 6 déc. 2026 », « 28 déc. 2026 – 3 janv. 2027 ». */
export function rangeTitle(first: Day, last: Day): string {
  const a = partsOf(first);
  const b = partsOf(last);
  if (a.year !== b.year) return `${shortDay(first)} ${a.year} – ${shortDay(last)} ${b.year}`;
  if (a.month !== b.month) return `${shortDay(first)} – ${shortDay(last)} ${b.year}`;
  return english() ? `${a.day} – ${b.day}${NBSP}${shortMonth(b.month)} ${b.year}` : `${a.day} – ${b.day}${NBSP}${shortMonth(b.month)}${NBSP}${b.year}`;
}

/** « Semaine 45 ». */
export const weekNumberWords = (day: Day): string => t('Semaine {week}', { week: isoWeek(day) });
/** « S45 » (English « W45 »): a week's number in a view's gutter, the month's and the days', on both clients. */
export const weekNumberShort = (day: Day): string => t('S{week}', { week: isoWeek(day) });

/** A time of day as the interface writes it: `14:30`, or English's `2:30 PM` when the device asked for 12 hours. */
export function clockWords(clock: string, twelveHours = false): string {
  if (!twelveHours) return clock;
  const hour = Number(clock.slice(0, 2));
  const minute = clock.slice(3, 5);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return minute === '00' ? `${shown}${NBSP}${suffix}` : `${shown}:${minute}${NBSP}${suffix}`;
}

/** An hour's label in a day's column (`14:00`, `2 PM`). */
export const hourLabel = (hour: number, twelveHours = false): string => clockWords(`${String(hour).padStart(2, '0')}:00`, twelveHours);

/** « 14:30 – 15:30 », for an occurrence on this device (its own day's part when it spans days). */
export function timeRange(item: Pick<Occurrence, 'startAt' | 'endAt' | 'allDay'>, twelveHours = false): string {
  if (item.allDay) return t('Toute la journée');
  const start = clockWords(formatClock(item.startAt), twelveHours);
  if (item.endAt <= item.startAt) return start;
  return `${start} – ${clockWords(formatClock(item.endAt), twelveHours)}`;
}

/**
 * When an occurrence happens, in one line: « lun. 2 nov. · 14:30 – 15:30 », « lun. 2 nov. · Toute la
 * journée », « Du lun. 2 nov. au mer. 4 nov. », « lun. 2 nov. 22:00 – mar. 3 nov. 01:00 ».
 */
export function whenLine(item: Pick<Occurrence, 'startAt' | 'endAt' | 'allDay' | 'firstDay' | 'lastDay'>, now: number, twelveHours = false): string {
  const year = partsOf(new Date(now).toISOString().slice(0, 10)).year;
  if (item.allDay) {
    if (item.firstDay === item.lastDay) return `${weekdayDay(item.firstDay, year)} · ${t('Toute la journée')}`;
    return t('Du {from} au {to}', { from: weekdayDay(item.firstDay, year), to: weekdayDay(item.lastDay, year) });
  }
  if (item.firstDay === item.lastDay) return `${weekdayDay(item.firstDay, year)} · ${timeRange(item, twelveHours)}`;
  return `${weekdayDay(item.firstDay, year)} ${clockWords(formatClock(item.startAt), twelveHours)} – ${weekdayDay(item.lastDay, year)} ${clockWords(formatClock(item.endAt), twelveHours)}`;
}

/** The event's own zone, when it is not this device's: « Heure de New York (America/New_York) ». */
export function zoneNote(event: Pick<CalendarEvent, 'timeZone' | 'start'>): string | null {
  if (isDay(event.start) || !event.timeZone || event.timeZone === deviceZone()) return null;
  return t('Fuseau : {zone} ({clock} sur place)', { zone: event.timeZone.replace(/_/g, ' '), clock: clockPart(event.start) });
}

/** A reminder in words: « 10 minutes avant », « 1 heure avant », « 2 jours avant », « Le jour même à 09:00 ». */
export function reminderWords(minutes: number, allDay: boolean): string {
  if (allDay && minutes <= 0) return t('Le jour même à {clock}', { clock: clockFromMinutes(-minutes) });
  if (allDay && minutes % 1440 !== 0) {
    const days = Math.ceil(minutes / 1440);
    return t('{days} avant à {clock}', { days: plural(days, 'jour'), clock: clockFromMinutes(days * 1440 - minutes) });
  }
  if (minutes === 0) return t('Au début');
  if (minutes % 10_080 === 0) return t('{count} avant', { count: plural(minutes / 10_080, 'semaine') });
  if (minutes % 1440 === 0) return t('{count} avant', { count: plural(minutes / 1440, 'jour') });
  if (minutes % 60 === 0) return t('{count} avant', { count: plural(minutes / 60, 'heure') });
  return t('{count} avant', { count: plural(minutes, 'minute') });
}

const clockFromMinutes = (minutes: number): string => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** The reminders offered first, for a timed event and for an all-day one. */
export const REMINDER_CHOICES = { timed: [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10_080], allDay: [-540, -480, 900, 2340, 9540] } as const;

/** « dans 3 jours », « demain », « aujourd’hui », « il y a 2 jours »: how far a day is. */
export function dayDistance(day: Day, today: Day): string {
  const delta = daysBetween(today, day);
  if (delta === 0) return t('aujourd’hui');
  if (delta === 1) return t('demain');
  if (delta === -1) return t('hier');
  if (delta > 1) return t('dans {count}', { count: plural(delta, 'jour') });
  return t('il y a {count}', { count: plural(-delta, 'jour') });
}

/**
 * How near an occurrence is, as its page heads it: « En cours », « Dans 20 min », « Dans 3 h »,
 * « Demain », « Dans 5 jours », « Terminé » (earlier today), « Il y a 2 jours ».
 */
export function relativeWhen(item: Pick<Occurrence, 'startAt' | 'endAt' | 'allDay' | 'firstDay' | 'lastDay'>, now: number, today: Day): string {
  const ongoing = item.allDay ? item.firstDay <= today && today <= item.lastDay : item.startAt <= now && now < item.endAt;
  if (ongoing) return t('En cours');
  if (!item.allDay && item.firstDay === today) {
    if (item.endAt <= now) return t('Terminé');
    const minutes = Math.max(1, Math.round((item.startAt - now) / 60_000));
    return minutes < 60 ? t('Dans {minutes} min', { minutes }) : t('Dans {count}', { count: plural(Math.round(minutes / 60), 'heure') });
  }
  return capitalize(dayDistance(item.firstDay, today));
}

/** The calendar's views, in the order the bars' switchers offer them (the phone's tiles, the web's track). */
export const PERIOD_VIEWS = ['day', 'threeDays', 'week', 'month', 'year', 'schedule'] as const;
/**
 * Every view: « Aujourd'hui » (the day at a glance, a place of its own at the head of the navigation,
 * `services/today`), then the calendar's. Any of them can be the one Agenda opens on.
 */
export const VIEWS = ['today', ...PERIOD_VIEWS] as const;
export type CalendarView = (typeof VIEWS)[number];
export type PeriodView = (typeof PERIOD_VIEWS)[number];

export const isPeriodView = (view: CalendarView): view is PeriodView => view !== 'today';

export const VIEW_NAMES: Readonly<Record<CalendarView, string>> = localized({
  today: tx('Aujourd’hui'),
  day: tx('Jour'),
  threeDays: tx('3 jours'),
  week: tx('Semaine'),
  month: tx('Mois'),
  year: tx('Année'),
  schedule: tx('Planning'),
});

/** The view's keys on the web (Google's: D, X, W, M, Y, A; O for « Aujourd'hui », T being « go to today » in any view). */
export const VIEW_KEYS: Readonly<Record<CalendarView, string>> = { today: 'o', day: 'd', threeDays: 'x', week: 'w', month: 'm', year: 'y', schedule: 'a' };

export function isCalendarView(value: unknown): value is CalendarView {
  return typeof value === 'string' && (VIEWS as readonly string[]).includes(value);
}

/** The days a view shows around a day: [first, last] both included. */
export function viewDays(view: CalendarView, day: Day, weekStart: number, hideWeekends = false): Day[] {
  switch (view) {
    case 'day':
      return [day];
    case 'threeDays':
      return [day, addDays(day, 1), addDays(day, 2)];
    case 'week': {
      const offset = (weekdayOf(day) - weekStart + 7) % 7;
      const first = addDays(day, -offset);
      const days = Array.from({ length: 7 }, (_, index) => addDays(first, index));
      return hideWeekends ? days.filter(each => weekdayOf(each) !== 0 && weekdayOf(each) !== 6) : days;
    }
    default:
      return [day];
  }
}

/** The day a view moves to, one step back or forward. */
export function stepDay(view: CalendarView, day: Day, direction: 1 | -1): Day {
  switch (view) {
    // « Aujourd'hui » is today, always: it never turns.
    case 'today':
      return day;
    case 'day':
      return addDays(day, direction);
    case 'threeDays':
      return addDays(day, 3 * direction);
    case 'week':
      return addDays(day, 7 * direction);
    case 'month': {
      const p = partsOf(day);
      const index = p.year * 12 + p.month - 1 + direction;
      return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}-01`;
    }
    case 'year':
      return `${String(partsOf(day).year + direction).padStart(4, '0')}-01-01`;
    case 'schedule':
      return addDays(day, 14 * direction);
  }
}

/** « Lundi 9 novembre »: a day of this year, as « Aujourd'hui » heads it (the year goes without saying). */
export function dayTitle(day: Day): string {
  const p = partsOf(day);
  return capitalize(`${weekdayNames()[weekdayOf(day)]} ${p.day}${NBSP}${monthNames()[p.month - 1]}`);
}

/** The view's title: « Lundi 9 novembre » (today), « Lundi 2 novembre 2026 », « 2 – 8 nov. 2026 », « Novembre 2026 », « 2026 ». */
export function viewTitle(view: CalendarView, day: Day, weekStart: number, hideWeekends = false): string {
  switch (view) {
    case 'today':
      return dayTitle(day);
    case 'day':
      return longDay(day);
    case 'threeDays':
    case 'week': {
      const days = viewDays(view, day, weekStart, hideWeekends);
      return rangeTitle(days[0]!, days[days.length - 1]!);
    }
    case 'month':
    case 'schedule':
      return monthTitle(day);
    case 'year':
      return day.slice(0, 4);
  }
}

/** « Anniversaire de Léa (34 ans) », « Anniversaire de Léa ». */
export function birthdayTitle(name: string, age: number | null): string {
  if (age === null) return birthdayOf(name);
  return elides(name) ? t('Anniversaire d’{name} ({age})', { name, age: plural(age, 'an') }) : t('Anniversaire de {name} ({age})', { name, age: plural(age, 'an') });
}

/**
 * The slip once « Supprimer » is done, the same on both clients (with « Annuler »): the event, or a
 * series whole, went to the bin; or occurrences were taken out of their series, which never go there.
 */
export function deletedWords(occurrence: Pick<Occurrence, 'repeats' | 'occurrence'>, seriesStart: string, scope: 'this' | 'following' | 'all'): string {
  const binned = !occurrence.repeats || scope === 'all' || (scope === 'following' && occurrence.occurrence === seriesStart);
  return binned ? t('Événement placé dans la corbeille') : t('Événement supprimé');
}

/** A new event's length in words, on both clients: « 45 minutes », « 1 heure », « 1 h 30 ». */
export function lengthWords(minutes: number): string {
  if (minutes < 60) return plural(minutes, 'minute');
  if (minutes % 60 === 0) return plural(minutes / 60, 'heure');
  return t('{hours} h {minutes}', { hours: Math.floor(minutes / 60), minutes: String(minutes % 60).padStart(2, '0') });
}

/** « 3 événements supprimés définitivement »: the bin emptied, or rows of it deleted for good. */
export const deletedForGoodWords = (count: number): string => t('{deleted} définitivement', { deleted: plural(count, 'événement supprimé', 'événements supprimés') });
