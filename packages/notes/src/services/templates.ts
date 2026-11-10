/**
 * Templates at work (`models/templates`): the fields a link is read with, where they come from (its
 * collection's template, else its kind's, changed or preset), how they are checked as the person
 * shapes them, a signature that says which version read a link (`link.readWith`), and the words
 * Claude is sent. Shared by the server (what it asks), both clients (the editor, « Relire ») and the
 * demo.
 */
import { inEnglish, t, tc } from '@unlease/core/i18n';
import { INBOX_ID, LINK_KINDS, type LinkItem, type LinkKind, type Note } from '../models/entities';
import {
  KIND_TEMPLATES,
  TEMPLATE_FIELD_TYPE_HINTS,
  TEMPLATE_FIELD_TYPE_NAMES,
  TEMPLATE_FIELD_TYPE_PROMPTS,
  TEMPLATE_FIELD_TYPES,
  TEMPLATE_LIMITS,
  type LinkTemplate,
  type PresetField,
  type TemplateField,
  type TemplateFieldType,
} from '../models/templates';

/** The fixed id a kind's changed template is kept under: two devices changing it write one record. */
export function kindTemplateId(kind: LinkKind): string {
  return `template-${kind}`;
}

/** The kind whose template this id is, or null for one of the person's own. */
export function kindOfTemplateId(id: string): LinkKind | null {
  const kind = id.startsWith('template-') ? id.slice('template-'.length) : '';
  return (LINK_KINDS as readonly string[]).includes(kind) ? (kind as LinkKind) : null;
}

const CONTEXT = /^(.+) \[(\w+)\]$/;

/** A preset's name (or hint) in the interface's language: « Note [rating] » reads « Note », « Rating » in English. */
function shown(text: string): string {
  const contextual = CONTEXT.exec(text);
  return contextual ? tc(contextual[2]!, contextual[1]!) : t(text);
}

/** A preset's name in French and in English (« Note » / « Rating »): what the analysis prompt lists. */
export function presetNames(field: PresetField): { readonly fr: string; readonly en: string } {
  const contextual = CONTEXT.exec(field.name);
  return { fr: contextual ? contextual[1]! : field.name, en: inEnglish(field.name) };
}

/** A preset's field as the person sees it (and as it is kept once they change the template): its words in the interface's language. */
export function presetField(field: PresetField): TemplateField {
  return { id: field.id, name: shown(field.name), type: field.type, hint: shown(field.hint) };
}

/** A kind's preset fields in the interface's language. */
export function presetFields(kind: LinkKind): TemplateField[] {
  return KIND_TEMPLATES[kind].map(presetField);
}

/** A type's name and what a value of it looks like, in the interface's language. */
export function shownFieldType(type: TemplateFieldType): { readonly name: string; readonly hint: string } {
  return { name: t(TEMPLATE_FIELD_TYPE_NAMES[type]), hint: t(TEMPLATE_FIELD_TYPE_HINTS[type]) };
}

const FIELD_ID = /^[A-Za-z0-9]{1,24}$/;

/** One stored field, or null when it is not one (a newer client's type reads as text). */
function parseField(value: unknown): TemplateField | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, name, type, hint } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !FIELD_ID.test(id) || typeof name !== 'string' || !name.trim()) return null;
  return {
    id,
    name: name.trim().slice(0, TEMPLATE_LIMITS.fieldName),
    type: (TEMPLATE_FIELD_TYPES as readonly unknown[]).includes(type) ? (type as TemplateFieldType) : 'text',
    hint: typeof hint === 'string' ? hint.trim().slice(0, TEMPLATE_LIMITS.hint) : '',
  };
}

/** A template's stored fields, each checked, the first of two ids or names kept, at most `TEMPLATE_LIMITS.fields`. */
export function parseTemplateFields(value: unknown): TemplateField[] {
  if (!Array.isArray(value)) return [];
  const out: TemplateField[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const entry of value) {
    const field = parseField(entry);
    if (!field || ids.has(field.id) || names.has(fold(field.name))) continue;
    ids.add(field.id);
    names.add(fold(field.name));
    out.push(field);
    if (out.length === TEMPLATE_LIMITS.fields) break;
  }
  return out;
}

