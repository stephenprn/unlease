/**
 * The templates a reading is asked with (`@unlease/notes/services/templates`), on the server: the
 * person's stored ones, the fields the message gives Claude beside the fixed prompt's presets (a
 * collection's own template, the kinds the person changed, the lists to file into), and the facts
 * Claude answers, matched back to those fields: labelled with their names exactly, in their order.
 */
import { addEnglish } from '@unlease/core/i18n';
import { foldText } from '@unlease/core/services/search';
import { EN_TEMPLATES } from '@unlease/notes/i18n/en/templates';
import { INBOX_ID, LINK_KINDS, type LinkAttribute, type LinkKind } from '@unlease/notes/models/entities';
import { KIND_TEMPLATES, type TemplateField } from '@unlease/notes/models/templates';
import { changedKindTemplate, collectionTemplate, linkTemplateSource, presetNames, readingSignature, type Templates, type TemplateSource } from '@unlease/notes/services/templates';
import { linkTemplateFromRecord, noteFromRecord } from '@unlease/notes/sync/entities';
import type { RecordStore } from '../../../sync/records';

// The presets' English names (`presetNames`) come from Carnet's dictionary: added when this module
// loads, before the prompt (`prompt.ts`, which imports it) or the names below are written.
addEnglish(EN_TEMPLATES);

/** A preset field's names, French and English, as the prompt lists them. */
export const presetLabels = presetNames;

/** The facts a link keeps when no template asks for more: as before templates. */
export const PRESET_ATTRIBUTES = 6;
/** The facts Claude's answer may carry before they are matched to the person's fields (eight at most): a few more, so one it added on its own takes no field's place. */
const READ_ATTRIBUTES = 12;

/** What a reading asks besides the prompt's presets: the person's fields, when they differ from them. */
export interface TemplateAsk {
  /** The link's collection's own template's fields: Claude fills exactly these. Null: each link by its kind. */
  readonly fields: readonly TemplateField[] | null;
  /** The kinds whose template the person changed: their fields replace the prompt's lists for those kinds. */
  readonly kinds: readonly { readonly kind: LinkKind; readonly fields: readonly TemplateField[] }[];
}

export const NO_TEMPLATES: TemplateAsk = { fields: null, kinds: [] };

/** Every stored template by id, deleted ones too (the services read only the live ones). */
export function storedTemplates(records: RecordStore): Templates {
  const out: Record<string, ReturnType<typeof linkTemplateFromRecord>> = {};
  for (const record of records.ofType('linkTemplate')) out[record.id] = linkTemplateFromRecord(record);
  return out;
}

/** Where a link in this collection, of this kind, takes its fields from now. */
export function sourceFor(records: RecordStore, templates: Templates, noteId: string, kind: LinkKind): TemplateSource {
  const record = noteId === INBOX_ID ? undefined : records.get('note', noteId);
  return linkTemplateSource(templates, { noteId, kind }, record ? { [noteId]: noteFromRecord(record) } : {});
}

/** The fields a collection's own template reads its links with, or null (« Non classé », or by kind). */
export function collectionFields(records: RecordStore, templates: Templates, noteId: string): readonly TemplateField[] | null {
  if (noteId === INBOX_ID) return null;
  const record = records.get('note', noteId);
  return record ? (collectionTemplate(templates, noteFromRecord(record))?.fields ?? null) : null;
}

/** What to ask for a link in this collection: its collection's fields, or else the kinds the person changed. A link Claude files asks by kind (its lists carry their own). */
export function templateAsk(records: RecordStore, templates: Templates, noteId: string, autoFile: boolean): TemplateAsk {
  const fields = autoFile ? null : collectionFields(records, templates, noteId);
  if (fields) return { fields, kinds: [] };
  return { fields: null, kinds: changedKinds(templates) };
}

/** The kinds whose template the person changed, in the kinds' order. */
export function changedKinds(templates: Templates): TemplateAsk['kinds'] {
  return LINK_KINDS.flatMap(kind => {
    const changed = changedKindTemplate(templates, kind);
    return changed ? [{ kind, fields: changed.fields }] : [];
  });
}

/**
 * The facts kept of Claude's answer before they are matched to the fields (`templatedAttributes`):
 * six, as before templates, when none of the person's fields are asked; else room for every field
 * (eight at most) and a few Claude may add on its own.
 */
export function attributeLimit(counts: readonly number[]): number {
  return counts.length === 0 ? PRESET_ATTRIBUTES : READ_ATTRIBUTES;
}

const fold = (text: string): string => foldText(text).replace(/\s+/g, ' ').trim();

/** A preset field's names in both languages, by its id: a field kept from a preset (« Année », `year`) is still found when Claude wrote « Year ». */
const PRESET_NAMES: ReadonlyMap<string, readonly string[]> = new Map(
  LINK_KINDS.flatMap(kind => KIND_TEMPLATES[kind]).map(preset => {
    const names = presetNames(preset);
    return [preset.id, [fold(names.fr), fold(names.en)]] as const;
  }),
);

/**
 * Claude's facts as the link keeps them, for the fields it was read with. The person's fields (a
 * template, `fields` given): only those, labelled with their names exactly as written, in their order,
 * eight at most. A kind's preset (`fields` null): its facts in the preset's order (a label in either
 * language), then any other Claude chose, six at most, as before templates.
 */
export function templatedAttributes(attributes: readonly LinkAttribute[], fields: readonly TemplateField[] | null, kind: LinkKind): LinkAttribute[] {
  if (fields !== null) {
    const byLabel = new Map(attributes.map(attribute => [fold(attribute.label), attribute.value] as const));
    // Each field's own name first, then, for a field still empty, its preset's names in either language.
    const found = new Map<string, string>();
    for (const field of fields) if (byLabel.has(fold(field.name))) found.set(field.id, fold(field.name));
    const taken = new Set(found.values());
    for (const field of fields) {
      const label = found.has(field.id) ? undefined : PRESET_NAMES.get(field.id)?.find(name => byLabel.has(name) && !taken.has(name));
      if (label === undefined) continue;
      found.set(field.id, label);
      taken.add(label);
    }
    return fields.flatMap(field => (found.has(field.id) ? [{ label: field.name, value: byLabel.get(found.get(field.id)!)! }] : []));
  }
  const order = new Map<string, number>();
  KIND_TEMPLATES[kind].forEach((preset, index) => {
    const names = presetNames(preset);
    order.set(fold(names.fr), index);
    order.set(fold(names.en), index);
  });
  const rank = (attribute: LinkAttribute): number => order.get(fold(attribute.label)) ?? KIND_TEMPLATES[kind].length;
  return attributes
    .map((attribute, index) => ({ attribute, index }))
    .sort((a, b) => rank(a.attribute) - rank(b.attribute) || a.index - b.index)
    .slice(0, PRESET_ATTRIBUTES)
    .map(({ attribute }) => attribute);
}

/** The fields a reading from this source fills (null: its kind's preset), and the version it is written with (`readWith`). */
export function readWithSource(source: TemplateSource): { readonly fields: readonly TemplateField[] | null; readonly readWith: string } {
  const fields = source.from === 'collection' ? source.template.fields : (source.template?.fields ?? null);
  return { fields, readWith: readingSignature(source) };
}
