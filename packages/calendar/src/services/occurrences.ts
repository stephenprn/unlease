/**
 * What the views draw: each event's occurrences in a range of days, on this device's clock. A
 * series gives one per repetition (`recurrence`), minus the days taken out (`exdates`) and those an
 * exception replaces (an event with `recurringId`, drawn in their place, wherever it moved). An
 * all-day event covers its days whatever the zone; a timed one is placed by its instant, so an event
 * set in New York shows at its hour here.
 */
import { isLive, type CalendarEvent, type CalendarFeed, type Day } from '../models/events';
import { parseRule, expandRule } from './recurrence';
import { addDays, addMinutes, civilMinutes, dayToInstant, instantToDay, isDay, minutesBetween, wallToInstant } from './time';

export interface Occurrence {
  /** Unique in a view: the series and which of its occurrences (`<id>@2026-11-02T14:30`). */
  readonly key: string;
  /** What is shown: the exception's own record when there is one, else the series'. */
  readonly event: CalendarEvent;
  /** The series' id (the event's own for one that does not repeat): what « Modifier la série » changes. */
  readonly seriesId: string;
  /** Which occurrence of the series, as stored (its original start for an exception); the event's start for one that does not repeat. */
  readonly occurrence: string;
  /** Whether it belongs to a series (an exception does too). */
  readonly repeats: boolean;
  readonly allDay: boolean;
  /** This occurrence's own start and end, as stored (in the event's zone). */
  readonly start: string;
  readonly end: string;
  /** As instants; an all-day one from this device's midnights. */
  readonly startAt: number;
  readonly endAt: number;
  /** The days it covers on this device, both included. */
  readonly firstDay: Day;
  readonly lastDay: Day;
}

/** What the views leave out: the bin, the calendars hidden. */
export interface OccurrenceFilter {
  readonly hiddenFeeds?: ReadonlySet<string>;
  /** Only events wearing this label. */
  readonly labelId?: string | null;
}

/** The ids of the calendars hidden or gone: their events are left out. */
export function hiddenFeedIds(feeds: Iterable<CalendarFeed>): Set<string> {
  const out = new Set<string>();
  for (const feed of feeds) if (feed.hidden || feed.deletedAt !== null) out.add(feed.id);
  return out;
}

function make(event: CalendarEvent, seriesId: string, occurrence: string, repeats: boolean, start: string, end: string): Occurrence {
  const allDay = isDay(start);
  const startAt = allDay ? dayToInstant(start) : wallToInstant(start, event.timeZone);
  const endAt = allDay ? dayToInstant(end) : Math.max(startAt, wallToInstant(end, event.timeZone));
  const firstDay = allDay ? start : instantToDay(startAt);
  // An end at midnight closes the day before; a timed event of no length still shows on its day.
  const lastDay = allDay ? addDays(end, -1) : endAt > startAt ? instantToDay(endAt - 1) : firstDay;
  return { key: `${seriesId}@${occurrence}`, event, seriesId, occurrence, repeats, allDay, start, end, startAt, endAt, firstDay, lastDay: lastDay < firstDay ? firstDay : lastDay };
}

/** An event's length, in days for an all-day one, else in minutes. */
export function eventLength(event: Pick<CalendarEvent, 'start' | 'end'>): number {
  return isDay(event.start) ? Math.max(1, Math.round((civilMinutes(event.end) - civilMinutes(event.start)) / 1440)) : Math.max(0, minutesBetween(event.start, event.end));
}

/** The end of an occurrence starting at `start`, the series' length kept. */
export function endFor(event: Pick<CalendarEvent, 'start' | 'end'>, start: string): string {
  return isDay(start) ? addDays(start, eventLength(event)) : addMinutes(start, eventLength(event));
}

/**
 * Every occurrence touching the days [from, to) on this device, sorted by start (all-day ones first
 * on a day). Exceptions whose series is gone are left out, as Google does.
 */