/** The sync check of a template's `fields`: what `parseTemplateFields` keeps, and nothing it would cut. */
export function isTemplateFields(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > TEMPLATE_LIMITS.fields) return false;
  return value.every(entry => {
    if (typeof entry !== 'object' || entry === null) return false;
    const { id, name, type, hint } = entry as Record<string, unknown>;
    return (
      typeof id === 'string' &&
      FIELD_ID.test(id) &&
      typeof name === 'string' &&
      name.length <= TEMPLATE_LIMITS.fieldName &&
      typeof type === 'string' &&
      /^[a-z]{1,16}$/.test(type) &&
      typeof hint === 'string' &&
      hint.length <= TEMPLATE_LIMITS.hint
    );
  });
}

const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .trim();

/** A new field's id: short, unique in its template. */
export function newFieldId(fields: readonly TemplateField[]): string {
  const taken = new Set(fields.map(each => each.id));
  for (let n = fields.length + 1; ; n++) {
    const id = `f${n}`;
    if (!taken.has(id)) return id;
  }
}

/** Where a link's fields come from: its collection's template, or its kind's (changed by the person, or the preset). */
export type TemplateSource = { readonly from: 'collection'; readonly template: LinkTemplate } | { readonly from: 'kind'; readonly kind: LinkKind; readonly template: LinkTemplate | null };

/** The live templates by id, as a store keeps them. */
export type Templates = Readonly<Record<string, LinkTemplate>>;

const live = (template: LinkTemplate | undefined): LinkTemplate | null => (template && template.deletedAt === null ? template : null);

/** A kind's template as the person left it: their changed one, or null while the preset reads. */
export function changedKindTemplate(templates: Templates, kind: LinkKind): LinkTemplate | null {
  return live(templates[kindTemplateId(kind)]);
}

/** A kind's fields now: the person's changed template's, else the preset's. */
export function kindFields(templates: Templates, kind: LinkKind): readonly TemplateField[] {
  return changedKindTemplate(templates, kind)?.fields ?? presetFields(kind);
}

/** The person's own template a collection reads its links with, or null (« Selon le type de lien »). */
export function collectionTemplate(templates: Templates, collection: Pick<Note, 'templateId'> | undefined): LinkTemplate | null {
  const id = collection?.templateId;
  if (!id) return null;
  const template = live(templates[id]);
  return template && template.kind === null ? template : null;
}

/** Where a link's fields come from, its collection first. « Non classé » never has a template of its own. */
export function linkTemplateSource(templates: Templates, link: Pick<LinkItem, 'noteId' | 'kind'>, notes: Readonly<Record<string, Note>>): TemplateSource {
  const own = link.noteId === INBOX_ID ? null : collectionTemplate(templates, notes[link.noteId]);
  if (own) return { from: 'collection', template: own };
  return { from: 'kind', kind: link.kind, template: changedKindTemplate(templates, link.kind) };
}

/** The fields a link is read with now. */
export function linkFields(templates: Templates, link: Pick<LinkItem, 'noteId' | 'kind'>, notes: Readonly<Record<string, Note>>): readonly TemplateField[] {
  const source = linkTemplateSource(templates, link, notes);
  return source.from === 'collection' ? source.template.fields : kindFields(templates, source.kind);
}

/**
 * A template's version, as a short stable signature of what Claude is asked (each field's name, type
 * and hint, in order): the server writes it on a link it reads (`readWith`), so a template changed
 * since says which links were read with an older one. A preset never changed signs « preset ».
 */
export function templateSignature(fields: readonly TemplateField[] | null): string {
  if (fields === null) return 'preset';
  let hash = 0x811c9dc5;
  const text = fields.map(each => `${each.name}\u001f${each.type}\u001f${each.hint}`).join('\u001e');
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `t${(hash >>> 0).toString(36)}`;
}

/** The signature a link read now would carry (`readWith`), from where its fields come. */
export function readingSignature(source: TemplateSource): string {
  return templateSignature(source.from === 'collection' ? source.template.fields : (source.template?.fields ?? null));
}

/** The live links a template reads: a collection template's, its collections' links; a kind's, the links of that kind no collection template takes. */
export function linksOfTemplate(
  template: { readonly id: string; readonly kind: LinkKind | null },
  links: readonly LinkItem[],
  notes: Readonly<Record<string, Note>>,
  templates: Templates,
): LinkItem[] {
  return links.filter(link => {
    if (link.deletedAt !== null) return false;
    const collection = notes[link.noteId];
    if (!collection || collection.deletedAt !== null || collection.trashedAt !== null) return false;
    const source = linkTemplateSource(templates, link, notes);
    return template.kind === null ? source.from === 'collection' && source.template.id === template.id : source.from === 'kind' && source.kind === template.kind;
  });
}

