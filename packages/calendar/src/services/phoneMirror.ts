/**
 * The calendar as the phone's own calendar sees it (« Copier dans l'agenda du téléphone », the phone
 * app's mirror: `mobile/calendar/src/app/phoneMirror.ts`), one way, under the app's own Android
 * account: what other apps read there (the Clock's next event, Maps' and the assistant's plans, a
 * watch). Read-only for them; Agenda still rings its own reminders, so none is copied (the phone
 * would ring twice).
 *
 * - **Calendars:** one for one's own events (`OWN_CALENDAR`), and one per calendar followed (a
 *   subscription, the holidays), so each can be shown or hidden in the phone's calendar app. Labels
 *   stay colours: an event may wear several, a calendar holds it once.
 * - **Times:** as `CalendarContract` wants them: an instant and the event's zone (a floating time
 *   in the phone's), an all-day event at midnight UTC, a repeating one with its RRULE (UNTIL in UTC,
 *   as RFC 5545 asks when the start has a zone), its length as a DURATION and its days taken out as
 *   EXDATE.
 * - **An occurrence changed alone** (an exception) is its own event, and its occurrence is taken out
 *   of the series: the phone shows the same days, without Android's matching of an exception to its
 *   instance (`ORIGINAL_INSTANCE_TIME`), which a zone or a rounding would break, read-only as it is.
 */
import type { Ref } from '@unlease/core/refs';
import { markupToPlain } from '@unlease/core/services/richText';
import { fingerprint, type MirrorRow } from '@unlease/core/services/mirror';
import type { LineColor } from '@unlease/design/colors';
import { LINES } from '@unlease/design/palette';
import { isLive, type CalendarEvent, type CalendarFeed, type CalendarLabel } from '../models/events';
import { eventLength } from './occurrences';
import { parseRule, serializeRule, type Rule } from './recurrence';
import { civilMinutes, instantToDay, isDay, wallToInstant } from './time';

/** The calendar one's own events go in; a followed calendar's is its feed's id. */
export const OWN_CALENDAR = 'own';

export interface MirroredCalendar extends MirrorRow {
  readonly name: string;
  /** `#RRGGBB`. */
  readonly color: string;
  /** Shown when first written; the person's choice in the phone's calendar app is never overwritten. */
  readonly visible: boolean;
}

export interface MirroredEvent extends MirrorRow {
  readonly calendarId: string;
  readonly title: string;
  readonly description: string;
  readonly location: string;
  readonly allDay: boolean;
  /** Its first start, in ms. */
  readonly start: number;
  /** Its end in ms, for an event that does not repeat; null for one that does (`duration`). */
  readonly end: number | null;
  /** RFC 5545's DURATION (`P3600S`, `P1D`), for a repeating event; null otherwise. */
  readonly duration: string | null;
  /** An IANA zone; `UTC` for an all-day event. */
  readonly timeZone: string;
  readonly rrule: string | null;
  /** RFC 5545's EXDATE values, in UTC (`20261102T133000Z,…`); null for none. */
  readonly exdate: string | null;
  /** `#RRGGBB`, its own or its first label's; null for its calendar's. */
  readonly color: string | null;
  /** Where the app opens it, after its scheme (`event/<id>`; an exception, its series at its occurrence). */
  readonly open: string;
}

export interface MirrorOptions {
  /** The phone's zone, for a floating time ('' in `timeZone`). */
  readonly deviceZone: string;
  /** A mention's name in a description (the app's namer); null once what it named is gone. */
  readonly nameOf?: (target: Ref) => string | null;
}

const MINUTE = 60_000;

/** A pigment as the phone's calendar paints it: the day palette's fill. */
export const pigmentHex = (color: LineColor): string => LINES.light[color].fill.toUpperCase();

