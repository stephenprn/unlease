/**
 * The week of mornings, as both homes show it: from today, seven days, each with what wakes the
 * person (the first alarm ringing that day and when), the alarms kept quiet that day, the day's first
 * timed event and whether it comes too soon after the alarm (or before it). The morning chosen at
 * first is the next alarm's, else today.
 */
import type { Day } from '@unlease/calendar/models/events';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { addDays, instantToDay, weekdayOf } from '@unlease/calendar/services/time';
import type { Alarm } from '../models/alarm';
import { isDayOff } from './agenda';
import { clashWith, dayAhead, firstEvent, type AgendaRecords, type Clash } from './morning';
import { nextOf, quietOn, ringAt, ringsOn, wakingOn } from './schedule';

/** The first alarm still to ring on a day after `now`, with its instant. */
function nextOnDay(alarms: readonly Alarm[], day: Day, now: number, zone: string): { readonly alarm: Alarm; readonly at: number } | null {
  let best: { alarm: Alarm; at: number } | null = null;
  for (const alarm of alarms) {
    if (!alarm.enabled || !ringsOn(alarm, day)) continue;
    const at = ringAt(day, alarm.time, zone);
    if (at > now && (!best || at < best.at)) best = { alarm, at };
  }
  return best;
}

export const WEEK_DAYS = 7;

export interface Morning {
  readonly day: Day;
  /** The alarm that rings that day (the next still to ring, else the first), and when; null when none rings. */
  readonly waking: { readonly alarm: Alarm; readonly at: number } | null;
  /** The day's first alarm, what wakes the person: the clash is counted from it. */
  readonly wakeup: { readonly alarm: Alarm; readonly at: number } | null;
  /** `waking` is a later ring of the day still to come (today's evening alarm), not its wake-up: `first` counts from it. */
  readonly later: boolean;
  /** The repeating alarms that would ring that day but are kept quiet (« Ignorer cette fois »). */
  readonly skipped: readonly Alarm[];
  /** The repeating alarms quiet that day because it is a public holiday or a day off (`offDays`), and what the day is. */
  readonly offDay: { readonly alarms: readonly Alarm[]; readonly reason: string } | null;
  /** The day's first timed event (one begun the day before is not one); today, the first not over yet; after a later ring, the first after it. */
  readonly first: Occurrence | null;
  /** The day's all-day events (a holiday, a day off, a trip begun the day before): said when no timed event is. */
  readonly allDay: readonly Occurrence[];
  /** Timed events that day: the strip's dot. */
  readonly events: number;
  /** The first event too close after the alarm (or before it), with the margin of the device's settings. */
  readonly clash: Clash | null;
}

export interface WeekInput {
  readonly alarms: Iterable<Alarm>;
  readonly agenda: AgendaRecords;
  readonly now: number;
  /** The time one needs between the alarm and the first event (`ClockPrefs.marginMinutes`). */
  readonly margin: number;
  readonly zone?: string;
}

/** Seven mornings from today. A ring of today already gone by still names what woke the person. */
export function weekOfMornings({ alarms, agenda, now, margin, zone = '' }: WeekInput): Morning[] {
  const live = [...alarms].filter(alarm => alarm.deletedAt === null);
  const today = instantToDay(now, zone);
  return Array.from({ length: WEEK_DAYS }, (_, index) => {
    const day = addDays(today, index);
    const ahead = dayAhead(agenda, day);
    // What rings next that day, while something still will (today, after the morning's ring: the evening's); else the day's first.
    const wakeup = wakingOn(live, day, zone);
    const waking = nextOnDay(live, day, now, zone) ?? wakeup;
    const skipped = live.filter(alarm => alarm.enabled && alarm.days.length > 0 && alarm.skipDay === day && alarm.days.includes(weekdayOf(day)));
    const quieted = live.filter(alarm => alarm.enabled && alarm.days.length > 0 && alarm.skipDay !== day && alarm.days.includes(weekdayOf(day)) && quietOn(alarm, day));
    const off = quieted.length > 0 ? ahead.allDay.find(item => isDayOff(item.event)) : undefined;
    // The event shown goes with the alarm shown: a later ring still to come counts from itself.
    const later = waking !== null && wakeup !== null && waking.alarm.id !== wakeup.alarm.id && waking.at > now;
    return {
      day,
      waking,
      wakeup,
      later,
      skipped,
      offDay: quieted.length > 0 ? { alarms: quieted, reason: off?.event.title.trim() ?? '' } : null,
      first: later ? firstEvent(ahead, waking.at) : index === 0 ? firstEvent(ahead, now) : (ahead.timed[0] ?? null),
      allDay: ahead.allDay,
      events: ahead.timed.length,
      // Only while the wake-up is still to come: a clash this morning once it rang is history.
      clash: wakeup && wakeup.at > now ? clashWith(ahead, wakeup.at, margin, zone) : null,
    };
  });
}

/** The morning a home opens on: the next alarm's (within the week), else today. */
export function chosenMorning(week: readonly Morning[], alarms: Iterable<Alarm>, now: number, zone = ''): Day {
  const next = nextOf([...alarms].filter(alarm => alarm.deletedAt === null), now, zone);
  return next && week.some(morning => morning.day === next.ring.day) ? next.ring.day : (week[0]?.day ?? instantToDay(now, zone));
}

/** Whether a morning's ring is still to come (today's may have rung already). */
export const stillToRing = (morning: Morning, now: number): boolean => morning.waking !== null && morning.waking.at > now;

/** A one-time alarm for a morning with none (« Ajouter une alarme »): its day, and when 07:00 would ring then (null once gone by). */
export function morningAlarmAt(day: Day, time: string, now: number, zone = ''): number | null {
  const at = ringAt(day, time, zone);
  return at > now ? at : null;
}
