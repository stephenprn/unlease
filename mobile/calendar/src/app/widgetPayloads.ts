/**
 * What each home-screen widget draws, handed to it as JSON (`widgets.ts`): the widgets never read the
 * database. Each carries a few days more than it shows, and the instants and days of what it holds,
 * so a widget the app has not fed since yesterday still starts at today and drops what ended (the
 * Kotlin side compares them with the clock when it draws, every half hour).
 *
 * - « Planning »: the next two weeks, day by day, each item its time, title, place and colour.
 * - « Mois »: this month's grid (and the next's), the days holding something marked.
 * - « Prochain événement »: the next items, the first not over shown.
 * - « Compte à rebours »: one event chosen when it was placed, its next occurrences (one for an event
 *   that does not repeat), each with its days here and the words of its line; the widget counts the
 *   days from today to the first not over (« J-12 »), so the count stays true without the app.
 */
import { t } from '@unlease/core/i18n';
import { formatClock } from '@unlease/core/services/format';
import type { LineColor } from '@unlease/design/colors';
import { isLive, type CalendarEvent } from '@unlease/calendar/models/events';
import type { CalendarPrefs } from '@unlease/calendar/models/prefs';
import { eventColor } from '@unlease/calendar/services/colors';
import { birthdayTitle, clockWords, dayDistance, monthTitle, narrowWeekday, timeRange, weekdayDay } from '@unlease/calendar/services/eventText';
import { findOccurrence, hiddenFeedIds, occurrencesIn, type Occurrence } from '@unlease/calendar/services/occurrences';
import { searchEvents } from '@unlease/calendar/services/search';
import { addDays, addMonths, dayToInstant, monthGrid, startOfMonth, today } from '@unlease/calendar/services/time';
import { appScheme } from '@shared/app/variant';

import { agendaIn, itemsOn, LAYER_COLORS, type AgendaItem } from './agenda';
import { nameOf } from './mentionNames';
import type { LibraryState } from './store/libraryStore';

export const SCHEDULE_DAYS = 14;
const MOST_PER_DAY = 8;

export interface WidgetItem {
  readonly key: string;
  readonly title: string;
  /** « 14:30 – 15:30 », « Toute la journée ». */
  readonly time: string;
  readonly place: string;
  /** A pigment key, '' for the primary. */
  readonly color: string;
  /** What a tap opens: `unlease-agenda://<open>` (or another app's address, whole). */
  readonly open: string;
  /** When it ends (ms): past it, a widget drops it. */
  readonly endAt: number;
}

export interface WidgetDay {
  readonly day: string;
  /** « lun. 2 nov. ». */
  readonly label: string;
  readonly items: readonly WidgetItem[];
}

export interface SchedulePayload {
  readonly id: 'schedule';
  readonly title: string;
  readonly today: string;
  readonly tomorrow: string;
  readonly empty: string;
  readonly days: readonly WidgetDay[];
}

export interface MonthCell {
  readonly day: string;
  readonly number: number;
  readonly inMonth: boolean;
  /** How many things it holds (dots, at most 3). */
  readonly count: number;
  readonly color: string;
}

export interface MonthGridPayload {
  readonly month: string;
  readonly title: string;
  readonly weeks: readonly (readonly MonthCell[])[];
}

export interface MonthPayload {
  readonly id: 'month';
  readonly weekdays: readonly string[];
  /** This month and the next: the widget shows the one holding today. */
  readonly months: readonly MonthGridPayload[];
}

export interface NextPayload {
  readonly id: 'next';
  readonly title: string;
  readonly empty: string;
  /** The next items, each with its day's words. */
  readonly items: readonly (WidgetItem & { readonly day: string; readonly dayLabel: string })[];
}

