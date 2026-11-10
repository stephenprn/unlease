/**
 * Agenda's record types, declared to the suite's sync (`@unlease/core/sync/schema`) when this module
 * loads: every program that reads events imports it through `sync/entities` (Carnet's and Pages',
 * which mention them, too). Adding a field is safe; renaming or removing one is a migration on every
 * device.
 */
import {
  bool,
  defineRecordTypes,
  id,
  ids,
  int,
  isObject,
  nullableId,
  nullableTime,
  oneOf,
  position,
  str,
  time,
  type Check,
} from '@unlease/core/sync/schema';
import { isLineColor } from '@unlease/design/colors';
import { CALENDAR_TEXT_LIMITS, DAY_PATTERN, EVENT_FIELD_DEFAULTS, EVENT_LIMITS, FEED_KINDS, REMINDER_RANGE, WALL_PATTERN } from '../models/events';

/** A day or a time of day as stored (`2026-11-02`, `2026-11-02T14:30`); '' where none is (an exception's `originalStart` on a series). */
const when: Check = value => typeof value === 'string' && (DAY_PATTERN.test(value) || WALL_PATTERN.test(value));
const maybeWhen: Check = value => value === '' || when(value);
const zone: Check = value => typeof value === 'string' && value.length <= EVENT_LIMITS.timeZone && /^[A-Za-z0-9_+\-/]*$/.test(value);
const lineColor: Check = isLineColor;
const nullableColor: Check = value => value === null || isLineColor(value);
const whens = (max: number): Check => value => Array.isArray(value) && value.length <= max && value.every(when);
const reminders: Check = value => Array.isArray(value) && value.length <= EVENT_LIMITS.reminders && value.every(int(REMINDER_RANGE.min, REMINDER_RANGE.max));
const file = (value: unknown): boolean =>
  isObject(value) &&
  id(value.id) &&
  str(EVENT_LIMITS.fileName)(value.name) &&
  str(127)(value.mime) &&
  typeof value.bytes === 'number' &&
  Number.isFinite(value.bytes) &&
  value.bytes >= 0 &&
  typeof value.uploaded === 'boolean';
const files: Check = value => Array.isArray(value) && value.length <= EVENT_LIMITS.files && value.every(file) && new Set(value.map(entry => (entry as { id: string }).id)).size === value.length;
const typed = (limit: number) => ({ limit });

export const CALENDAR_RECORD_TYPES = defineRecordTypes({
  calendarEvent: {
    app: 'calendar',
    fields: {
      title: str(EVENT_LIMITS.title),
      description: str(EVENT_LIMITS.description),
      place: str(EVENT_LIMITS.place),
      start: when,
      end: when,
      timeZone: zone,
      rrule: str(EVENT_LIMITS.rrule),
      exdates: whens(EVENT_LIMITS.exdates),
      recurringId: nullableId,
      originalStart: maybeWhen,
      reminders,
      labelIds: ids(EVENT_LIMITS.labels),
      contactIds: ids(EVENT_LIMITS.contacts),
      files,
      feedId: nullableId,
      uid: str(EVENT_LIMITS.uid),
      url: str(EVENT_LIMITS.url),
      color: nullableColor,
      trashedAt: nullableTime,
      createdAt: time,
      deletedAt: nullableTime,
    },
    merged: {
      title: typed(CALENDAR_TEXT_LIMITS.calendarEvent.title),
      description: typed(CALENDAR_TEXT_LIMITS.calendarEvent.description),
      // The days taken out of a series, as a set: two devices each taking one out keep both out.
      exdates: { limit: EVENT_LIMITS.exdates, set: true },
    },
    defaults: EVENT_FIELD_DEFAULTS,
  },
  calendarLabel: {
    app: 'calendar',
    fields: {
      name: str(EVENT_LIMITS.labelName),
      color: lineColor,
      position,
      createdAt: time,
      deletedAt: nullableTime,
    },
  },
  calendarFeed: {
    app: 'calendar',
    fields: {
      kind: oneOf(FEED_KINDS),
      name: str(EVENT_LIMITS.feedName),
      url: str(EVENT_LIMITS.url),
      color: lineColor,
      hidden: bool,
      position,
      refreshedAt: nullableTime,
      error: str(EVENT_LIMITS.feedError),
      createdAt: time,
      deletedAt: nullableTime,
    },
    defaults: { hidden: false, refreshedAt: null, error: '' },
  },
});

export type CalendarRecordType = keyof typeof CALENDAR_RECORD_TYPES;

export const CALENDAR_TYPES = Object.keys(CALENDAR_RECORD_TYPES) as readonly CalendarRecordType[];

/** One of Agenda's own types: a store may also hold another app's records. */
export function isCalendarType(value: string): value is CalendarRecordType {
  return Object.hasOwn(CALENDAR_RECORD_TYPES, value);
}
