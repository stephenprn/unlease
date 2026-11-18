/**
 * Clock's record types (alarms, saved timers, world clocks), declared to the suite's sync (`@unlease/core/sync/schema`) when this module
 * loads: every program that reads alarms imports it through `sync/entities`. Adding a field is safe;
 * renaming or removing one is a migration on every device.
 */
import { bool, defineRecordTypes, int, nullableId, nullableNumber, nullableTime, str, time, type Check } from '@unlease/core/sync/schema';
import { DAY_PATTERN, WALL_PATTERN } from '@unlease/calendar/models/events';
import { ALARM_FIELD_DEFAULTS, ALARM_LIMITS, TIME_PATTERN } from '../models/alarm';
import { TIMER_FIELD_DEFAULTS, TIMER_LIMITS } from '../models/timer';
import { WORLD_CLOCK_FIELD_DEFAULTS, WORLD_CLOCK_LIMITS, ZONE_PATTERN } from '../models/worldClock';

const clockTime: Check = value => typeof value === 'string' && TIME_PATTERN.test(value);
const nullableDay: Check = value => value === null || (typeof value === 'string' && DAY_PATTERN.test(value));
/** An occurrence's original start, as Agenda keys it (a day, or a wall time); '' none. */
const occurrence: Check = value => value === '' || (typeof value === 'string' && (DAY_PATTERN.test(value) || WALL_PATTERN.test(value)));
/** The days of the week, each once, 0 to 6, sorted. */
const days: Check = value =>
  Array.isArray(value) && value.length <= 7 && value.every((day, index) => Number.isInteger(day) && day >= 0 && day <= 6 && (index === 0 || day > (value[index - 1] as number)));
/** A sound's key (`melody`, `silent`), or a sound of the phone (`phone:content://…`). */
const sound: Check = value => typeof value === 'string' && value.length > 0 && value.length <= ALARM_LIMITS.sound && (/^[a-z]{1,20}$/.test(value) || value.startsWith('phone:'));
/** An IANA zone's name (`Asia/Tokyo`): its shape only, so a zone this build does not know is kept. */
const zone: Check = value => typeof value === 'string' && ZONE_PATTERN.test(value);
/** A country's two letters, or '' unknown. */
const country: Check = value => value === '' || (typeof value === 'string' && /^[A-Z]{2}$/.test(value));

export const CLOCK_RECORD_TYPES = defineRecordTypes({
  alarm: {
    app: 'clock',
    fields: {
      time: clockTime,
      days,
      date: nullableDay,
      enabled: bool,
      label: str(ALARM_LIMITS.label),
      sound,
      vibrate: bool,
      weather: bool,
      agenda: bool,
      skipDay: nullableDay,
      offDays: bool,
      eventId: nullableId,
      eventStart: occurrence,
      before: int(0, ALARM_LIMITS.before),
      createdAt: time,
      deletedAt: nullableTime,
    },
    defaults: ALARM_FIELD_DEFAULTS,
  },
  // A timer kept for next time (« Pâtes », 9 min): its length, its label, how it rings. A timer that
  // runs is never a record: it lives on the device that runs it.
  timer: {
    app: 'clock',
    fields: {
      label: str(TIMER_LIMITS.label),
      seconds: int(1, TIMER_LIMITS.seconds),
      sound,
      vibrate: bool,
      createdAt: time,
      deletedAt: nullableTime,
    },
    defaults: TIMER_FIELD_DEFAULTS,
  },
  // A city whose time the person keeps an eye on: its zone, its name as shown, where it is (its daylight).
  worldClock: {
    app: 'clock',
    fields: {
      zone,
      name: str(WORLD_CLOCK_LIMITS.name),
      country,
      lat: nullableNumber,
      lon: nullableNumber,
      createdAt: time,
      deletedAt: nullableTime,
    },
    defaults: WORLD_CLOCK_FIELD_DEFAULTS,
  },
});

export type ClockRecordType = keyof typeof CLOCK_RECORD_TYPES;

export const CLOCK_TYPES = Object.keys(CLOCK_RECORD_TYPES) as readonly ClockRecordType[];

/** One of Clock's own types: a store may also hold another app's records. */
export function isClockType(value: string): value is ClockRecordType {
  return Object.hasOwn(CLOCK_RECORD_TYPES, value);
}
