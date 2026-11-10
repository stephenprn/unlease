/** A field type's glyph (the phone's the same) and the type select's choices: its name, then the shape of a value. */
import type { GlyphName } from '@unlease/design/glyphs';
import { TEMPLATE_FIELD_TYPES, type TemplateFieldType } from '@unlease/notes/models/templates';
import { shownFieldType } from '@unlease/notes/services/templates';

import type { SelectOption } from '@shared/ui/components/SelectField';

export const FIELD_TYPE_GLYPHS: Readonly<Record<TemplateFieldType, GlyphName>> = {
  text: 'text',
  number: 'hash',
  date: 'calendar',
  duration: 'clock',
  list: 'list',
  yesno: 'boxChecked',
};

/** « Durée · Un temps : 1 h 30 »; « Oui ou non » says its shape already. Read where shown. */
export function fieldTypeOptions(): SelectOption<TemplateFieldType>[] {
  return TEMPLATE_FIELD_TYPES.map(type => {
    const { name, hint } = shownFieldType(type);
    return { value: type, label: name === hint ? name : `${name} · ${hint}` };
  });
}
