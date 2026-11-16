/**
 * How the calendar looks on this device (Réglages, never synced): the view it opens on (« Aujourd'hui » too), the week's
 * first day, the working days only and week numbers, the hours' format, a new event's length and reminders, and
 * the layers shown from the other apps, and the morning digest.
 */
import { isLineColor, type LineColor } from '@unlease/design/colors';
import { OWN_EVENTS_COLOR } from '../services/colors';
import { DIGEST_AT, isDigestTime } from '../services/digest';
import { isCalendarView, type CalendarView } from '../services/eventText';

export interface CalendarPrefs {
  readonly view: CalendarView;
  /** 0 Sunday, 1 Monday, 6 Saturday. */
  readonly weekStart: number;
  /**
   * « Jours travaillés seulement »: the week and the month show only the days worked (the server's
   * `calendar.workDays`, `services/eventText` `shownWeekdays`). Its stored name is from when it hid
   * Saturday and Sunday: never renamed.
   */
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
  /** « Couleur de vos événements »: the pigment of the events without one of their own, a label's or a calendar's (« Mes événements »). */
  readonly ownColor: LineColor;
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
  ownColor: OWN_EVENTS_COLOR,
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
    ownColor: isLineColor(raw.ownColor) ? raw.ownColor : d.ownColor,
  };
}
