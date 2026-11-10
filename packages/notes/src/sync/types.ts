/**
 * Carnet's record types, declared to the suite's sync (`@unlease/core/sync/schema`) when this module
 * loads: every program that reads Carnet's records imports it through `sync/entities`. Adding a field
 * is safe; renaming or removing one is a migration on every device.
 */
import { LOCALES } from '@unlease/core/i18n';
import {
  bool,
  defineRecordTypes,
  id,
  ids,
  int,
  nullableId,
  nullableNumber,
  nullableOneOf,
  nullableStr,
  nullableTime,
  oneOf,
  position,
  signed,
  str,
  styleKey,
  time,
  type Check,
} from '@unlease/core/sync/schema';
import { isLineColor } from '@unlease/design/colors';
import { DRAWING_LIMITS } from '../models/drawing';
import { INBOX_ID, LINK_FILERS, LINK_KINDS, NOTE_KINDS } from '../models/entities';
import { TEMPLATE_LIMITS } from '../models/templates';
import { mergeStrokes } from '../services/drawing';
import { isTemplateFields } from '../services/templates';

/** The longest text each typed field may hold. */
export const TEXT_LIMITS = {
  note: { title: 1000, body: 200_000, drawing: DRAWING_LIMITS.chars },
  check: { text: 5000 },
  link: { comment: 5000 },
} as const;

/** The most people one note or link may name. */
export const PEOPLE_MAX = 20;

const lineColor: Check = isLineColor;
/** A collection's link modules: keys a newer client may add pass on too. */
const moduleKeys: Check = value => value === null || (Array.isArray(value) && value.length <= 20 && value.every(key => typeof key === 'string' && /^[a-z]{1,20}$/.test(key)));
const attributes: Check = value =>
  Array.isArray(value) &&
  value.length <= 12 &&
  value.every(
    entry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { label?: unknown }).label === 'string' &&
      typeof (entry as { value?: unknown }).value === 'string' &&
      (entry as { label: string }).label.length <= 60 &&
      (entry as { value: string }).value.length <= 300,
  );
/** A template's fields (`models/templates`): what `parseTemplateFields` reads, nothing it would cut. */
const templateFields = signed(isTemplateFields, `templateFields:${TEMPLATE_LIMITS.fields}:${TEMPLATE_LIMITS.fieldName}:${TEMPLATE_LIMITS.hint}`);
const typed = (limit: number) => ({ limit });
const strokes = (limit: number) => ({ limit, merge: mergeStrokes });

export const NOTES_RECORD_TYPES = defineRecordTypes({
  note: {
    app: 'notes',
    fields: {
      kind: oneOf(NOTE_KINDS),
      title: str(TEXT_LIMITS.note.title),
      body: str(TEXT_LIMITS.note.body),
      rich: bool,
      drawing: str(TEXT_LIMITS.note.drawing),
      color: styleKey,
      pattern: styleKey,
      pinned: bool,
      archived: bool,
      trashedAt: nullableTime,
      labelIds: ids(100),
      position,
      reminderAt: nullableTime,
      code: str(3),
      emblem: styleKey,
      hint: str(500),
      modules: moduleKeys,
      /** A collection's template (`linkTemplate`, one of the person's own), its links read with it; null: each link's kind's. */
      templateId: nullableId,
      /** The people of Contacts it is about (`contact` ids), written only once one is picked. */
      contactIds: ids(PEOPLE_MAX),
      createdAt: time,
      deletedAt: nullableTime,
    },
    merged: { title: typed(TEXT_LIMITS.note.title), body: typed(TEXT_LIMITS.note.body), drawing: strokes(TEXT_LIMITS.note.drawing) },
    defaults: { pattern: null, emblem: null, reminderAt: null, hint: '', contactIds: [], templateId: null },
    seeded: [INBOX_ID],
  },
  check: {
    app: 'notes',
    fields: {
      noteId: id,
      text: str(TEXT_LIMITS.check.text),
      checked: bool,
      position,
      indent: int(0, 1),
      createdAt: time,
      deletedAt: nullableTime,
    },
    merged: { text: typed(TEXT_LIMITS.check.text) },
  },
  link: {
    app: 'notes',
    fields: {
      noteId: id,
      url: str(4000),
      status: oneOf(['pending', 'ready', 'failed', 'skipped']),
      autoFile: bool,
      filedBy: nullableOneOf(LINK_FILERS),
      title: str(500),
      summary: str(2000),
      siteName: str(200),
      kind: oneOf(LINK_KINDS),
      price: nullableNumber,
      currency: nullableStr(3),
      /** « Suivi des prix »: the price before its last change, as the server's watch read it; null until it changes. Written by the server. */
      priceBefore: nullableNumber,
      /** When the watch saw the price change. Written by the server. */
      priceChangedAt: nullableTime,
      /** When the watch last read the price (a page or Claude). Written by the server. */
      priceCheckedAt: nullableTime,
      attributes,
      imageIds: ids(12),
      imageUrl: nullableStr(4000),
      done: bool,
      doneAt: nullableTime,
      comment: str(TEXT_LIMITS.link.comment),
      position,
      error: nullableStr(500),
      analyzedAt: nullableTime,
      /** The template version it was read with (`templateSignature`); null: the presets, before templates. Written by the server. */
      readWith: nullableStr(40),
      lang: oneOf(LOCALES),
      /** The page « Garder une copie » made of it, in Pages: written by the server, cleared when that page is purged. */
      copy: nullableId,
      /** The people of Contacts it is for (`contact` ids): picked on the link, or a gift idea's from Contacts. */
      contactIds: ids(PEOPLE_MAX),
      createdAt: time,
      deletedAt: nullableTime,
    },
    merged: { comment: typed(TEXT_LIMITS.link.comment) },
    defaults: { filedBy: null, done: false, doneAt: null, comment: '', copy: null, contactIds: [], priceBefore: null, priceChangedAt: null, priceCheckedAt: null, readWith: null },
  },
  label: {
    app: 'notes',
    fields: {
      name: str(60),
      color: lineColor,
      position,
      createdAt: time,
      deletedAt: nullableTime,
    },
  },
  /**
   * What Carnet reads from a link (`models/templates`): a kind's own changed by the person, kept under
   * `template-<kind>` (deleted when set back: the preset reads again), or one of the person's own,
   * named, that collections pick (`note.templateId`).
   */
  linkTemplate: {
    app: 'notes',
    fields: {
      name: str(TEMPLATE_LIMITS.name),
      kind: nullableOneOf(LINK_KINDS),
      fields: templateFields,
      createdAt: time,
      deletedAt: nullableTime,
    },
  },
  attachment: {
    app: 'notes',
    fields: {
      noteId: id,
      mime: oneOf(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif']),
      width: int(0, 100_000),
      height: int(0, 100_000),
      bytes: int(0, 100 * 1024 * 1024),
      position,
      uploaded: bool,
      createdAt: time,
      deletedAt: nullableTime,
    },
  },
});

export type RecordType = keyof typeof NOTES_RECORD_TYPES;

export const RECORD_TYPES = Object.keys(NOTES_RECORD_TYPES) as readonly RecordType[];

/** One of Carnet's own types: a store may also hold another app's records (a Pages client reads Carnet's). */
export function isNotesType(value: string): value is RecordType {
  return Object.hasOwn(NOTES_RECORD_TYPES, value);
}