/** The calendars: one's own (named and painted by the app: its name, the person's primary), then each followed one alive. */
export function mirroredCalendars(feeds: Iterable<CalendarFeed>, own: { readonly name: string; readonly color: string }): MirroredCalendar[] {
  const out: MirroredCalendar[] = [];
  const add = (id: string, name: string, color: string, visible: boolean): void => {
    out.push({ id, name, color, visible, fingerprint: fingerprint({ name, color }) });
  };
  add(OWN_CALENDAR, own.name, own.color.toUpperCase(), true);
  for (const feed of feeds) if (feed.deletedAt === null) add(feed.id, feed.name.trim() || feed.url, pigmentHex(feed.color), !feed.hidden);
  return out;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** An instant as RFC 5545 writes it in UTC: `20261102T133000Z`. */
export function utcStamp(instant: number): string {
  const date = new Date(instant);
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** Midnight UTC of a day: where Android keeps an all-day event. */
const utcMidnight = (day: string): number => civilMinutes(day.slice(0, 10)) * MINUTE;

/** A start or an exdate as an instant: a day at midnight UTC for an all-day series, a time in the event's zone. */
const instantOf = (value: string, allDay: boolean, zone: string): number => (allDay ? utcMidnight(value) : wallToInstant(value, zone));

/** UNTIL in the form RFC 5545 asks for this start: a day for an all-day series, an instant in UTC for a timed one. */
function fitUntil(rule: Rule, allDay: boolean, zone: string): Rule {
  const until = rule.until;
  if (!until) return rule;
  if (allDay) {
    if (until.kind === 'day') return rule;
    const day = until.kind === 'wall' ? until.wall.slice(0, 10) : instantToDay(until.at, 'UTC');
    return { ...rule, until: { kind: 'day', day } };
  }
  if (until.kind === 'instant') return rule;
  // A day ends the series after its last moment, in the event's zone.
  const at = until.kind === 'wall' ? wallToInstant(until.wall, zone) : wallToInstant(`${until.day}T23:59`, zone) + 59_000;
  return { ...rule, until: { kind: 'instant', at } };
}

/** An event's own colour, else its first live label's; null leaves it its calendar's. */
function ownColor(event: CalendarEvent, labels: Readonly<Record<string, CalendarLabel>>): string | null {
  if (event.color) return pigmentHex(event.color);
  for (const id of event.labelIds) {
    const label = labels[id];
    if (label && label.deletedAt === null) return pigmentHex(label.color);
  }
  return null;
}

/** Which of two exceptions of one occurrence shows (as `occurrencesIn`): out of the bin first, then the later edited, then the larger id. */
function preferred(a: CalendarEvent, b: CalendarEvent): CalendarEvent {
  if ((a.trashedAt === null) !== (b.trashedAt === null)) return a.trashedAt === null ? a : b;
  if (a.editedAt !== b.editedAt) return a.editedAt > b.editedAt ? a : b;
  return a.id > b.id ? a : b;
}

/**
 * Every event the phone's calendar should hold: one's own and the followed calendars' (alive, out of
 * the bin), each repeating series once with its rule, each exception as an event of its own.
 */
export function mirroredEvents(
  events: Iterable<CalendarEvent>,
  labels: Readonly<Record<string, CalendarLabel>>,
  feeds: Readonly<Record<string, CalendarFeed>>,
  options: MirrorOptions,
): MirroredEvent[] {
  const series = new Map<string, CalendarEvent>();
  const exceptions = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    if (event.deletedAt !== null) continue;
    if (event.recurringId) exceptions.set(event.recurringId, [...(exceptions.get(event.recurringId) ?? []), event]);
    else series.set(event.id, event);
  }
  const calendarOf = (event: CalendarEvent): string | null => {
    if (!event.feedId) return OWN_CALENDAR;
    const feed = feeds[event.feedId];
    return feed && feed.deletedAt === null ? feed.id : null;
  };
  const describe = (event: CalendarEvent): string => markupToPlain(event.description, target => options.nameOf?.(target) ?? '…').trim();

  const out: MirroredEvent[] = [];
  const push = (event: CalendarEvent, calendarId: string, repeat: { rule: Rule; exdates: readonly string[] } | null): void => {
    const allDay = isDay(event.start);
    const zone = allDay ? 'UTC' : event.timeZone || options.deviceZone || 'UTC';
    const start = allDay ? utcMidnight(event.start) : wallToInstant(event.start, zone);
    let end: number | null = null;
    let duration: string | null = null;
    let rrule: string | null = null;
    let exdate: string | null = null;
    if (repeat) {
      duration = allDay ? `P${eventLength(event)}D` : `P${Math.max(0, Math.round((wallToInstant(event.end, zone) - start) / 1000))}S`;
      rrule = serializeRule(fitUntil(repeat.rule, allDay, zone));
      const stamps = [...new Set(repeat.exdates.map(value => utcStamp(instantOf(value, allDay, zone))))].sort();
      exdate = stamps.length > 0 ? stamps.join(',') : null;
    } else {
      end = allDay ? Math.max(utcMidnight(event.end || event.start), start + 1440 * MINUTE) : Math.max(start, event.end ? wallToInstant(event.end, zone) : start);
    }
    const fields = {
      calendarId,
      title: event.title.trim(),
      description: describe(event),
      location: event.place.trim(),
      allDay,
      start,
      end,
      duration,
      timeZone: zone,
      rrule,
      exdate,
      color: ownColor(event, labels),
      open: event.recurringId && event.originalStart ? `event/${encodeURIComponent(event.recurringId)}?at=${encodeURIComponent(event.originalStart)}` : `event/${encodeURIComponent(event.id)}`,
    };
    out.push({ id: event.id, fingerprint: fingerprint(fields), ...fields });
  };

  for (const event of series.values()) {
    const calendarId = calendarOf(event);
    if (calendarId === null || !isLive(event)) continue;
    const rule = event.rrule ? parseRule(event.rrule) : null;
    if (!rule) {
      push(event, calendarId, null);
      continue;
    }
    // One exception per occurrence; every one takes its occurrence out of the series, in the bin or not.
    const byOccurrence = new Map<string, CalendarEvent>();
    const loose: CalendarEvent[] = [];
    for (const exception of exceptions.get(event.id) ?? []) {
      if (!exception.originalStart) loose.push(exception);
      else {
        const known = byOccurrence.get(exception.originalStart);
        byOccurrence.set(exception.originalStart, known ? preferred(known, exception) : exception);
      }
    }
    push(event, calendarId, { rule, exdates: [...event.exdates, ...byOccurrence.keys()] });
    for (const exception of [...byOccurrence.values(), ...loose]) if (isLive(exception)) push(exception, calendarId, null);
  }
  return out;
}