function asWidgetItem(item: AgendaItem, day: string, twelve: boolean): WidgetItem {
  const end = dayToInstant(addDays(day, 1));
  switch (item.kind) {
    case 'event': {
      const occurrence = item.occurrence;
      const allDay = occurrence.allDay || (occurrence.firstDay < day && occurrence.lastDay > day);
      const time = allDay ? t('Toute la journée') : `${clockWords(formatClock(occurrence.startAt), twelve)} – ${clockWords(formatClock(occurrence.endAt), twelve)}`;
      return {
        key: `${item.key}|${day}`,
        title: occurrence.event.title.trim() || t('Sans titre'),
        time,
        place: occurrence.event.place.trim(),
        color: item.color ?? '',
        open: `event/${encodeURIComponent(occurrence.seriesId)}?at=${encodeURIComponent(occurrence.occurrence)}`,
        endAt: allDay ? end : occurrence.endAt,
      };
    }
    case 'birthday':
      return { key: item.key, title: birthdayTitle(item.birthday.name, item.birthday.age), time: t('Toute la journée'), place: '', color: LAYER_COLORS.birthday, open: `birthday/${encodeURIComponent(item.birthday.contactId)}`, endAt: end };
    case 'reminder':
      return { key: item.key, title: item.reminder.title || t('Sans titre'), time: clockWords(formatClock(item.reminder.at), twelve), place: '', color: LAYER_COLORS.reminder, open: `${appScheme('notes')}://note/${encodeURIComponent(item.reminder.noteId)}`, endAt: item.reminder.at + 30 * 60_000 };
    case 'page':
      return { key: item.key, title: item.page.title || t('Sans titre'), time: item.page.time ? clockWords(item.page.time, twelve) : t('Toute la journée'), place: '', color: LAYER_COLORS.page, open: `${appScheme('pages')}://page/${encodeURIComponent(item.page.pageId)}`, endAt: end };
  }
}

export function schedulePayload(state: LibraryState, prefs: CalendarPrefs, now: number): SchedulePayload {
  const first = today(now);
  const last = addDays(first, SCHEDULE_DAYS);
  const agenda = agendaIn(state, prefs, first, last);
  const days: WidgetDay[] = [];
  for (let day = first; day < last; day = addDays(day, 1)) {
    const items = itemsOn(state, agenda, day).slice(0, MOST_PER_DAY).map(item => asWidgetItem(item, day, prefs.twelveHours));
    if (items.length > 0) days.push({ day, label: weekdayDay(day), items });
  }
  return { id: 'schedule', title: t('Planning'), today: t('Aujourd’hui'), tomorrow: t('Demain'), empty: t('Rien de prévu pour ces deux semaines.'), days };
}

export function monthPayload(state: LibraryState, prefs: CalendarPrefs, now: number): MonthPayload {
  const first = startOfMonth(today(now));
  const months = [first, addMonths(first, 1)].map(month => {
    const weeks = monthGrid(month, prefs.weekStart);
    const from = weeks[0]![0]!;
    const to = addDays(weeks[weeks.length - 1]![6]!, 1);
    const agenda = agendaIn(state, prefs, from, to);
    return {
      month,
      title: monthTitle(month),
      weeks: weeks.map(week =>
        week.map(day => {
          const items = itemsOn(state, agenda, day);
          const firstColor = items.map(item => (item.kind === 'event' ? (item.color ?? '') : LAYER_COLORS[item.kind])).find(color => color !== undefined) ?? '';
          return { day, number: Number(day.slice(8, 10)), inMonth: day.slice(0, 7) === month.slice(0, 7), count: Math.min(3, items.length), color: firstColor };
        }),
      ),
    };
  });
  return { id: 'month', weekdays: Array.from({ length: 7 }, (_, index) => narrowWeekday((prefs.weekStart + index) % 7)), months };
}

/** Whether an item takes its whole day (an all-day event, a day inside a longer one, a birthday, a page's day without a time). */
function wholeDay(item: AgendaItem, day: string): boolean {
  switch (item.kind) {
    case 'event':
      return item.occurrence.allDay || (item.occurrence.firstDay < day && item.occurrence.lastDay > day);
    case 'birthday':
      return true;
    case 'reminder':
      return false;
    case 'page':
      return item.page.time === null;
  }
}

