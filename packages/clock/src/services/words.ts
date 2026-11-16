/**
 * How an alarm reads, the same on both clients and in its notifications: its days (« En semaine »,
 * « lun., mer., ven. », « Demain »), how far its next ring is (« dans 9 h 12 »), the slip saying when
 * it will ring once set.
 */
import { t, tc, tx, localized } from '@unlease/core/i18n';
import { clockWords, longDay, shortWeekday, weekdayDay } from '@unlease/calendar/services/eventText';
import { spanWords } from '@unlease/calendar/services/today';
import { daysBetween, instantToDay } from '@unlease/calendar/services/time';
import type { Day } from '@unlease/calendar/models/events';
import { isEveryDay, isWeekdays, isWeekend, weekOrder, type Alarm } from '../models/alarm';
import type { ClockPrefs, VolumeKeys } from '../models/prefs';
import { nextRing } from './schedule';

const MINUTE = 60_000;

const capitalize = (value: string): string => value.charAt(0).toLocaleUpperCase() + value.slice(1);

/** The time of an alarm as the interface writes it (`07:30`, `7:30 AM`). */
export const alarmClock = (time: string, twelveHours = false): string => clockWords(time, twelveHours);

/** « Aujourd’hui », « Demain », « Mardi 24 novembre »: the day of a ring, from today. */
export function ringDayWords(day: Day, today: Day): string {
  const delta = daysBetween(today, day);
  if (delta === 0) return t('Today');
  if (delta === 1) return t('Tomorrow');
  return delta > 1 && delta < 7 ? capitalize(weekdayDay(day)) : longDay(day);
}

/**
 * An alarm's days as its card says them: « Tous les jours », « En semaine », « Le week-end »,
 * « lun., mer., ven. » in the week's order; a one-time alarm its day (« Demain »), or « Une fois » once gone by.
 */
export function daysWords(alarm: Pick<Alarm, 'days' | 'date'>, now: number, weekStart: number, zone = ''): string {
  if (alarm.days.length === 0) {
    const today = instantToDay(now, zone);
    return alarm.date !== null && alarm.date >= today ? ringDayWords(alarm.date, today) : t('Once');
  }
  // The suite's « Chaque jour » is a backup's recurrence; an alarm's days read as Google's Clock writes them.
  if (isEveryDay(alarm.days)) return tc('alarm', 'Every day');
  if (isWeekdays(alarm.days)) return t('Weekdays');
  if (isWeekend(alarm.days)) return t('Weekends');
  return weekOrder(weekStart)
    .filter(day => alarm.days.includes(day))
    .map(day => shortWeekday(day))
    .join(', ');
}

/** « Dans 9 h 12 », « Dans 45 min », « Dans moins d’une minute ». */
export function untilWords(at: number, now: number): string {
  const minutes = Math.ceil((at - now) / MINUTE);
  if (minutes <= 1) return t('In less than a minute');
  if (minutes < 24 * 60) return t('In {span}', { span: spanWords(minutes) });
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  return hours === 0 ? t('In {days} d', { days }) : t('In {days} d {hours} h', { days, hours });
}

/** The slip once an alarm is set or switched on: « Alarme réglée dans 9 h 12 ». */
export function setWords(alarm: Pick<Alarm, 'time' | 'days' | 'date' | 'enabled' | 'skipDay'>, now: number, zone = ''): string | null {
  const ring = nextRing(alarm, now, zone);
  if (!ring) return null;
  const minutes = Math.ceil((ring.at - now) / MINUTE);
  if (minutes <= 1) return t('Alarm set for less than a minute from now');
  if (minutes < 24 * 60) return t('Alarm set for {span} from now', { span: spanWords(minutes) });
  return t('Alarm set for {day} at {time}', { day: ringDayWords(ring.day, instantToDay(now, zone)).toLocaleLowerCase(), time: alarm.time });
}

/** An alarm's name where a sentence needs one: its label, else « Alarme ». */
export const alarmName = (alarm: Pick<Alarm, 'label'>): string => alarm.label.trim() || t('Alarm');

export const VOLUME_KEYS_WORDS: Readonly<Record<VolumeKeys, string>> = localized({
  volume: tx('Change the volume'),
  snooze: tx('Snooze'),
  stop: tx('Stop'),
});

/** « 10 minutes », « 1 minute »: a setting's minutes. */
export const minutesWords = (minutes: number): string => (minutes === 1 ? t('1 minute') : t('{minutes} minutes', { minutes }));

/** « Tout de suite », « 30 secondes », « 1 minute », « 2 minutes »: how long the volume takes to rise. */
export function rampWords(seconds: number): string {
  if (seconds === 0) return t('Off');
  if (seconds < 60) return t('{seconds} seconds', { seconds });
  return minutesWords(Math.round(seconds / 60));
}

/** « 1 h avant », « 30 min avant », « Non »: when the quiet notice before an alarm comes. */
export function upcomingWords(minutes: number): string {
  if (minutes === 0) return t('Off');
  return t('{span} before', { span: spanWords(minutes) });
}

/** « 21:00 », in the device's format. */
export const eveningAtWords = (prefs: Pick<ClockPrefs, 'eveningAt' | 'twelveHours'>): string => clockWords(prefs.eveningAt, prefs.twelveHours);

/** How long before its event an alarm for it rings: « 1 h avant », « 45 min avant ». */
export const beforeWords = (minutes: number): string => t('{span} before', { span: spanWords(minutes) });

/** The event an alarm wakes the person for: « Pour « Train pour Lyon » ». */
export const forEventWords = (title: string): string => t('For “{title}”', { title: title.trim() || t('Untitled') });

/** Why an alarm keeps quiet on a morning: « Travail de 07:30 ne sonne pas : Armistice ». */
export const offDayWords = (alarm: Pick<Alarm, 'label' | 'time'>, reason: string, twelveHours = false): string =>
  t('{alarm} at {time} won’t ring: {reason}', { alarm: alarmName(alarm), time: alarmClock(alarm.time, twelveHours), reason: reason || t('a day off') });
