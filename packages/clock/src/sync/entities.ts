/**
 * Clock's records to and from their entities. A record may be partial (a field added later): reading
 * fills in defaults and never throws.
 */
import { editedAt, type Fields, type SyncRecord } from '@unlease/core/sync/record';
import { DAY_PATTERN } from '@unlease/calendar/models/events';
import { ALARM_FIELD_DEFAULTS, isClockTime, normalizeDays, type Alarm } from '../models/alarm';
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
