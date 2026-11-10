/** What Contacts' programs add to the dictionary at start, before anything is shown: the design system's English and Contacts' own. */
import { addEnglish } from '@unlease/core/i18n';
import { DESIGN_ENGLISH } from '@unlease/design/i18n/en';
import { CONTACTS_ENGLISH } from './en';

export function addContactsEnglish(): void {
  addEnglish(DESIGN_ENGLISH, CONTACTS_ENGLISH);
}
