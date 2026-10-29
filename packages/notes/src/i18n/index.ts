/** What Carnet's programs add to the dictionary at start, before anything is shown: the design system's English and Carnet's own. */
import { addEnglish } from '@unlease/core/i18n';
import { DESIGN_ENGLISH } from '@unlease/design/i18n/en';
import { NOTES_ENGLISH } from './en';

export function addNotesEnglish(): void {
  addEnglish(DESIGN_ENGLISH, NOTES_ENGLISH);
}