/** Of a template's links, those read with another version than its fields now (or never read with one): « Relire ». */
export function linksReadBefore(
  template: { readonly id: string; readonly kind: LinkKind | null },
  links: readonly LinkItem[],
  notes: Readonly<Record<string, Note>>,
  templates: Templates,
): LinkItem[] {
  return linksOfTemplate(template, links, notes, templates).filter(link => {
    if (link.status !== 'ready') return false;
    // Read before templates existed: read with the presets.
    return (link.readWith ?? 'preset') !== readingSignature(linkTemplateSource(templates, link, notes));
  });
}

/** The collections that read their links with this template, by their title's order of the board. */
export function collectionsOfTemplate(templateId: string, notes: Readonly<Record<string, Note>>): Note[] {
  return Object.values(notes)
    .filter(note => note.kind === 'links' && note.deletedAt === null && note.trashedAt === null && note.templateId === templateId)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
}

/** What can be wrong with a template being shaped: its name (the person's own), a field's name, two names alike. */
export interface TemplateProblems {
  readonly name: string | null;
  /** By field id. */
  readonly fields: Readonly<Record<string, string>>;
}

/** The problems of a draft, none when it can be kept. */
export function templateProblems(
  draft: { readonly id?: string; readonly name: string; readonly kind: LinkKind | null; readonly fields: readonly TemplateField[] },
  others: readonly LinkTemplate[],
): TemplateProblems {
  let name: string | null = null;
  if (draft.kind === null) {
    const clean = fold(draft.name);
    if (!clean) name = t('Donnez-lui un nom.');
    // A saved template being edited is among the others: its own name is no clash.
    else if (others.some(other => other.id !== draft.id && other.kind === null && other.deletedAt === null && fold(other.name) === clean)) name = t('Un modèle porte déjà ce nom.');
  }
  const fields: Record<string, string> = {};
  const seen = new Map<string, string>();
  for (const field of draft.fields) {
    const clean = fold(field.name);
    if (!clean) fields[field.id] = t('Nommez ce champ.');
    else if (seen.has(clean)) fields[field.id] = t('Un autre champ porte ce nom.');
    else seen.set(clean, field.id);
  }
  return { name, fields };
}

export function hasProblems(problems: TemplateProblems): boolean {
  return problems.name !== null || Object.keys(problems.fields).length > 0;
}

/** Fields worth offering while one is added: every preset's (once each by name), less those the template has. */
export function suggestedFields(current: readonly TemplateField[]): TemplateField[] {
  const taken = new Set(current.map(each => fold(each.name)));
  const out: TemplateField[] = [];
  for (const kind of LINK_KINDS) {
    for (const preset of KIND_TEMPLATES[kind]) {
      const field = presetField(preset);
      const key = fold(field.name);
      if (taken.has(key)) continue;
      taken.add(key);
      // A field renamed keeps its id (« Année » become « Millésime » keeps `year`): a suggestion never takes one in use.
      const used = [...current, ...out];
      out.push(used.some(each => each.id === field.id) ? { ...field, id: newFieldId(used) } : field);
    }
  }
  return out;
}

/** Two field lists alike (a changed kind template set back to what its preset says). */
export function sameFields(a: readonly TemplateField[], b: readonly TemplateField[]): boolean {
  return a.length === b.length && a.every((field, index) => field.name === b[index]!.name && field.type === b[index]!.type && field.hint === b[index]!.hint);
}

/**
 * The fields as Claude reads them in the message (never the fixed system prompt, which stays cached):
 * one line each, its name to use as the label, its type's shape, and the person's hint.
 */
export function promptFieldLines(fields: readonly TemplateField[]): string[] {
  // One line each: a hint typed on several lines (the phone's field is multiline) is joined.
  const line = (text: string): string => text.replace(/\s+/g, ' ').trim();
  return fields.map(field => `- ${line(field.name)} (${TEMPLATE_FIELD_TYPE_PROMPTS[field.type]})${line(field.hint) ? `: ${line(field.hint)}` : ''}`);
}
