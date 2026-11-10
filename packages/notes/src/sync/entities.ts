/**
 * Domain entities to and from sync records. A record may be partial (a field added later,
 * a check seen before its note): reading fills in defaults and never throws.
 */
import { isLineColor, isNoteColor, isNotePattern, type LineColor } from '@unlease/design/colors';
import {
  LINK_KINDS,
  NOTE_KINDS,
  type Attachment,
  type CheckItem,
  type Label,
  type LinkAttribute,
  type LinkItem,
  type LinkKind,
  type LinkStatus,
  type Note,
  type NoteKind,
} from '../models/entities';
import type { LinkTemplate } from '../models/templates';
import { parseTemplateFields } from '../services/templates';
import { isLocale } from '@unlease/core/i18n';
import { editedAt, type Fields, type SyncRecord } from '@unlease/core/sync/record';
// Declares Carnet's record types to the sync before any record is read.
import './types';

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
const asBool = (value: unknown): boolean => value === true;
const asTime = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;
const asNullableTime = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

export function noteFromRecord(record: SyncRecord): Note {
  const f = record.fields;
  const kind = (NOTE_KINDS as readonly unknown[]).includes(f.kind) ? (f.kind as NoteKind) : 'text';
  return {
    id: record.id,
    kind,
    title: asString(f.title),
    body: asString(f.body),
    rich: asBool(f.rich),
    drawing: asString(f.drawing),
    color: isNoteColor(f.color) ? f.color : null,
    pattern: isNotePattern(f.pattern) ? f.pattern : null,
    pinned: asBool(f.pinned),
    archived: asBool(f.archived),
    trashedAt: asNullableTime(f.trashedAt),
    labelIds: asStrings(f.labelIds),
    position: asString(f.position, 'a0'),
    reminderAt: asNullableTime(f.reminderAt),
    code: asString(f.code),
    emblem: typeof f.emblem === 'string' ? f.emblem : null,
    hint: asString(f.hint),
    modules: Array.isArray(f.modules) ? f.modules.filter((key): key is string => typeof key === 'string') : null,
    templateId: typeof f.templateId === 'string' && f.templateId ? f.templateId : null,
    contactIds: asStrings(f.contactIds),
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
    editedAt: editedAt(record),
  };
}

/** `emblem`, `pattern`, `modules`, `templateId`, `rich`, `drawing` and `contactIds` are written only when given: fields most notes never set. */
export function noteFields(
  note: Omit<Note, 'id' | 'editedAt' | 'emblem' | 'pattern' | 'modules' | 'templateId' | 'rich' | 'drawing' | 'contactIds'> & {
    readonly emblem?: string | null;
    readonly pattern?: string | null;
    readonly modules?: readonly string[] | null;
    readonly templateId?: string | null;
    readonly rich?: boolean;
    readonly drawing?: string;
    readonly contactIds?: readonly string[];
  },
): Fields {
  return {
    kind: note.kind,
    title: note.title,
    body: note.body,
    ...(note.rich ? { rich: true } : {}),
    ...(note.drawing ? { drawing: note.drawing } : {}),
    color: note.color,
    pinned: note.pinned,
    archived: note.archived,
    trashedAt: note.trashedAt,
    labelIds: [...note.labelIds],
    position: note.position,
    reminderAt: note.reminderAt,
    code: note.code,
    ...(note.emblem !== undefined ? { emblem: note.emblem } : {}),
    ...(note.pattern !== undefined && note.pattern !== null ? { pattern: note.pattern } : {}),
    ...(note.modules !== undefined && note.modules !== null ? { modules: [...note.modules] } : {}),
    ...(note.templateId ? { templateId: note.templateId } : {}),
    ...(note.contactIds && note.contactIds.length > 0 ? { contactIds: [...note.contactIds] } : {}),
    hint: note.hint,
    createdAt: note.createdAt,
    deletedAt: note.deletedAt,
  };
}

export function checkFromRecord(record: SyncRecord): CheckItem {
  const f = record.fields;
  return {
    id: record.id,
    noteId: asString(f.noteId),
    text: asString(f.text),
    checked: asBool(f.checked),
    position: asString(f.position, 'a0'),
    indent: f.indent === 1 ? 1 : 0,
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
    editedAt: editedAt(record),
  };
}

/** When a note was last changed as a person sees it: its own fields, its checklist items, its photos. */
export function noteEditedAt(note: Note, checks: readonly CheckItem[], attachments: readonly Attachment[]): number {
  let latest = note.editedAt;
  for (const item of checks) latest = Math.max(latest, item.editedAt);
  for (const photo of attachments) latest = Math.max(latest, photo.createdAt);
  return latest;
}

export function checkFields(item: Omit<CheckItem, 'id' | 'editedAt'>): Fields {
  return {
    noteId: item.noteId,
    text: item.text,
    checked: item.checked,
    position: item.position,
    indent: item.indent,
    createdAt: item.createdAt,
    deletedAt: item.deletedAt,
  };
}

function asAttributes(value: unknown): LinkAttribute[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is LinkAttribute =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as LinkAttribute).label === 'string' &&
        typeof (entry as LinkAttribute).value === 'string',
    )
    .map(entry => ({ label: entry.label, value: entry.value }));
}