export function nextPayload(state: LibraryState, prefs: CalendarPrefs, now: number): NextPayload {
  const first = today(now);
  const last = addDays(first, 30);
  const agenda = agendaIn(state, prefs, first, last);
  const items: NextPayload['items'][number][] = [];
  for (let day = first; day < last && items.length < 6; day = addDays(day, 1)) {
    // A day's timed things first: the one under way, or the next, is what the widget shows, before a day-long one.
    const all = itemsOn(state, agenda, day);
    for (const item of [...all.filter(each => !wholeDay(each, day)), ...all.filter(each => wholeDay(each, day))]) {
      // A day-long thing on a later day of an event already listed is the same one.
      if (item.kind === 'event' && item.occurrence.firstDay < day) continue;
      items.push({ ...asWidgetItem(item, day, prefs.twelveHours), day, dayLabel: weekdayDay(day) });
      if (items.length >= 6) break;
    }
  }
  return { id: 'next', title: t('Prochain événement'), empty: t('Rien de prévu'), items };
}

/** How many of a repeating event's next occurrences a countdown carries: it moves on to the next without the app. */
const COUNTDOWN_AHEAD = 8;
/** How far a countdown looks for a repeating event's next (or last) occurrence: a yearly one and more. */
const COUNTDOWN_HORIZON_DAYS = 800;
/** How far the picker lists what is coming, before a search: a year, and a little. */
const CHOICES_DAYS = 400;
/** Rows the picker shows at most. */
const CHOICES_SHOWN = 100;

/** A countdown's target: the event (a series, for one that repeats) it counts to. */
export const countdownTarget = (eventId: string): string => `event:${eventId}`;

/** The event a countdown's target names. */
export const countdownEventId = (target: string): string => (target.startsWith('event:') ? target.slice('event:'.length) : target);

export interface CountdownOccurrence {
  /** Its first and last days here (this phone's zone, as the views show it): the widget counts to `day`. */
  readonly day: string;
  readonly lastDay: string;
  /** When it ends (ms): past it, the widget counts to the next one. */
  readonly endAt: number;
  /** Its line on any other day: « mer. 24 déc. · 14:30 », « mer. 24 déc. », « Du mer. 24 déc. au ven. 26 déc. ». */
  readonly when: string;
  /** Its start's time, after « Demain » the day before; '' all day. */
  readonly time: string;
  /** Its line on its own days: « 14:30 – 15:30 », « Toute la journée », « Jusqu’au ven. 26 déc. ». */
  readonly onDay: string;
  /** What a tap opens: `unlease-agenda://<open>`. */
  readonly open: string;
}

export interface CountdownPayload {
  readonly id: 'countdown';
  /** The widget's target (`event:<id>`): a picture of another event is never drawn. */
  readonly target: string;
  /** In the bin, deleted, or not on this phone: the widget says so, and a tap chooses another. */
  readonly gone: boolean;
  readonly title: string;
  /** A pigment key, '' for none (the accent's ink, as the other widgets paint it). */
  readonly color: string;
  /** From the one under way or next on (for a repeating event); the one, past or not, for an event that does not repeat. */
  readonly occurrences: readonly CountdownOccurrence[];
}

/**
 * The occurrences a countdown to `seriesId` counts to: an event that does not repeat, its one; a
 * series, its next ones not over (its exceptions where they moved), else its last. None when it is
 * gone or in the bin.
 */
export function countdownOccurrences(state: Pick<LibraryState, 'events'>, seriesId: string, now: number): Occurrence[] {
  const series = state.events[seriesId];
  if (!series || !isLive(series)) return [];
  if (!series.rrule) {
    const one = findOccurrence(state.events, seriesId, null);
    return one ? [one] : [];
  }
  const own: CalendarEvent[] = [series, ...Object.values(state.events).filter(event => event.recurringId === seriesId)];
  const first = today(now);
  const byStart = (a: Occurrence, b: Occurrence): number => a.startAt - b.startAt;
  const ahead = occurrencesIn(own, first, addDays(first, COUNTDOWN_HORIZON_DAYS))
    .filter(item => item.endAt > now)
    .sort(byStart);
  if (ahead.length > 0) return ahead.slice(0, COUNTDOWN_AHEAD);
  const before = occurrencesIn(own, addDays(first, -COUNTDOWN_HORIZON_DAYS), first).sort(byStart);
  return before.slice(-1);
}

