/** What Pages' programs add to the dictionary at start, before anything is shown: the design system's English, Carnet's (Pages shows its collections and links), Contacts' (it mentions contacts), Agenda's (it mentions events) and Pages' own. */
import { addEnglish } from '@unlease/core/i18n';
import { addCalendarEnglish } from '@unlease/calendar/i18n';
import { PAGES_ENGLISH } from './en';

export function addPagesEnglish(): void {
  addCalendarEnglish();
  addEnglish(PAGES_ENGLISH);
}
