/** What Contacts' programs add to the dictionary at start, before anything is shown: the design system’s French and Contacts' own. */
import { addFrench } from '@unlease/core/i18n';
import { DESIGN_FRENCH } from '@unlease/design/i18n/fr';
import { CONTACTS_FRENCH } from './fr';

export function addContactsFrench(): void {
  addFrench(DESIGN_FRENCH, CONTACTS_FRENCH);
}
