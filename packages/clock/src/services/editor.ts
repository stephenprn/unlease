/**
 * What the alarm editor shows as it is set, the same on both clients: when the draft would ring
 * (« Sonnera dans 9 h 12 »), its days' quick choices (once, weekdays, every day, the weekend), a time
 * as its wheels hold it (hours on a 24-hour or a 12-hour dial), and the draft another app hands
 * (Android's « set an alarm »: the assistant, a calendar's « wake me », a sleep app).
 */
import { localized, t, tx } from '@unlease/core/i18n';
import type { Day } from '@unlease/calendar/models/events';
import { spanWords } from '@unlease/calendar/services/today';
import { ALARM_LIMITS, EVERY_DAY, isWeekdays, normalizeDays, WEEKDAYS, WEEKEND } from '../models/alarm';
import type { ClockPrefs } from '../models/prefs';
import { minutesBefore, ringBefore, type EventLink } from './agenda';
import { blankDraft, draftDate, type AlarmDraft } from './editing';
import { nextRing, type Ring } from './schedule';

const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;

/** When the draft would ring if saved now: a one-time alarm on its day (`draftDate`), a repeating one on its next day. */
export function draftRing(draft: Pick<AlarmDraft, 'time' | 'days' | 'date'> & { readonly link?: AlarmDraft['link']; readonly offDays?: boolean }, now: number, zone = '', quiet?: ReadonlySet<Day>): Ring | null {
  const days = draft.link ? [] : normalizeDays(draft.days);
  const date = draft.link ? draft.link.day : days.length === 0 ? draftDate(draft, now, zone) : null;
  // `quiet`: Agenda's holidays and days off (`offDaysFrom`), which a draft that asks for it skips.
  return nextRing({ time: draft.time, days, date, enabled: true, skipDay: null, quiet: draft.offDays && days.length > 0 ? quiet : undefined }, now, zone);
}

/** « Sonnera dans 9 h 12 », « Sonnera dans 2 j 3 h »: the editor's line under the time. */
export function ringsInWords(at: number, now: number): string {
  const minutes = Math.ceil((at - now) / MINUTE);
  if (minutes <= 1) return t('Rings in less than a minute');
  if (minutes < DAY_MINUTES) return t('Rings in {span}', { span: spanWords(minutes) });
  const days = Math.floor(minutes / DAY_MINUTES);
  const hours = Math.floor((minutes % DAY_MINUTES) / 60);
  return hours === 0 ? t('Rings in {days} d', { days }) : t('Rings in {days} d {hours} h', { days, hours });
}

/** The days' quick choices, in the editor's order. */
export type DaysChoice = 'once' | 'weekdays' | 'everyDay' | 'weekends';

export const DAYS_CHOICES: readonly DaysChoice[] = ['once', 'weekdays', 'weekends', 'everyDay'];

export const DAYS_OF_CHOICE: Readonly<Record<DaysChoice, readonly number[]>> = { once: [], weekdays: WEEKDAYS, everyDay: EVERY_DAY, weekends: WEEKEND };

export const DAYS_CHOICE_NAMES: Readonly<Record<DaysChoice, string>> = localized({
  once: tx('Once'),
  weekdays: tx('Weekdays'),
  everyDay: tx('Every day [alarm]'),
  weekends: tx('Weekends'),
});

/**
 * The days a quick choice sets: the working days for the first (Agenda's Administration says which;
 * Monday to Friday until it has, or while none are set).
 */
export function daysOfChoice(choice: DaysChoice, workDays: readonly number[] = WEEKDAYS): readonly number[] {
  if (choice === 'weekdays') return workDays.length > 0 ? normalizeDays(workDays) : WEEKDAYS;
  return DAYS_OF_CHOICE[choice];
}

/** A quick choice's name: « En semaine » while the working days are Monday to Friday, « Jours travaillés » for others. */
export function daysChoiceName(choice: DaysChoice, workDays: readonly number[] = WEEKDAYS): string {
  if (choice === 'weekdays' && workDays.length > 0 && !isWeekdays(normalizeDays(workDays))) return t('Workdays');
  return DAYS_CHOICE_NAMES[choice];
}

