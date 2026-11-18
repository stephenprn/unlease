/**
 * Clock's records (alarms, saved timers, world clocks) to and from their entities. A record may be partial (a field added later): reading
 * fills in defaults and never throws.
 */
import { editedAt, type Fields, type SyncRecord } from '@unlease/core/sync/record';
import { DAY_PATTERN } from '@unlease/calendar/models/events';
import { ALARM_FIELD_DEFAULTS, isClockTime, normalizeDays, type Alarm } from '../models/alarm';
import { TIMER_FIELD_DEFAULTS, TIMER_LIMITS, type Timer } from '../models/timer';
import { ZONE_PATTERN, type WorldClock } from '../models/worldClock';
// Declares Clock's record types to the sync before any record is read.
import './types';

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const asTime = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const asNullableTime = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const asDay = (value: unknown): string | null => (typeof value === 'string' && DAY_PATTERN.test(value) ? value : null);
const asFlag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

export function alarmFromRecord(record: SyncRecord): Alarm {
  const f = record.fields;
  return {
    id: record.id,
    time: isClockTime(f.time) ? f.time : '07:00',
    days: Array.isArray(f.days) ? normalizeDays(f.days.filter((day): day is number => typeof day === 'number')) : [],
    date: asDay(f.date),
    enabled: f.enabled === true,
    label: asString(f.label),
    sound: asString(f.sound) || ALARM_FIELD_DEFAULTS.sound,
    vibrate: asFlag(f.vibrate, ALARM_FIELD_DEFAULTS.vibrate),
    weather: asFlag(f.weather, ALARM_FIELD_DEFAULTS.weather),
    agenda: asFlag(f.agenda, ALARM_FIELD_DEFAULTS.agenda),
    skipDay: asDay(f.skipDay),
    offDays: asFlag(f.offDays, ALARM_FIELD_DEFAULTS.offDays),
    eventId: typeof f.eventId === 'string' && f.eventId ? f.eventId : null,
    eventStart: asString(f.eventStart),
    before: typeof f.before === 'number' && Number.isInteger(f.before) && f.before >= 0 ? f.before : 0,
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
    editedAt: editedAt(record),
  };
}

/** An alarm's synced fields, whole (a new alarm, one copied). */
export function alarmFields(alarm: Omit<Alarm, 'id' | 'editedAt'>): Fields {
  return {
    time: alarm.time,
    days: [...alarm.days],
    date: alarm.date,
    enabled: alarm.enabled,
    label: alarm.label,
    sound: alarm.sound,
    vibrate: alarm.vibrate,
    weather: alarm.weather,
    agenda: alarm.agenda,
    skipDay: alarm.skipDay,
    offDays: alarm.offDays,
    eventId: alarm.eventId,
    eventStart: alarm.eventStart,
    before: alarm.before,
    createdAt: alarm.createdAt,
    deletedAt: alarm.deletedAt,
  };
}

export function timerFromRecord(record: SyncRecord): Timer {
  const f = record.fields;
  const seconds = typeof f.seconds === 'number' && Number.isInteger(f.seconds) ? Math.min(TIMER_LIMITS.seconds, Math.max(1, f.seconds)) : 60;
  return {
    id: record.id,
    label: asString(f.label),
    seconds,
    sound: asString(f.sound) || TIMER_FIELD_DEFAULTS.sound,
    vibrate: asFlag(f.vibrate, TIMER_FIELD_DEFAULTS.vibrate),
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
    editedAt: editedAt(record),
  };
}

/** A saved timer's synced fields, whole. */
export function timerFields(timer: Omit<Timer, 'id' | 'editedAt'>): Fields {
  return { label: timer.label, seconds: timer.seconds, sound: timer.sound, vibrate: timer.vibrate, createdAt: timer.createdAt, deletedAt: timer.deletedAt };
}

const asCoordinate = (value: unknown, most: number): number | null => (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= most ? value : null);

export function worldClockFromRecord(record: SyncRecord): WorldClock {
  const f = record.fields;
  const lat = asCoordinate(f.lat, 90);
  const lon = asCoordinate(f.lon, 180);
  return {
    id: record.id,
    zone: typeof f.zone === 'string' && ZONE_PATTERN.test(f.zone) ? f.zone : 'UTC',
    name: asString(f.name),
    country: typeof f.country === 'string' && /^[A-Z]{2}$/.test(f.country) ? f.country : '',
    // Both or neither: half a place says nothing of its daylight.
    lat: lat !== null && lon !== null ? lat : null,
    lon: lat !== null && lon !== null ? lon : null,
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
    editedAt: editedAt(record),
  };
}

/** A world clock's synced fields, whole. */
export function worldClockFields(clock: Omit<WorldClock, 'id' | 'editedAt'>): Fields {
  return { zone: clock.zone, name: clock.name, country: clock.country, lat: clock.lat, lon: clock.lon, createdAt: clock.createdAt, deletedAt: clock.deletedAt };
}
