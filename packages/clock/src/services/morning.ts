/**
 * What waits after an alarm, from Agenda's records (the person's own events and the calendars they
 * follow and show, never one hidden or in the bin): the day's events, its first timed one, and
 * whether that one comes too soon after the alarm (or before it) to get ready. The home screen shows
 * it under the next alarm, the ringing screen lists the day, and the evening check says it the night
 * before (`evening.ts`).
 */
import type { CalendarEvent, CalendarFeed, Day } from '@unlease/calendar/models/events';
import { hiddenFeedIds, occurrencesIn, type Occurrence } from '@unlease/calendar/services/occurrences';
import { addDays, instantToWall } from '@unlease/calendar/services/time';
import { ringAt } from './schedule';

/** Agenda's records, as a program holds them. */
export interface AgendaRecords {
  readonly events: Iterable<CalendarEvent>;
  readonly feeds: Iterable<CalendarFeed>;
}

export interface DayAhead {
  readonly day: Day;
  /** All day, or begun the day before and running on into this one. */
  readonly allDay: readonly Occurrence[];
  /** Timed ones starting on this day, by their start. */
  readonly timed: readonly Occurrence[];
}

/** A day's events on this phone. */
export function dayAhead(records: AgendaRecords, day: Day): DayAhead {
  const hiddenFeeds = hiddenFeedIds(records.feeds);
  const occurrences = occurrencesIn(records.events, day, addDays(day, 1), { hiddenFeeds });
  const allDay: Occurrence[] = [];
  const timed: Occurrence[] = [];
  for (const item of occurrences) {
    if (!item.allDay && item.firstDay === day) timed.push(item);
    else allDay.push(item);
  }
  timed.sort((a, b) => a.startAt - b.startAt || a.key.localeCompare(b.key));
  return { day, allDay, timed };
}

/** The day's first timed event, or what is left of the day after an instant (the ringing screen, once the morning is under way). */
export function firstEvent(ahead: DayAhead, after = Number.NEGATIVE_INFINITY): Occurrence | null {
  return ahead.timed.find(item => item.endAt > after || item.startAt >= after) ?? null;
}

/** An event too close to an alarm: how many minutes after it the event starts (negative: before it rings). */
export interface Clash {
  readonly occurrence: Occurrence;
  readonly minutes: number;
}

/**
 * The first event of the alarm's day that starts less than `margin` minutes after it rings, or before
 * it; null when the morning leaves room. An event begun the day before is not one to get up for.
 */
export function clashWith(ahead: DayAhead, ringAt: number, margin: number): Clash | null {
  const first = ahead.timed[0];
  if (!first) return null;
  const minutes = Math.round((first.startAt - ringAt) / 60_000);
  return minutes < margin ? { occurrence: first, minutes } : null;
}

/**
 * The time to ring instead, so the clashing event leaves `margin` minutes: its start less the margin,
 * down to five minutes, on the phone's clock (its day too: an event at 0:20 asks for the evening before).
 */
export function earlierTime(clash: Clash, margin: number, zone = ''): { readonly day: Day; readonly time: string; readonly at: number } {
  const wall = instantToWall(clash.occurrence.startAt - margin * 60_000, zone);
  const minutes = Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16));
  const rounded = minutes - (minutes % 5);
  const time = `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
  const day = wall.slice(0, 10);
  return { day, time, at: ringAt(day, time, zone) };
}
