/**
 * The reminders to ring: each occurrence's, `minutes` before its start (an all-day one's counted from
 * its day's midnight on this device). The phone arms them with Notifee; the server sends the web's
 * as push notifications. Both look the same way, so a reminder rings once per device.
 */
import { isAllDay, type CalendarEvent } from '../models/events';
import { occurrencesIn, type OccurrenceFilter } from './occurrences';
import { addDays, instantToDay } from './time';

export interface Alarm {
  /** Unique: the occurrence and the reminder (`<id>@2026-11-02T14:30#10`). */
  readonly key: string;
  readonly seriesId: string;
  readonly occurrence: string;
  readonly fireAt: number;
  readonly startAt: number;
  readonly allDay: boolean;
  readonly title: string;
  readonly place: string;
  readonly minutes: number;
}

/** The furthest a reminder rings before its event: four weeks. */
const LOOK_BACK_DAYS = 29;

/**
 * How late a reminder still rings when its moment went by unrung (the phone off, the event synced
 * after it, the server stopped): an hour, and never once its event is well under way.
 */
export const LATE_RING_MS = 60 * 60_000;
/** A timed event's reminder still rings this long after its start; an all-day one's, through its day. */
const STARTED_MS = 10 * 60_000;
const ALL_DAY_MS = 86_400_000;

/** The moment ringing a reminder stops being worth it: its event well begun, or an hour gone by. */
export function alarmStaleAt(alarm: Pick<Alarm, 'fireAt' | 'startAt' | 'allDay'>): number {
  return Math.min(alarm.fireAt + LATE_RING_MS, alarm.startAt + (alarm.allDay ? ALL_DAY_MS : STARTED_MS));
}

/** Whether a reminder rings at `now`: still to come, or late and still worth it. */
export function stillWorthRinging(alarm: Pick<Alarm, 'fireAt' | 'startAt' | 'allDay'>, now: number): boolean {
  return alarm.fireAt > now || now < alarmStaleAt(alarm);
}

/** The reminders ringing in [from, to). */
export function alarmsBetween(events: Iterable<CalendarEvent>, from: number, to: number, filter: OccurrenceFilter = {}): Alarm[] {
  const list = [...events].filter(event => event.reminders.length > 0 || event.recurringId !== null);
  const firstDay = addDays(instantToDay(from), -1);
  const lastDay = addDays(instantToDay(to), LOOK_BACK_DAYS + 2);
  const out: Alarm[] = [];
  for (const item of occurrencesIn(list, firstDay, lastDay, filter)) {
    for (const minutes of item.event.reminders) {
      const fireAt = item.startAt - minutes * 60_000;
      if (fireAt < from || fireAt >= to) continue;
      out.push({
        key: `${item.key}#${minutes}`,
        seriesId: item.seriesId,
        occurrence: item.occurrence,
        fireAt,
        startAt: item.startAt,
        allDay: isAllDay(item.event),
        title: item.event.title,
        place: item.event.place,
        minutes,
      });
    }
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}
