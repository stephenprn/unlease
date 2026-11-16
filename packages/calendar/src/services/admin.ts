/**
 * Agenda's sections of the Administration, in words both clients share (as Carnet's `seerrLine`,
 * Pages' `pagesAskLine`): each one's line on the Administration's home and its « how it works »:
 * the public holidays, the calendar published at a secret address, the questions to Claude.
 */
import { t, tc, tx } from '@unlease/core/i18n';
import { workDaysWords, type StatusLine } from '@unlease/core/services/admin';
import { countryName } from '@unlease/core/services/setup';
import type { ServerSettings } from '@unlease/core/sync/settings';

export const HOLIDAYS_INFO = tx('Your week, for every device and every app: the days you work, and your country’s public holidays. The holidays come from Nager.Date (open data, no account): the server keeps last year’s, this year’s and the next two years’, reads them again each year, and shows them under “Other calendars” on every device, where each can hide them.');

/** « Votre semaine »: the days worked, then the country (and its region) whose public holidays the server fetches, or none. */
export function holidaysLine(settings: ServerSettings): StatusLine {
  const { country, region } = settings.calendar.holidays;
  const week = workDaysWords(settings.calendar.workDays);
  if (!country) return { tone: 'ok', title: week, meta: t('No public holidays') };
  return { tone: 'ok', title: week, meta: t('Public holidays: {country}', { country: region ? `${countryName(country)} · ${region}` : countryName(country) }) };
}

export const PUBLISH_INFO = tx('Your calendar (without the calendars you subscribe to) at a secret iCalendar address, read-only: paste it into Google Calendar (Other calendars, “From URL”), Apple Calendar or Thunderbird to see your events there. Anyone with the address sees your events: “New address” disables the old one.');

/** « Publication »: one's events at a secret address, or not served at all. */
export function publishLine(settings: ServerSettings): StatusLine {
  return settings.calendar.publishPath ? { tone: 'ok', title: t('Calendar published'), meta: t('At a secret address, read-only') } : { tone: 'off', title: t('Calendar not published'), meta: t('Publish your calendar to subscribe to it elsewhere.') };
}

export const ASK_INFO = tx('“Ask Claude” in Agenda: your events from three months back to a year ahead, and your contacts’ birthdays, are sent to Claude with the question. Off, nothing of your calendar is sent.');

/** « Questions sur l'agenda »: on, off, or waiting for Claude's key. */
export function askLine(settings: ServerSettings): StatusLine {
  if (!settings.analysis.enabled) return { tone: 'off', title: tc('line', 'No Claude key'), meta: t('Add a Claude key to ask questions about your calendar.') };
  return settings.calendar.ask ? { tone: 'ok', title: t('Questions on'), meta: t('Claude reads your events when you ask a question.') } : { tone: 'off', title: t('Questions off'), meta: t('Nothing from your calendar is sent to Claude.') };
}
