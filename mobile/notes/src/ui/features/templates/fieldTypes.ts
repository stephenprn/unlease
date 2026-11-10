/** Each field type's glyph, the same on both clients (the web's `FIELD_TYPE_GLYPHS`). */
import type { GlyphName } from '@unlease/design/glyphs';
import type { TemplateFieldType } from '@unlease/notes/models/templates';

export const FIELD_TYPE_GLYPHS: Readonly<Record<TemplateFieldType, GlyphName>> = {
  text: 'text',
  number: 'hash',
  date: 'calendar',
  duration: 'clock',
  list: 'list',
  yesno: 'boxChecked',
};
