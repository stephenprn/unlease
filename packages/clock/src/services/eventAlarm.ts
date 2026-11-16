/**
 * « Ajouter une alarme » for a morning's event (the home's morning panel): a plain alarm of its own,
 * not linked to the event (Agenda's « Me réveiller pour cet événement » is that), filled in the
 * editor and kept only once saved. It rings at the event's start on this phone's clock, named after
 * the event, on the days the event repeats when an alarm's days can say them (`eventAlarmDays`), else
 * once, on that occurrence's day.
 */
import type { CalendarEvent, Day } from '@unlease/calendar/models/events';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { expandRule, parseRule } from '@unlease/calendar/services/recurrence';
import { addDays, addMinutes, daysBetween, instantToDay, instantToWall, isDay, weekdayOf } from '@unlease/calendar/services/time';
import { ALARM_LIMITS, EVERY_DAY, normalizeDays } from '../models/alarm';
import type { ClockPrefs } from '../models/prefs';
import { blankDraft, type AlarmDraft } from './editing';

/** The days an alarm for an occurrence rings: some days of the week (0 Sunday … 6 Saturday, on this phone), or once on `date`. */
export interface EventAlarmDays {
  readonly days: readonly number[];
  /** The occurrence's day on this phone, for an alarm that rings once; null for one that repeats. */
  readonly date: Day | null;
}

/** What `eventAlarmDays` reads of a series: its rule, its first start and the zone both are in. */
export type SeriesTiming = Pick<CalendarEvent, 'rrule' | 'start' | 'timeZone'>;

/**
 * How an event's repetition reads as an alarm's days (Agenda's weekdays are its zone's, shifted to
 * this phone's when the start falls on another day here):
 *
 * - every day (`FREQ=DAILY`, no BYDAY): every day;
 * - `FREQ=DAILY` with BYDAY, or `FREQ=WEEKLY`: those weekdays (WEEKLY without BYDAY: its start's).
 *   A position in BYDAY (`1MO`) means nothing in a daily or weekly rule; Agenda reads it as the
 *   weekday alone, and so does this;
 * - anything an alarm's weekly days cannot say (an interval over 1, MONTHLY, YEARLY, a rule kept to
 *   some months or days of the month, one Agenda does not expand) or a series with no occurrence
 *   after this one (its COUNT or UNTIL reached), an occurrence moved on its own, or no repetition:
 *   once, on that occurrence's day.
 */
export function eventAlarmDays(occurrence: Pick<Occurrence, 'start' | 'occurrence' | 'startAt' | 'repeats'>, series: SeriesTiming | null, zone = ''): EventAlarmDays {
  const here = instantToDay(occurrence.startAt, zone);
  const once: EventAlarmDays = { days: [], date: here };
  // An exception moved off its series' rhythm rings once; one only retitled keeps the series' days.
  if (!occurrence.repeats || !series || isDay(occurrence.start) || occurrence.start !== occurrence.occurrence) return once;
  const rule = parseRule(series.rrule);
  if (!rule || rule.partial || rule.interval !== 1 || (rule.freq !== 'DAILY' && rule.freq !== 'WEEKLY')) return once;
  if (rule.byMonth.length > 0 || rule.byMonthDay.length > 0 || rule.bySetPos.length > 0) return once;
  // A series that ends here (its COUNT or UNTIL reached): nothing left for a repeating alarm to ring for.
  if (rule.count !== null || rule.until !== null) {
    const after = expandRule(rule, series.start, series.timeZone, addMinutes(occurrence.occurrence, 1), `${addDays(occurrence.occurrence.slice(0, 10), 8)}T00:00`, 1);
    if (after.starts.length === 0) return once;
  }
  const own = rule.byDay.length > 0 ? rule.byDay.map(entry => entry.weekday) : rule.freq === 'DAILY' ? EVERY_DAY : [weekdayOf(series.start.slice(0, 10))];
  // 23:00 on Monday in New York is Tuesday in Paris: the days move with it.
  const shift = daysBetween(occurrence.start.slice(0, 10), here);
  return { days: normalizeDays(own.map(day => (((day + shift) % 7) + 7) % 7)), date: null };
}

/**
 * The editor's draft for a timed occurrence (null for an all-day one: no hour to take): its start on
 * this phone's clock, its title as the label, its days (`eventAlarmDays`), this phone's defaults.
 */
export function eventAlarmDraft(occurrence: Occurrence, series: SeriesTiming | null, prefs: Pick<ClockPrefs, 'defaultSound' | 'weatherDefault' | 'agendaDefault'>, zone = ''): AlarmDraft | null {
  if (occurrence.allDay) return null;
  const { days, date } = eventAlarmDays(occurrence, series, zone);
  const label = occurrence.event.title.replace(/\s+/g, ' ').trim().slice(0, ALARM_LIMITS.label);
  return { ...blankDraft(prefs, instantToWall(occurrence.startAt, zone).slice(11, 16)), days, date, label };
}
