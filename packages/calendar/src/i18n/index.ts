/**
 * What Agenda's programs add to the dictionary at start, before anything is shown: the design
 * system’s French, Carnet's and Contacts' (whose reminders and birthdays it shows) and its own.
 * Pages mentions events, so `addPagesFrench` adds this too.
 */
import { addFrench } from '@unlease/core/i18n';
import { addContactsFrench } from '@unlease/contacts/i18n';
import { addNotesFrench } from '@unlease/notes/i18n';
import { CALENDAR_FRENCH } from './fr';

export function addCalendarFrench(): void {
  addNotesFrench();
  addContactsFrench();
  addFrench(CALENDAR_FRENCH);
}
