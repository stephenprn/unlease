/**
 * Agenda's records to and from their entities. A record may be partial (a field added later, an
 * event seen before its labels): reading fills in defaults and never throws.
 */
import { editedAt, type Fields, type SyncRecord } from '@unlease/core/sync/record';
import { isLineColor } from '@unlease/design/colors';
import { DAY_PATTERN, WALL_PATTERN, type CalendarEvent, type CalendarFeed, type CalendarLabel, type EventFile } from '../models/events';
// Declares Agenda's record types to the sync before any record is read.
import './types';

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asTime = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const asNullableTime = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const asNullableId = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const asIds = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []);
const isWhen = (value: unknown): value is string => typeof value === 'string' && (DAY_PATTERN.test(value) || WALL_PATTERN.test(value));

function asFiles(value: unknown): EventFile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const raw = entry as Record<string, unknown> | null;
    if (!raw || typeof raw.id !== 'string') return [];
    return [{ id: raw.id, name: asString(raw.name), mime: asString(raw.mime), bytes: asTime(raw.bytes), uploaded: raw.uploaded === true }];
  });
}

/** The day after a day, for an end that is missing or before its start. */
function dayAfter(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, date! + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * Its start and end, always of one form: two devices writing them at once may leave a day beside a
 * time, or an end before the start; reading mends it (all day when the start is a day).
 */
function mendedWhen(startValue: unknown, endValue: unknown): { start: string; end: string } {
  const start = isWhen(startValue) ? startValue : '1970-01-01';
  let end = isWhen(endValue) ? endValue : start;
  if (DAY_PATTERN.test(start)) {
    if (!DAY_PATTERN.test(end)) end = end.slice(0, 10);
    if (end <= start) end = dayAfter(start);
  } else {
    if (DAY_PATTERN.test(end)) end = `${end}${start.slice(10)}`;
    if (end < start) end = start;
  }
  return { start, end };
}

export function eventFromRecord(record: SyncRecord): CalendarEvent {
  const f = record.fields;
  const { start, end } = mendedWhen(f.start, f.end);
  return {
    id: record.id,
    title: asString(f.title),
    description: asString(f.description),
    place: asString(f.place),
    start,
    end,
    timeZone: DAY_PATTERN.test(start) ? '' : asString(f.timeZone),
    rrule: asString(f.rrule),
    exdates: Array.isArray(f.exdates) ? f.exdates.filter(isWhen) : [],
    recurringId: asNullableId(f.recurringId),
    originalStart: isWhen(f.originalStart) ? f.originalStart : '',
    reminders: Array.isArray(f.reminders) ? f.reminders.filter((value): value is number => Number.isInteger(value)) : [],
    labelIds: asIds(f.labelIds),
    contactIds: asIds(f.contactIds),
    files: asFiles(f.files),
    feedId: asNullableId(f.feedId),
    uid: asString(f.uid),
    url: asString(f.url),
    color: isLineColor(f.color) ? f.color : null,
    trashedAt: asNullableTime(f.trashedAt),
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
    editedAt: editedAt(record),
  };
}

/** An event's synced fields, whole (a new event, a copy, an import). */
export function eventFields(event: Omit<CalendarEvent, 'id' | 'editedAt'>): Fields {
  return {
    title: event.title,
    description: event.description,
    place: event.place,
    start: event.start,
    end: event.end,
    timeZone: event.timeZone,
    rrule: event.rrule,
    exdates: [...event.exdates],
    recurringId: event.recurringId,
    originalStart: event.originalStart,
    reminders: [...event.reminders],
    labelIds: [...event.labelIds],
    contactIds: [...event.contactIds],
    files: event.files.map(file => ({ ...file })),
    feedId: event.feedId,
    uid: event.uid,
    url: event.url,
    color: event.color,
    trashedAt: event.trashedAt,
    createdAt: event.createdAt,
    deletedAt: event.deletedAt,
  };
}

export function labelFromRecord(record: SyncRecord): CalendarLabel {
  const f = record.fields;
  return {
    id: record.id,
    name: asString(f.name),
    color: isLineColor(f.color) ? f.color : 'grey',
    position: typeof f.position === 'string' && f.position ? f.position : 'a0',
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
  };
}

export function labelFields(label: Omit<CalendarLabel, 'id'>): Fields {
  return { name: label.name, color: label.color, position: label.position, createdAt: label.createdAt, deletedAt: label.deletedAt };
}

export function feedFromRecord(record: SyncRecord): CalendarFeed {
  const f = record.fields;
  return {
    id: record.id,
    kind: f.kind === 'holidays' ? 'holidays' : 'ics',
    name: asString(f.name),
    url: asString(f.url),
    color: isLineColor(f.color) ? f.color : 'grey',
    hidden: f.hidden === true,
    position: typeof f.position === 'string' && f.position ? f.position : 'a0',
    refreshedAt: asNullableTime(f.refreshedAt),
    error: asString(f.error),
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
  };
}

export function feedFields(feed: Omit<CalendarFeed, 'id'>): Fields {
  return {
    kind: feed.kind,
    name: feed.name,
    url: feed.url,
    color: feed.color,
    hidden: feed.hidden,
    position: feed.position,
    refreshedAt: feed.refreshedAt,
    error: feed.error,
    createdAt: feed.createdAt,
    deletedAt: feed.deletedAt,
  };
}
