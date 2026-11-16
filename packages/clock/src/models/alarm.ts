/**
 * Clock's stored entity: an alarm (`alarm`), a sync record like every other app's, so it is backed
 * up, a new phone gets it and the web app shows it; every phone of the person rings it unless told
 * not to (Réglages' « Sonner sur ce téléphone », `ClockPrefs.ringsHere`). Rows are never removed:
 * `deletedAt` is the tombstone.
 *
 * **When** it rings is a time of day (`07:30`) on the phone's own clock, wherever the phone is, as
 * every alarm clock does: no zone is stored. It repeats on some days of the week (`days`, 0 Sunday to
 * 6 Saturday, as `Date` and Agenda count them), or rings once (`days` empty), on the day it was set
 * for (`date`): a one-time alarm whose moment went by reads as off without anything being written,
 * so a phone that rang it writes nothing and two phones never disagree about it.
 */
import type { Day } from '@unlease/calendar/models/events';

export interface Alarm {
  readonly id: string;
  /** `07:30`, on the phone's clock. */
  readonly time: string;
  /** The days of the week it rings (0 Sunday … 6 Saturday), sorted; empty: once, on `date`. */
  readonly days: readonly number[];
  /** A one-time alarm's day (`2026-11-17`); null for one that repeats. */
  readonly date: Day | null;
  /** Switched on. A one-time alarm also needs its moment still to come (`nextRing`). */
  readonly enabled: boolean;
  /** What it is for (« Train pour Lyon »), shown as it rings; '' none. */
  readonly label: string;
  /** One of `SOUNDS` (`melody`), `silent` (vibration alone), or a sound of the phone (`phone:<uri>`, read on that phone only). */
  readonly sound: string;
  readonly vibrate: boolean;
  /** As it rings: the weather where the phone is (`ClockPrefs.weatherDefault` for a new one). */
  readonly weather: boolean;
  /** As it rings: the day's events from Agenda (`ClockPrefs.agendaDefault` for a new one). */
  readonly agenda: boolean;
  /** A day this repeating alarm stays quiet (« Ignorer la prochaine »); one gone by means nothing. */
  readonly skipDay: Day | null;
  /** A repeating alarm stays quiet on Agenda's public holidays and on the days off it holds (an all-day event « Jour de congé »). */
  readonly offDays: boolean;
  /**
   * The Agenda event this one-time alarm wakes the person for (« Réveil » on the event): it rings
   * `before` minutes before that occurrence's start, wherever the event moves; `time` and `date`
   * keep the ring as last set, for when the event is gone. null: an alarm of its own.
   */
  readonly eventId: string | null;
  /** Which occurrence of a repeating event (its original start, as Agenda keys it); '' for one that does not repeat. */
  readonly eventStart: string;
  /** Minutes between the ring and the event's start. */
  readonly before: number;
  /**
   * Not stored: the days this alarm stays quiet because of Agenda (its holidays and days off, with
   * `offDays`), filled by `ringingAlarms` for the schedule to read.
   */
  readonly quiet?: ReadonlySet<Day>;
  readonly createdAt: number;
  readonly deletedAt: number | null;
  readonly editedAt: number;
}

export const ALARM_LIMITS = {
  label: 80,
  sound: 600,
  /** An alarm rings at most a day before the event it wakes the person for. */
  before: 24 * 60,
} as const;

/** `07:30`: hours 00 to 23, minutes 00 to 59. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isClockTime = (value: unknown): value is string => typeof value === 'string' && TIME_PATTERN.test(value);

/** What a field missing from an older record reads as, and what a rollback writes back. */
export const ALARM_FIELD_DEFAULTS = {
  label: '',
  sound: 'melody',
  vibrate: true,
  weather: true,
  agenda: true,
  skipDay: null,
  offDays: false,
  eventId: null,
  eventStart: '',
  before: 0,
} as const;

export const isLiveAlarm = (alarm: Pick<Alarm, 'deletedAt'>): boolean => alarm.deletedAt === null;

/** The days of the week in a week's order from `weekStart` (1 Monday: 1 2 3 4 5 6 0). */
export function weekOrder(weekStart: number): number[] {
  return Array.from({ length: 7 }, (_, index) => (weekStart + index) % 7);
}

/** Days as stored: each once, 0 to 6, sorted. */
export function normalizeDays(days: Iterable<number>): number[] {
  return [...new Set([...days].filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}

export const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];
export const WEEKEND: readonly number[] = [0, 6];
export const EVERY_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

const same = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((day, index) => day === b[index]);
export const isWeekdays = (days: readonly number[]): boolean => same(days, WEEKDAYS);
export const isWeekend = (days: readonly number[]): boolean => same(days, WEEKEND);
export const isEveryDay = (days: readonly number[]): boolean => same(days, EVERY_DAY);
