/**
 * Days and times of day as Agenda stores them (`2026-11-02`, `2026-11-02T14:30`), counted as a
 * calendar counts them, with no device zone in the way: arithmetic happens on the civil date (in
 * UTC's arithmetic, which has no daylight saving), and an instant is only reached through a zone
 * (`wallToInstant`, `instantToWall`), read from the platform's time zone data (`Intl`: Hermes, the
 * browsers and Node all carry it). A zone the platform does not know reads as the device's own.
 */
import { DAY_PATTERN, WALL_PATTERN, type Day, type Wall } from '../models/events';

const MINUTE = 60_000;
const DAY_MS = 86_400_000;
const pad = (value: number, size = 2): string => String(value).padStart(size, '0');

export interface CivilParts {
  readonly year: number;
  /** 1 to 12. */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

export const isDay = (value: string): boolean => DAY_PATTERN.test(value);
export const isWall = (value: string): boolean => WALL_PATTERN.test(value);

/** A day or a time of day's parts (midnight for a day). */
export function partsOf(value: string): CivilParts {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = value.length >= 16 ? Number(value.slice(11, 13)) : 0;
  const minute = value.length >= 16 ? Number(value.slice(14, 16)) : 0;
  return { year, month, day, hour, minute };
}

export function dayKey(year: number, month: number, day: number): Day {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function wallKey(parts: CivilParts): Wall {
  return `${dayKey(parts.year, parts.month, parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** Minutes since 1970-01-01T00:00, as if in UTC: what wall times are counted and compared in. */
export function civilMinutes(value: string): number {
  const p = partsOf(value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) / MINUTE;
}

/** Back from `civilMinutes`. */
export function fromCivilMinutes(minutes: number): CivilParts {
  const date = new Date(minutes * MINUTE);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes() };
}

/** Days since 1970-01-01 of a day. */
export function dayNumber(day: string): number {
  const p = partsOf(day);
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / DAY_MS);
}

export function dayFromNumber(number: number): Day {
  const date = new Date(number * DAY_MS);
  return dayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addDays(day: string, days: number): Day {
  return dayFromNumber(dayNumber(day.slice(0, 10)) + days);
}

/** Days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b.slice(0, 10)) - dayNumber(a.slice(0, 10));
}

/** 0 Sunday to 6 Saturday. */
export function weekdayOf(day: string): number {
  return (((dayNumber(day.slice(0, 10)) + 4) % 7) + 7) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The same day `months` later, cut to the month's last day (31 January + 1 month: 28 February). */
export function addMonths(day: string, months: number): Day {
  const p = partsOf(day);
  const index = p.year * 12 + (p.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return dayKey(year, month, Math.min(p.day, daysInMonth(year, month)));
}

export function addMinutes(wall: string, minutes: number): Wall {
  return wallKey(fromCivilMinutes(civilMinutes(wall) + minutes));
}

/** Minutes from one wall time to another. */
export function minutesBetween(a: string, b: string): number {
  return civilMinutes(b) - civilMinutes(a);
}

/** The first day of the week holding `day`, the week starting on `weekStart` (0 Sunday, 1 Monday, 6 Saturday). */
export function startOfWeek(day: string, weekStart: number): Day {
  return addDays(day, -((weekdayOf(day) - weekStart + 7) % 7));
}

export const startOfMonth = (day: string): Day => `${day.slice(0, 7)}-01`;

/** ISO 8601's week number (weeks start on Monday, week 1 holds the year's first Thursday). */
export function isoWeek(day: string): number {
  const thursday = addDays(day, 3 - ((weekdayOf(day) + 6) % 7));
  const yearStart = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor(daysBetween(yearStart, thursday) / 7) + 1;
}

/** The weeks of a month to draw as a grid: whole weeks from the one holding the 1st to the one holding the last day. */
export function monthGrid(month: string, weekStart: number): Day[][] {
  const first = startOfMonth(month);
  const p = partsOf(first);
  const last = dayKey(p.year, p.month, daysInMonth(p.year, p.month));
  const weeks: Day[][] = [];
  for (let day = startOfWeek(first, weekStart); day <= last; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(day, index)));
  }
  return weeks;
}

// ── zones ──────────────────────────────────────────────────────────────────

/** The zones an event's form offers first, on both clients; the device's and the event's own join them. */
export const USUAL_ZONES = [
  'Europe/Paris',
  'Europe/London',
  'Europe/Brussels',
  'Europe/Zurich',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Lisbon',
  'Europe/Rome',
  'Europe/Athens',
  'Africa/Casablanca',
  'America/Montreal',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Indian/Reunion',
  'America/Guadeloupe',
  'UTC',
] as const;

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(zone: string): Intl.DateTimeFormat | null {
  if (formatters.has(zone)) return formatters.get(zone)!;
  let made: Intl.DateTimeFormat | null;
  try {
    made = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  } catch {
    made = null;
  }
  formatters.set(zone, made);
  return made;
}

/** Whether the platform knows this zone (`Europe/Paris`); '' never is one. */
export function isKnownZone(zone: string): boolean {
  return zone !== '' && formatterFor(zone) !== null;
}

/** The device's zone (`Europe/Paris`), '' when the platform does not say. */
export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/** Minutes the zone is ahead of UTC at an instant (+60 in Paris in winter); the device's offset for '' or a zone the platform does not know. */
export function zoneOffset(instant: number, zone: string): number {
  const format = zone ? formatterFor(zone) : null;
  if (!format) return -new Date(instant).getTimezoneOffset();
  const parts: Record<string, number> = {};
  for (const part of format.formatToParts(new Date(instant))) if (part.type !== 'literal') parts[part.type] = Number(part.value);
  const asUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour! % 24, parts.minute!, parts.second!);
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / MINUTE);
}

/**
 * The instant a wall time (or a day's midnight) is in a zone. A time that a change of the clocks
 * skips (2:30 on the spring night) is read with the offset before it, so it lands an hour later, as
 * iCalendar asks; one that happens twice is the first.
 */
export function wallToInstant(value: string, zone: string): number {
  const asUtc = civilMinutes(value) * MINUTE;
  const first = zoneOffset(asUtc, zone);
  const guess = asUtc - first * MINUTE;
  const second = zoneOffset(guess, zone);
  if (second === first) return guess;
  const other = asUtc - second * MINUTE;
  return zoneOffset(other, zone) === second ? Math.min(guess, other) : Math.max(guess, other);
}

/** The wall time an instant is in a zone ('' the device's). */
export function instantToWall(instant: number, zone: string): Wall {
  return wallKey(fromCivilMinutes(Math.floor(instant / MINUTE) + zoneOffset(instant, zone)));
}

/** The day an instant falls on in a zone ('' the device's). */
export function instantToDay(instant: number, zone = ''): Day {
  return instantToWall(instant, zone).slice(0, 10);
}

/** Midnight of a day in a zone ('' the device's), as an instant. */
export function dayToInstant(day: string, zone = ''): number {
  return wallToInstant(day.slice(0, 10), zone);
}

/** The time of day of a wall time (`14:30`). */
export const clockPart = (wall: string): string => wall.slice(11, 16);

/**
 * A time of day from what was typed, as both clients read it: « 9 », « 9h », « 9h5 », « 09:05 »,
 * « 905 », « 2130 », « 21.30 », « 9 pm », « 9:30am ». « HH:MM », or null when it reads as none.
 */
export function readClock(typed: string): string | null {
  const text = typed.trim().toLowerCase().replace(/\s+/g, '');
  const match = /^(\d{1,2})(?:[h:.,](\d{0,2}))?(am|pm|a|p)?$/.exec(text) ?? /^(\d{1,2})(\d{2})(am|pm|a|p)?$/.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2].length === 1 ? `${match[2]}0` : match[2]) : 0;
  const half = match[3];
  if (half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half.startsWith('p') ? 12 : 0);
  }
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Today on this device. */
export const today = (now: number): Day => instantToDay(now, '');
