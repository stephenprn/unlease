/** A fact's type: its glyph (the phone's the same) and « Réponse »'s choices. */
import type { GlyphName } from '@unlease/design/glyphs';
import { TEMPLATE_FIELD_TYPES, type TemplateFieldType } from '@unlease/notes/models/templates';
import { shownFieldAnswer } from '@unlease/notes/services/templates';

import type { SelectOption } from '@shared/ui/components/SelectField';

export const FIELD_TYPE_GLYPHS: Readonly<Record<TemplateFieldType, GlyphName>> = {
  text: 'text',
  number: 'hash',
  date: 'calendar',
  duration: 'clock',
  list: 'list',
  yesno: 'boxChecked',
};

/** « Réponse »'s choices: each type as the shape of Claude's answer (« un nombre »), read where shown. */
export function answerOptions(): SelectOption<TemplateFieldType>[] {
  return TEMPLATE_FIELD_TYPES.map(type => ({ value: type, label: shownFieldAnswer(type) }));
}
