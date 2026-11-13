/** What Carnet's programs add to the dictionary at start, before anything is shown: the design system’s French and Carnet's own. */
import { addFrench } from '@unlease/core/i18n';
import { DESIGN_FRENCH } from '@unlease/design/i18n/fr';
import { NOTES_FRENCH } from './fr';

export function addNotesFrench(): void {
  addFrench(DESIGN_FRENCH, NOTES_FRENCH);
}