export function occurrencesIn(events: Iterable<CalendarEvent>, from: Day, to: Day, filter: OccurrenceFilter = {}): Occurrence[] {
  const fromAt = dayToInstant(from);
  const toAt = dayToInstant(to);
  const series = new Map<string, CalendarEvent>();
  const exceptions = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    if (event.deletedAt !== null) continue;
    if (event.recurringId) exceptions.set(event.recurringId, [...(exceptions.get(event.recurringId) ?? []), event]);
    else series.set(event.id, event);
  }
  for (const [seriesId, own] of exceptions) exceptions.set(seriesId, oneExceptionPerOccurrence(own));
  const shown = (event: CalendarEvent): boolean =>
    isLive(event) && !(event.feedId && filter.hiddenFeeds?.has(event.feedId)) && (!filter.labelId || event.labelIds.includes(filter.labelId));
  const overlaps = (item: Occurrence): boolean => (item.startAt < toAt && item.endAt > fromAt) || (item.startAt === item.endAt && item.startAt >= fromAt && item.startAt < toAt);
  const out: Occurrence[] = [];
  for (const event of series.values()) {
    const own = exceptions.get(event.id) ?? [];
    if (!event.rrule) {
      if (shown(event)) {
        const item = make(event, event.id, event.start, false, event.start, event.end);
        if (overlaps(item)) out.push(item);
      }
      continue;
    }
    const rule = parseRule(event.rrule);
    if (!rule) {
      if (shown(event)) {
        const item = make(event, event.id, event.start, false, event.start, event.end);
        if (overlaps(item)) out.push(item);
      }
      continue;
    }
    const skipped = new Set(event.exdates);
    for (const exception of own) if (exception.originalStart) skipped.add(exception.originalStart);
    if (shown(event)) {
      // The window in the event's own terms, wide enough for its length and any zone.
      const lengthDays = isDay(event.start) ? eventLength(event) : Math.ceil(eventLength(event) / 1440);
      const windowFrom = addDays(from, -(lengthDays + 2));
      const windowTo = addDays(to, 2);
      const expansion = expandRule(rule, event.start, event.timeZone, isDay(event.start) ? windowFrom : `${windowFrom}T00:00`, isDay(event.start) ? windowTo : `${windowTo}T00:00`);
      for (const start of expansion.starts) {
        if (skipped.has(start)) continue;
        const item = make(event, event.id, start, true, start, endFor(event, start));
        if (overlaps(item)) out.push(item);
      }
    }
    // An exception shows as long as its series lives, wherever it moved.
    if (event.trashedAt !== null) continue;
    for (const exception of own) {
      if (!shown(exception)) continue;
      const item = make(exception, event.id, exception.originalStart || exception.start, true, exception.start, exception.end);
      if (overlaps(item)) out.push(item);
    }
  }
  return out.sort(compareOccurrences);
}

/** Which of two exceptions of one occurrence shows: one out of the bin first, then the later edited, then the larger id, so every device shows the same. */
function preferred(a: CalendarEvent, b: CalendarEvent): CalendarEvent {
  if ((a.trashedAt === null) !== (b.trashedAt === null)) return a.trashedAt === null ? a : b;
  if (a.editedAt !== b.editedAt) return a.editedAt > b.editedAt ? a : b;
  return a.id > b.id ? a : b;
}

/**
 * One exception per occurrence of a series. Two devices that each changed the same occurrence
 * before seeing the other's (exceptions made before their ids were derived from the occurrence,
 * `exceptionId`) left two: the later edited shows, the other stays out of the way.
 */
function oneExceptionPerOccurrence(own: readonly CalendarEvent[]): CalendarEvent[] {
  const byStart = new Map<string, CalendarEvent>();
  const out: CalendarEvent[] = [];
  for (const exception of own) {
    if (!exception.originalStart) {
      out.push(exception);
      continue;
    }
    const known = byStart.get(exception.originalStart);
    byStart.set(exception.originalStart, known ? preferred(known, exception) : exception);
  }
  return [...out, ...byStart.values()];
}

/** The exception that replaces one occurrence of a series (`oneExceptionPerOccurrence`'s choice), if any. */
export function exceptionAt(events: Readonly<Record<string, CalendarEvent>>, seriesId: string, occurrence: string): CalendarEvent | undefined {
  let found: CalendarEvent | undefined;
  for (const event of Object.values(events)) {
    if (event.recurringId !== seriesId || event.originalStart !== occurrence || event.deletedAt !== null) continue;
    found = found ? preferred(found, event) : event;
  }
  return found;
}

/** All day first, then by start, the longer first, then by title. */
export function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.firstDay !== b.firstDay) return a.firstDay < b.firstDay ? -1 : 1;
  if (a.startAt !== b.startAt) return a.startAt - b.startAt;
  const length = b.endAt - b.startAt - (a.endAt - a.startAt);
  if (length !== 0) return length;
  return a.event.title.localeCompare(b.event.title) || (a.key < b.key ? -1 : 1);
}

/** The occurrences that touch a day. */
export function onDay(occurrences: readonly Occurrence[], day: Day): Occurrence[] {
  return occurrences.filter(item => item.firstDay <= day && item.lastDay >= day);
}

/** One occurrence of an event, found again by its key's parts (a link into it); null when it is not one. */
export function findOccurrence(events: Readonly<Record<string, CalendarEvent>>, seriesId: string, occurrence: string | null): Occurrence | null {
  const series = events[seriesId];
  if (!series || series.deletedAt !== null) return null;
  if (!series.rrule || !occurrence || occurrence === series.start) {
    const exception = occurrence ? exceptionAt(events, seriesId, occurrence) : undefined;
    if (exception) return make(exception, seriesId, occurrence!, true, exception.start, exception.end);
    return make(series, seriesId, series.start, !!series.rrule, series.start, series.end);
  }
  const exception = exceptionAt(events, seriesId, occurrence);
  if (exception) return make(exception, seriesId, occurrence, true, exception.start, exception.end);
  if (series.exdates.includes(occurrence)) return null;
  return make(series, seriesId, occurrence, true, occurrence, endFor(series, occurrence));
}

/** The next occurrences from now on, at most `count`, looking `days` ahead (the schedule, a widget). */
export function upcoming(events: Iterable<CalendarEvent>, now: number, days: number, count: number, filter: OccurrenceFilter = {}): Occurrence[] {
  const from = instantToDay(now);
  return occurrencesIn(events, from, addDays(from, days), filter)
    .filter(item => item.endAt > now || (item.allDay && item.lastDay >= from))
    .sort((a, b) => a.startAt - b.startAt || compareOccurrences(a, b))
    .slice(0, count);
}
