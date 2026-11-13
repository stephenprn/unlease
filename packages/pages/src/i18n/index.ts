/** What Pages' programs add to the dictionary at start, before anything is shown: the design system’s French, Carnet's (Pages shows its collections and links), Contacts' (it mentions contacts), Agenda's (it mentions events) and Pages' own. */
import { addFrench } from '@unlease/core/i18n';
import { addCalendarFrench } from '@unlease/calendar/i18n';
import { PAGES_FRENCH } from './fr';

export function addPagesFrench(): void {
  addCalendarFrench();
  addFrench(PAGES_FRENCH);
}
