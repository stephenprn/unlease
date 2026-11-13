/**
 * How the calendar looks on this device (Réglages, never synced): the view it opens on (« Aujourd'hui » too), the week's
 * first day, weekends and week numbers, the hours' format, a new event's length and reminders, and
 * the layers shown from the other apps, and the morning digest.
 */
import { DIGEST_AT, isDigestTime } from '../services/digest';
import { isCalendarView, type CalendarView } from '../services/eventText';

export interface CalendarPrefs {
  readonly view: CalendarView;
  /** 0 Sunday, 1 Monday, 6 Saturday. */
  readonly weekStart: number;
  readonly hideWeekends: boolean;
  readonly weekNumbers: boolean;
  readonly twelveHours: boolean;
  /** A new timed event's length, in minutes. */
  readonly eventLength: number;
  /** A new event's reminders, timed and all day. */
  readonly reminders: readonly number[];
  readonly allDayReminders: readonly number[];
  /** Contacts' birthdays. */
  readonly birthdays: boolean;
  /** Carnet's notes with a reminder. */
  readonly noteReminders: boolean;
  /** Pages' dates (a day written in a page). */
  readonly pageDates: boolean;
  /** The weather on the days ahead, where an event has a place. */
  readonly weather: boolean;
  /** Where the weather is asked for days without a placed event ('' none). */
  readonly homePlace: string;
  /** The morning digest (`services/digest`): a notification summing up the day, at `digestAt`. */
  readonly digest: boolean;
  /** `07:30`, one of `DIGEST_TIMES`. */
  readonly digestAt: string;
  /** Rung on a day with nothing too (« Rien de prévu aujourd’hui »). */
  readonly digestEmpty: boolean;
}

export const CALENDAR_PREFS_DEFAULTS: CalendarPrefs = {
  view: 'week',
  weekStart: 1,
  hideWeekends: false,
  weekNumbers: false,
  twelveHours: false,
  eventLength: 60,
  reminders: [10],
  allDayReminders: [-540],
  birthdays: true,
  noteReminders: true,
  pageDates: false,
  weather: true,
  homePlace: '',
  digest: false,
  digestAt: DIGEST_AT,
  digestEmpty: false,
};

export const EVENT_LENGTHS = [15, 30, 45, 60, 90, 120] as const;

/** Prefs as stored, read whole: what is missing or wrong takes its default. */
export function readCalendarPrefs(value: unknown): CalendarPrefs {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof CalendarPrefs, unknown>>;
  const d = CALENDAR_PREFS_DEFAULTS;
  const flag = (key: keyof CalendarPrefs, fallback: boolean): boolean => (typeof raw[key] === 'boolean' ? (raw[key] as boolean) : fallback);
  const minutes = (list: unknown, fallback: readonly number[]): readonly number[] => (Array.isArray(list) && list.every(Number.isInteger) && list.length <= 5 ? (list as number[]) : fallback);
  return {
    view: isCalendarView(raw.view) ? raw.view : d.view,
    weekStart: raw.weekStart === 0 || raw.weekStart === 1 || raw.weekStart === 6 ? raw.weekStart : d.weekStart,
    hideWeekends: flag('hideWeekends', d.hideWeekends),
    weekNumbers: flag('weekNumbers', d.weekNumbers),
    twelveHours: flag('twelveHours', d.twelveHours),
    eventLength: typeof raw.eventLength === 'number' && (EVENT_LENGTHS as readonly number[]).includes(raw.eventLength) ? raw.eventLength : d.eventLength,
    reminders: minutes(raw.reminders, d.reminders),
    allDayReminders: minutes(raw.allDayReminders, d.allDayReminders),
    birthdays: flag('birthdays', d.birthdays),
    noteReminders: flag('noteReminders', d.noteReminders),
    pageDates: flag('pageDates', d.pageDates),
    weather: flag('weather', d.weather),
    homePlace: typeof raw.homePlace === 'string' ? raw.homePlace.slice(0, 200) : d.homePlace,
    digest: flag('digest', d.digest),
    digestAt: isDigestTime(raw.digestAt) ? raw.digestAt : d.digestAt,
    digestEmpty: flag('digestEmpty', d.digestEmpty),
  };
}