/** The quick choice these days are, or null for another set (Monday and Thursday). */
export function daysChoiceOf(days: readonly number[], workDays: readonly number[] = WEEKDAYS): DaysChoice | null {
  const sorted = normalizeDays(days).join();
  return DAYS_CHOICES.find(choice => daysOfChoice(choice, workDays).join() === sorted) ?? null;
}

/** A day of the week turned on or off. */
export function toggleDay(days: readonly number[], day: number): number[] {
  return days.includes(day) ? normalizeDays(days.filter(each => each !== day)) : normalizeDays([...days, day]);
}

/** A time as its wheels hold it: the hour (0 to 23, or 1 to 12 with `pm` on a 12-hour dial) and the minute. */
export interface ClockParts {
  readonly hour: number;
  readonly minute: number;
  /** On a 12-hour dial: after noon. */
  readonly pm: boolean;
}

export function clockParts(time: string, twelveHours: boolean): ClockParts {
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  if (!twelveHours) return { hour, minute, pm: hour >= 12 };
  return { hour: hour % 12 === 0 ? 12 : hour % 12, minute, pm: hour >= 12 };
}

/** The `07:30` a dial's parts make. */
export function clockOf(parts: ClockParts, twelveHours: boolean): string {
  const hour = twelveHours ? (parts.hour % 12) + (parts.pm ? 12 : 0) : parts.hour;
  return `${String(hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

const wholeIn = (value: unknown, low: number, high: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= low && value <= high;

/**
 * Whether another app's « set an alarm » is set at once, without the form: it asked so (Android's
 * `EXTRA_SKIP_UI`, an assistant's « set an alarm for 7 ») and named the hour; else the form opens, filled.
 */
export function handedSkipsForm(extras: unknown): boolean {
  const raw = (typeof extras === 'object' && extras !== null ? extras : {}) as Record<string, unknown>;
  return raw.skipUi === true && wholeIn(raw.hour, 0, 23);
}

/**
 * The draft another app hands (`{ hour, minutes, days, message, vibrate }`, each only when it was
 * handed; the days 0 Sunday … 6 Saturday): the editor opens on it, and nothing is kept until it is
 * saved. What is missing or wrong takes the new alarm's own (07:00, once, this phone's sound).
 */
export function handedDraft(extras: unknown, prefs: Pick<ClockPrefs, 'defaultSound' | 'weatherDefault' | 'agendaDefault'>): AlarmDraft {
  const raw = (typeof extras === 'object' && extras !== null ? extras : {}) as Record<string, unknown>;
  const blank = blankDraft(prefs);
  const time = wholeIn(raw.hour, 0, 23) ? `${String(raw.hour).padStart(2, '0')}:${String(wholeIn(raw.minutes, 0, 59) ? raw.minutes : 0).padStart(2, '0')}` : blank.time;
  const days = Array.isArray(raw.days) ? normalizeDays(raw.days.filter((day): day is number => typeof day === 'number')) : [];
  const label = typeof raw.message === 'string' ? raw.message.replace(/\s+/g, ' ').trim().slice(0, ALARM_LIMITS.label) : '';
  return { ...blank, time, days, label, vibrate: typeof raw.vibrate === 'boolean' ? raw.vibrate : blank.vibrate };
}

/** How long before its event an alarm for it may ring, as the editor offers it. */
export const BEFORE_CHOICES: readonly number[] = [30, 60, 90, 120];

/** A new alarm for an event, before Agenda's « Me réveiller pour cet événement » is saved: an hour before, unless that is gone by. */
export const DEFAULT_BEFORE = 60;

/** A draft for an event: it rings `before` minutes before `startAt`, once, wherever the event moves. */
export function linkedDraft(draft: AlarmDraft, link: EventLink, startAt: number, before: number, zone = ''): AlarmDraft {
  const ring = ringBefore(startAt, before, zone);
  return { ...draft, time: ring.time, days: [], link: { eventId: link.eventId, eventStart: link.eventStart, before, day: ring.day } };
}

/** A linked draft's time moved on its wheels: still for its event, that much longer or shorter before. */
export function retimedDraft(draft: AlarmDraft, time: string, startAt: number | null, zone = ''): AlarmDraft {
  if (!draft.link || startAt === null) return { ...draft, time };
  return linkedDraft(draft, draft.link, startAt, minutesBefore(startAt, time, zone), zone);
}
