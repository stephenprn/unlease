/**
 * Agenda's sections of the Administration, in words both clients share (as Carnet's `seerrLine`,
 * Pages' `pagesAskLine`): each one's line on the Administration's home and its « how it works »:
 * the public holidays, the calendar published at a secret address, the questions to Claude.
 */
import { t, tc, tx } from '@unlease/core/i18n';
import type { StatusLine } from '@unlease/core/services/admin';
import { countryName } from '@unlease/core/services/setup';
import type { ServerSettings } from '@unlease/core/sync/settings';

export const HOLIDAYS_INFO = tx('The server fetches the chosen country’s public holidays from Nager.Date (open data, no account) for last year, this year and the next two, and reads them again each year. They appear under “Other calendars” on every device, where each can hide them.');

/** « Jours fériés »: the country (and its region) whose days the server fetches, or none. */
export function holidaysLine(settings: ServerSettings): StatusLine {
  const { country, region } = settings.calendar.holidays;
  if (!country) return { tone: 'off', title: t('No public holidays'), meta: t('Choose a country to see its public holidays in the calendar.') };
  return { tone: 'ok', title: region ? `${countryName(country)} · ${region}` : countryName(country), meta: t('Read from Nager.Date') };
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
