/**
 * What Clock takes from Agenda for its alarms, as both clients and the alarm engine read them:
 *
 * - **An alarm for an event** (Agenda's « Réveil » on an event): a one-time alarm linked to that
 *   occurrence rings `before` minutes before its start, wherever the event moves (a train moved
 *   earlier wakes the person earlier); gone (deleted, in the bin), the alarm keeps the ring it had.
 * - **Days off**: a repeating alarm that asks for it (`offDays`) stays quiet on the public holidays
 *   Agenda shows (the server's holidays calendar) and on the days off the person put in it (an
 *   all-day event « Jour de congé », `dayOff`).
 *
 * `ringingAlarms` turns the stored alarms into alarms as they ring; everything that counts rings
 * (the schedule, the week, the evening check, the engine's plan) reads them, never the stored ones.
 */
import { HOLIDAYS_FEED_ID, type CalendarEvent, type Day } from '@unlease/calendar/models/events';
import { findOccurrence, occurrencesIn, type Occurrence } from '@unlease/calendar/services/occurrences';
import { addDays, instantToDay, instantToWall } from '@unlease/calendar/services/time';
import { ALARM_LIMITS, type Alarm } from '../models/alarm';
import type { AgendaRecords } from './morning';
import { ringAt } from './schedule';

/** How far ahead the days off are read: the engine's plan is handed again long before it runs out. */
export const OFF_DAYS_AHEAD = 60;

/** The event an alarm is for, as `findOccurrence` keys it. */
export interface EventLink {
  readonly eventId: string;
  /** Which occurrence of a repeating event; '' for one that does not repeat. */
  readonly eventStart: string;
}

const byId = (events: Iterable<CalendarEvent>): Record<string, CalendarEvent> => {
  const out: Record<string, CalendarEvent> = {};
  for (const event of events) out[event.id] = event;
  return out;
};

/** The occurrence a linked alarm wakes the person for, as Agenda's records stand; null when gone (deleted, in the bin) or not linked. */
export function linkedOccurrence(link: { readonly eventId: string | null; readonly eventStart: string }, events: Readonly<Record<string, CalendarEvent>>): Occurrence | null {
  if (!link.eventId) return null;
  const found = findOccurrence(events, link.eventId, link.eventStart || null);
  if (!found || found.event.trashedAt !== null || found.event.deletedAt !== null) return null;
  return found;
}

/** When an alarm `before` minutes before `startAt` rings, on this device's clock. */
export function ringBefore(startAt: number, before: number, zone = ''): { readonly day: Day; readonly time: string } {
  const wall = instantToWall(startAt - before * 60_000, zone);
  return { day: wall.slice(0, 10), time: wall.slice(11, 16) };
}

/**
 * How many minutes before an event's start an alarm at `time` rings: the last moment at that time
 * before the event (an event at 06:00 and an alarm at 23:30 ring the evening before), at most a day.
 */
export function minutesBefore(startAt: number, time: string, zone = ''): number {
  const day = instantToDay(startAt, zone);
  let at = ringAt(day, time, zone);
  if (at > startAt) at = ringAt(addDays(day, -1), time, zone);
  return Math.min(ALARM_LIMITS.before, Math.max(0, Math.round((startAt - at) / 60_000)));
}

/** Whether an event makes a day off: the server's public holidays, or an all-day event the person marked « Jour de congé ». */
export const isDayOff = (event: CalendarEvent): boolean => event.trashedAt === null && event.deletedAt === null && (event.feedId === HOLIDAYS_FEED_ID || event.dayOff);

/** The days off from `from` for `days` days: every day a public holiday or a day off covers (timed ones left aside). */
export function offDaysFrom(agenda: AgendaRecords, from: Day, days = OFF_DAYS_AHEAD): Set<Day> {
  const out = new Set<Day>();
  const marking = [...agenda.events].filter(isDayOff);
  if (marking.length === 0) return out;
  for (const occurrence of occurrencesIn(marking, from, addDays(from, days))) {
    if (!occurrence.allDay) continue;
    for (let day = occurrence.firstDay; day <= occurrence.lastDay; day = addDays(day, 1)) out.add(day);
  }
  return out;
}

/**
 * The alarms as they ring: a linked one at its event's time (one-time, on the ring's day), a repeating
 * one that asks for it told which days it keeps quiet. Every other alarm comes back as it is.
 */
export function ringingAlarms(alarms: Iterable<Alarm>, agenda: AgendaRecords, now: number, zone = ''): Alarm[] {
  const list = [...alarms];
  const linking = list.some(alarm => alarm.eventId !== null);
  const events = linking ? byId(agenda.events) : {};
  let quiet: ReadonlySet<Day> | null = null;
  const quietDays = (): ReadonlySet<Day> => (quiet ??= offDaysFrom(agenda, addDays(instantToDay(now, zone), -1)));
  return list.map(alarm => {
    let shown = alarm;
    if (alarm.eventId !== null) {
      const occurrence = linkedOccurrence(alarm, events);
      if (occurrence) {
        const ring = ringBefore(occurrence.startAt, alarm.before, zone);
        shown = { ...shown, time: ring.time, date: ring.day, days: [] };
      }
    }
    if (shown.offDays && shown.days.length > 0) shown = { ...shown, quiet: quietDays() };
    return shown;
  });
}
