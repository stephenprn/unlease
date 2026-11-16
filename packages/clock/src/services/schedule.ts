/**
 * When an alarm rings: its next moment from now, on the phone's clock (`zone` '' is the device's own,
 * a name only in tests). The phone's alarm engine counts the same in Kotlin (`AlarmPlan.kt` and
 * `Civil.kt`, on `java.util.TimeZone`), number for number: keep the two in step.
 *
 * - A repeating alarm rings on its days, at its time, but on `skipDay`.
 * - A one-time alarm rings once, on `date` at its time; gone by, it reads as off (nothing is written
 *   when it rings, so no phone has to tell another).
 * - A time the clocks skip (2:30 on the spring night) rings an hour later, as Agenda reads it and as
 *   the engine does; one that happens twice rings the first time.
 */
import { addDays, instantToDay, instantToWall, wallToInstant, weekdayOf } from '@unlease/calendar/services/time';
import type { Day } from '@unlease/calendar/models/events';
import type { Alarm } from '../models/alarm';

/** When an alarm next rings: its day on the phone and the instant. */
export interface Ring {
  readonly day: Day;
  readonly at: number;
}

type Timing = Pick<Alarm, 'time' | 'days' | 'date' | 'enabled' | 'skipDay' | 'quiet'>;

/** Two weeks: a skipped day of an alarm that rings once a week still finds the next one. */
const HORIZON_DAYS = 15;

/**
 * The instant `time` is on `day`, on the phone's clock. Agenda's reading (`wallToInstant`) takes the
 * second of a time the clocks repeat; an alarm rings the first, as the engine's `Civil.ringAt` does.
 */
export function ringAt(day: Day, time: string, zone = ''): number {
  const wall = `${day}T${time}`;
  const at = wallToInstant(wall, zone);
  const hourBefore = at - 3_600_000;
  return instantToWall(hourBefore, zone) === wall ? hourBefore : at;
}

/** Whether a repeating alarm rings on a day (its weekday, not skipped); a one-time one on its date. */
export function ringsOn(alarm: Timing, day: Day): boolean {
  if (alarm.days.length === 0) return alarm.date === day;
  return alarm.days.includes(weekdayOf(day)) && alarm.skipDay !== day && !quietOn(alarm, day);
}

/** A public holiday or a day off this repeating alarm keeps quiet on (`ringingAlarms` says which). */
export const quietOn = (alarm: Pick<Alarm, 'quiet'>, day: Day): boolean => alarm.quiet?.has(day) === true;

/**
 * The next time an alarm rings after `now`; null when it will not (off, or a one-time alarm whose
 * moment went by). `ignoreSkip`: the next one as if no day were skipped (what « Ne plus ignorer » brings back).
 */
export function nextRing(alarm: Timing, now: number, zone = '', { ignoreSkip = false }: { readonly ignoreSkip?: boolean } = {}): Ring | null {
  if (!alarm.enabled) return null;
  if (alarm.days.length === 0) {
    if (alarm.date === null) return null;
    const at = ringAt(alarm.date, alarm.time, zone);
    return at > now ? { day: alarm.date, at } : null;
  }
  // From yesterday: a time past midnight on a clock that went back an hour can still be ahead.
  const from = addDays(instantToDay(now, zone), -1);
  for (let index = 0; index <= HORIZON_DAYS; index += 1) {
    const day = addDays(from, index);
    if (!alarm.days.includes(weekdayOf(day)) || quietOn(alarm, day)) continue;
    if (!ignoreSkip && alarm.skipDay === day) continue;
    const at = ringAt(day, alarm.time, zone);
    if (at > now) return { day, at };
  }
  return null;
}

/** On, as its switch shows it: switched on, and still to ring (a one-time alarm gone by reads as off). */
export const isOn = (alarm: Timing, now: number, zone = ''): boolean => nextRing(alarm, now, zone) !== null;

/** The day a one-time alarm set now for `time` rings: today while that time is still ahead, else tomorrow. */
export function onceDate(time: string, now: number, zone = ''): Day {
  const today = instantToDay(now, zone);
  return ringAt(today, time, zone) > now ? today : addDays(today, 1);
}

/** The first alarm to ring among those given, with its ring. */
export function nextOf<T extends Timing>(alarms: Iterable<T>, now: number, zone = ''): { readonly alarm: T; readonly ring: Ring } | null {
  let best: { alarm: T; ring: Ring } | null = null;
  for (const alarm of alarms) {
    const ring = nextRing(alarm, now, zone);
    if (ring && (!best || ring.at < best.ring.at)) best = { alarm, ring };
  }
  return best;
}

/** The alarm that rings on a day (the first, if several), with its instant: what wakes the person that morning. */
export function wakingOn<T extends Timing>(alarms: Iterable<T>, day: Day, zone = ''): { readonly alarm: T; readonly at: number } | null {
  let best: { alarm: T; at: number } | null = null;
  for (const alarm of alarms) {
    if (!alarm.enabled || !ringsOn(alarm, day)) continue;
    const at = ringAt(day, alarm.time, zone);
    if (!best || at < best.at) best = { alarm, at };
  }
  return best;
}

/** By time of day, then the oldest first: the list's order, as every alarm clock keeps it. */
export function byTime<T extends Pick<Alarm, 'time' | 'createdAt' | 'id'>>(a: T, b: T): number {
  return a.time.localeCompare(b.time) || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

/**
 * What switching an alarm on or off writes: on, a one-time alarm takes the next day its time comes
 * (`onceDate`), and a skip gone by is forgotten.
 */
export function switchedFields(alarm: Pick<Alarm, 'time' | 'days' | 'skipDay'>, on: boolean, now: number, zone = ''): Partial<Pick<Alarm, 'enabled' | 'date' | 'skipDay'>> {
  if (!on) return { enabled: false };
  return {
    enabled: true,
    ...(alarm.days.length === 0 ? { date: onceDate(alarm.time, now, zone) } : { date: null }),
    ...(alarm.skipDay !== null && alarm.skipDay < instantToDay(now, zone) ? { skipDay: null } : {}),
  };
}

/** What « Ignorer la prochaine » writes: the next ring's day kept quiet (null when there is none to skip). */
export function skipFields(alarm: Timing, now: number, zone = ''): Pick<Alarm, 'skipDay'> | null {
  if (alarm.days.length === 0) return null;
  const ring = nextRing(alarm, now, zone);
  return ring ? { skipDay: ring.day } : null;
}

/** The day an alarm skips, while that ring is still to come (a skip gone by means nothing). */
export function skippedDay(alarm: Pick<Alarm, 'days' | 'skipDay' | 'enabled' | 'time'>, now: number, zone = ''): Day | null {
  if (!alarm.enabled || alarm.days.length === 0 || alarm.skipDay === null) return null;
  if (!alarm.days.includes(weekdayOf(alarm.skipDay))) return null;
  return ringAt(alarm.skipDay, alarm.time, zone) > now ? alarm.skipDay : null;
}
