/**
 * What a birthday's page says of the phone's birthday notifications (Contacts' Android app, a setting
 * of the phone: on or off, the day itself or the day before too, an hour): « Rappel le jour même à
 * 09:00, et la veille ». The web has no such notifications and says nothing of them.
 */
import { t } from '@unlease/core/i18n';
import { formatClock } from '@unlease/core/services/format';
import { daysToBirthday, type Birthday } from './birthdays';

export interface ReminderRule {
  /** The day before too. */
  readonly dayBefore: boolean;
  /** The hour of the day they come at (local time). */
  readonly hour: number;
}

/** The hour as Réglages' stepper writes it (« 09:00 »). */
export const reminderHour = (hour: number): string => formatClock(new Date(2000, 0, 1, hour, 0, 0, 0).getTime());

/** « Rappel le jour même à 09:00 », « Rappel le jour même à 09:00, et la veille ». */
export function reminderRuleWords(rule: ReminderRule): string {
  const hour = reminderHour(rule.hour);
  return rule.dayBefore ? t('Reminder on the day at {hour}, and the day before', { hour }) : t('Reminder on the day at {hour}', { hour });
}

/** How many days ahead a contact's page tells of their birthday's notification: the week before it (the list's « Cette semaine »), the day itself included. */
export const REMINDER_NEAR_DAYS = 7;

/** Whether the birthday is near enough for its contact's page to tell of its notification. */
export const reminderNear = (birthday: Birthday, now: number): boolean => daysToBirthday(birthday, now) <= REMINDER_NEAR_DAYS;