export function linkFromRecord(record: SyncRecord): LinkItem {
  const f = record.fields;
  const status: LinkStatus =
    f.status === 'ready' || f.status === 'failed' || f.status === 'pending' || f.status === 'skipped' ? f.status : 'pending';
  const kind: LinkKind = (LINK_KINDS as readonly string[]).includes(f.kind as string)
    ? (f.kind as LinkKind)
    : 'other';
  return {
    id: record.id,
    noteId: asString(f.noteId),
    url: asString(f.url),
    status,
    autoFile: asBool(f.autoFile),
    filedBy: f.filedBy === 'claude' || f.filedBy === 'person' ? f.filedBy : null,
    title: asString(f.title),
    summary: asString(f.summary),
    siteName: asString(f.siteName),
    kind,
    price: typeof f.price === 'number' && Number.isFinite(f.price) ? f.price : null,
    currency: typeof f.currency === 'string' && f.currency.length === 3 ? f.currency : null,
    priceBefore: typeof f.priceBefore === 'number' && Number.isFinite(f.priceBefore) ? f.priceBefore : null,
    priceChangedAt: asNullableTime(f.priceChangedAt),
    priceCheckedAt: asNullableTime(f.priceCheckedAt),
    attributes: asAttributes(f.attributes),
    imageIds: asStrings(f.imageIds),
    imageUrl: typeof f.imageUrl === 'string' && f.imageUrl ? f.imageUrl : null,
    done: asBool(f.done),
    doneAt: asNullableTime(f.doneAt),
    comment: asString(f.comment),
    position: asString(f.position, 'a0'),
    error: typeof f.error === 'string' && f.error ? f.error : null,
    analyzedAt: asNullableTime(f.analyzedAt),
    readWith: typeof f.readWith === 'string' && f.readWith ? f.readWith : null,
    lang: isLocale(f.lang) ? f.lang : 'fr',
    copy: typeof f.copy === 'string' && f.copy ? f.copy : null,
    contactIds: asStrings(f.contactIds),
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
  };
}

/**
 * `contactIds` is written only when it names someone: most links never do. The price watch's fields
 * are the server's: a client never writes them. So is `readWith`, but for a reading copied whole
 * from another link at the same address (`savedLinks`), which carries the version it was read with.
 */
export function linkFields(
  link: Omit<LinkItem, 'id' | 'contactIds' | 'priceBefore' | 'priceChangedAt' | 'priceCheckedAt' | 'readWith'> & { readonly contactIds?: readonly string[]; readonly readWith?: string | null },
): Fields {
  return {
    noteId: link.noteId,
    url: link.url,
    status: link.status,
    autoFile: link.autoFile,
    filedBy: link.filedBy,
    title: link.title,
    summary: link.summary,
    siteName: link.siteName,
    kind: link.kind,
    price: link.price,
    currency: link.currency,
    attributes: link.attributes.map(a => ({ label: a.label, value: a.value })),
    imageIds: [...link.imageIds],
    imageUrl: link.imageUrl,
    done: link.done,
    doneAt: link.doneAt,
    comment: link.comment,
    position: link.position,
    error: link.error,
    analyzedAt: link.analyzedAt,
    lang: link.lang,
    copy: link.copy,
    ...(link.contactIds && link.contactIds.length > 0 ? { contactIds: [...link.contactIds] } : {}),
    ...(link.readWith ? { readWith: link.readWith } : {}),
    createdAt: link.createdAt,
    deletedAt: link.deletedAt,
  };
}

export function labelFromRecord(record: SyncRecord): Label {
  const f = record.fields;
  const color: LineColor = isLineColor(f.color) ? f.color : 'blue';
  return {
    id: record.id,
    name: asString(f.name),
    color,
    position: asString(f.position, 'a0'),
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
  };
}

export function labelFields(label: Omit<Label, 'id'>): Fields {
  return {
    name: label.name,
    color: label.color,
    position: label.position,
    createdAt: label.createdAt,
    deletedAt: label.deletedAt,
  };
}

export function attachmentFromRecord(record: SyncRecord): Attachment {
  const f = record.fields;
  return {
    id: record.id,
    noteId: asString(f.noteId),
    mime: asString(f.mime, 'image/jpeg'),
    width: typeof f.width === 'number' ? f.width : 0,
    height: typeof f.height === 'number' ? f.height : 0,
    bytes: typeof f.bytes === 'number' ? f.bytes : 0,
    position: asString(f.position, 'a0'),
    uploaded: asBool(f.uploaded),
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
  };
}

export function attachmentFields(attachment: Omit<Attachment, 'id'>): Fields {
  return {
    noteId: attachment.noteId,
    mime: attachment.mime,
    width: attachment.width,
    height: attachment.height,
    bytes: attachment.bytes,
    position: attachment.position,
    uploaded: attachment.uploaded,
    createdAt: attachment.createdAt,
    deletedAt: attachment.deletedAt,
  };
}

export function linkTemplateFromRecord(record: SyncRecord): LinkTemplate {
  const f = record.fields;
  return {
    id: record.id,
    name: asString(f.name),
    kind: (LINK_KINDS as readonly unknown[]).includes(f.kind) ? (f.kind as LinkKind) : null,
    fields: parseTemplateFields(f.fields),
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
  };
}

/** A template whole, as one write: its fields as the sync keeps them (id, name, type, hint). */
export function linkTemplateFields(template: Omit<LinkTemplate, 'id'>): Fields {
  return {
    name: template.name,
    kind: template.kind,
    fields: template.fields.map(field => ({ id: field.id, name: field.name, type: field.type, hint: field.hint })),
    createdAt: template.createdAt,
    deletedAt: template.deletedAt,
  };
}