function countdownOccurrence(occurrence: Occurrence, year: number, twelve: boolean): CountdownOccurrence {
  const several = occurrence.firstDay !== occurrence.lastDay;
  const from = weekdayDay(occurrence.firstDay, year);
  const clock = occurrence.allDay ? '' : clockWords(formatClock(occurrence.startAt), twelve);
  const when = occurrence.allDay && several ? t('Du {from} au {to}', { from, to: weekdayDay(occurrence.lastDay, year) }) : clock ? `${from} · ${clock}` : from;
  return {
    day: occurrence.firstDay,
    lastDay: occurrence.lastDay,
    endAt: occurrence.endAt,
    when,
    time: clock,
    onDay: occurrence.allDay && several ? t('Jusqu’au {day}', { day: weekdayDay(occurrence.lastDay, year) }) : timeRange(occurrence, twelve),
    open: `event/${encodeURIComponent(occurrence.seriesId)}?at=${encodeURIComponent(occurrence.occurrence)}`,
  };
}

/** « Compte à rebours » for `target` (`event:<id>`). */
export function countdownPayload(target: string, state: LibraryState, prefs: CalendarPrefs, now: number): CountdownPayload {
  const id = countdownEventId(target);
  const series = state.events[id];
  const occurrences = countdownOccurrences(state, id, now);
  if (!series || occurrences.length === 0) return { id: 'countdown', target, gone: true, title: '', color: '', occurrences: [] };
  const year = Number(today(now).slice(0, 4));
  // The title and colour of the occurrence it counts to: an exception may have its own.
  const shown = occurrences.find(item => item.endAt > now)?.event ?? series;
  return {
    id: 'countdown',
    target,
    gone: false,
    title: shown.title.trim() || t('Sans titre'),
    color: eventColor(shown, state.calendarLabels, state.feeds) ?? '',
    occurrences: occurrences.map(occurrence => countdownOccurrence(occurrence, year, prefs.twelveHours)),
  };
}

/** An event the countdown's picker offers: at its next occurrence (its last, for one past). */
export interface CountdownChoice {
  readonly eventId: string;
  readonly title: string;
  readonly color: LineColor | null;
  /** « mer. 24 déc. · 14:30 ». */
  readonly when: string;
  /** « dans 48 jours », « demain », « En cours », « il y a 3 jours ». */
  readonly distance: string;
}

function choice(state: LibraryState, occurrence: Occurrence, now: number, twelve: boolean): CountdownChoice {
  const first = today(now);
  const year = Number(first.slice(0, 4));
  const from = weekdayDay(occurrence.firstDay, year);
  const event = occurrence.event;
  return {
    eventId: occurrence.seriesId,
    title: event.title.trim() || t('Sans titre'),
    color: eventColor(event, state.calendarLabels, state.feeds),
    when: occurrence.allDay ? from : `${from} · ${clockWords(formatClock(occurrence.startAt), twelve)}`,
    distance: occurrence.firstDay < first && occurrence.lastDay >= first ? t('En cours') : dayDistance(occurrence.firstDay, first),
  };
}

/**
 * What the countdown's picker lists: with no query, what is coming (one row per event, at its next
 * occurrence, the nearest first, the calendars hidden left out); a query searches every event (the
 * coming ones first, then the past).
 */
export function countdownChoices(state: LibraryState, prefs: CalendarPrefs, query: string, now: number): CountdownChoice[] {
  const first = today(now);
  if (query.trim()) {
    return searchEvents(Object.values(state.events), state.feeds, query, target => nameOf(state, target) ?? '', first)
      .slice(0, CHOICES_SHOWN)
      .flatMap(event => {
        const occurrences = countdownOccurrences(state, event.id, now);
        const next = occurrences.find(item => item.endAt > now) ?? occurrences[0];
        return next ? [choice(state, next, now, prefs.twelveHours)] : [];
      });
  }
  const seen = new Set<string>();
  const out: CountdownChoice[] = [];
  const coming = occurrencesIn(Object.values(state.events), first, addDays(first, CHOICES_DAYS), { hiddenFeeds: hiddenFeedIds(Object.values(state.feeds)) })
    .filter(item => item.endAt > now)
    .sort((a, b) => a.startAt - b.startAt);
  for (const occurrence of coming) {
    if (seen.has(occurrence.seriesId)) continue;
    seen.add(occurrence.seriesId);
    out.push(choice(state, occurrence, now, prefs.twelveHours));
    if (out.length >= CHOICES_SHOWN) break;
  }
  return out;
}
