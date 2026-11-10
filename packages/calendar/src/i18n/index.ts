/**
 * What Agenda's programs add to the dictionary at start, before anything is shown: the design
 * system's English, Carnet's and Contacts' (whose reminders and birthdays it shows) and its own.
 * Pages mentions events, so `addPagesEnglish` adds this too.
 */
import { addEnglish } from '@unlease/core/i18n';
import { addContactsEnglish } from '@unlease/contacts/i18n';
import { addNotesEnglish } from '@unlease/notes/i18n';
import { CALENDAR_ENGLISH } from './en';

export function addCalendarEnglish(): void {
  addNotesEnglish();
  addContactsEnglish();
  addEnglish(CALENDAR_ENGLISH);
}
