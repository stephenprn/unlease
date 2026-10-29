/**
 * Carnet's record types, declared to the suite's sync (`@unlease/core/sync/schema`) when this module
 * loads: every program that reads Carnet's records imports it through `sync/entities`. Adding a field
 * is safe; renaming or removing one is a migration on every device.
 */
import { LOCALES } from '@unlease/core/i18n';
import { REF_TYPE_PATTERN } from '@unlease/core/refs';
import {
  bool,
  defineRecordTypes,
  id,
  ids,
  int,
  isObject,
  nullableId,
  nullableNumber,
  nullableOneOf,
  nullableStr,
  nullableTime,
  oneOf,
  position,
  smallJson,
  str,
  styleKey,
  time,
  type Check,
} from '@unlease/core/sync/schema';
import { isLineColor } from '@unlease/design/colors';
import { BLOCK_FIELD_DEFAULTS, BLOCK_KINDS, TABLE_LIMITS, VIEW_LIMITS } from '../models/blocks';
import { DRAWING_LIMITS } from '../models/drawing';
import { INBOX_ID, LINK_FILERS, LINK_KINDS, NOTE_KINDS } from '../models/entities';
import { mergeStrokes } from '../services/drawing';

/** The longest text each typed field may hold. */
export const TEXT_LIMITS = {
  note: { title: 1000, body: 200_000, drawing: DRAWING_LIMITS.chars },
  check: { text: 5000 },
  link: { comment: 5000 },
  block: { text: 100_000, caption: 2000, drawing: DRAWING_LIMITS.chars },
} as const;

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
const selectOption = (value: unknown): boolean =>
  isObject(value) && id(value.id) && str(TABLE_LIMITS.name)(value.name) && styleKey(value.color) && value.color !== null;
const tableColumn = (value: unknown): boolean =>
  isObject(value) &&
  id(value.id) &&
  str(TABLE_LIMITS.name)(value.name) &&
  styleKey(value.type) &&
  value.type !== null &&
  (value.unit === undefined || str(TABLE_LIMITS.unit)(value.unit)) &&
  (value.width === undefined || int(40, 2000)(value.width)) &&
  (value.options === undefined || (Array.isArray(value.options) && value.options.length <= TABLE_LIMITS.options && value.options.every(selectOption)));
const tableColumns: Check = value =>
  Array.isArray(value) && value.length <= TABLE_LIMITS.columns && value.every(tableColumn) && new Set(value.map(column => (column as { id: string }).id)).size === value.length && smallJson(100_000)(value);
const cellValue = (value: unknown): boolean =>
  value === null ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && value.length <= TABLE_LIMITS.cellText) ||
  (Array.isArray(value) && value.length <= TABLE_LIMITS.options && value.every(id));
const tableCells: Check = value => isObject(value) && Object.keys(value).length <= TABLE_LIMITS.columns * 2 && Object.entries(value).every(([key, cell]) => id(key) && cellValue(cell)) && smallJson(200_000)(value);
const ratio: Check = value => typeof value === 'number' && Number.isFinite(value) && value >= 0.05 && value <= 20;
const viewColumn = (value: unknown): boolean => isObject(value) && typeof value.key === 'string' && value.key.length > 0 && value.key.length <= VIEW_LIMITS.key && bool(value.shown);
const viewColumns: Check = value =>
  Array.isArray(value) && value.length <= VIEW_LIMITS.columns && value.every(viewColumn) && new Set(value.map(column => (column as { key: string }).key)).size === value.length && smallJson(20_000)(value);
/** What a bookmark or an embed points at: any app's type (`@unlease/core/refs`), one a newer client added included. */
const refType: Check = value => value === null || (typeof value === 'string' && REF_TYPE_PATTERN.test(value));

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
      createdAt: time,
      deletedAt: nullableTime,
    },
    merged: { title: typed(TEXT_LIMITS.note.title), body: typed(TEXT_LIMITS.note.body), drawing: strokes(TEXT_LIMITS.note.drawing) },
    defaults: { pattern: null, emblem: null, reminderAt: null, hint: '' },
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
      attributes,
      imageIds: ids(12),
      imageUrl: nullableStr(4000),
      done: bool,
      doneAt: nullableTime,
      comment: str(TEXT_LIMITS.link.comment),
      position,
      error: nullableStr(500),
      analyzedAt: nullableTime,
      lang: oneOf(LOCALES),
      createdAt: time,
      deletedAt: nullableTime,
    },
    merged: { comment: typed(TEXT_LIMITS.link.comment) },
    defaults: { filedBy: null, done: false, doneAt: null, comment: '' },
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
  block: {
    app: 'notes',
    fields: {
      parentId: nullableId,
      position,
      kind: oneOf(BLOCK_KINDS),
      text: str(TEXT_LIMITS.block.text),
      caption: str(TEXT_LIMITS.block.caption),
      drawing: str(TEXT_LIMITS.block.drawing),
      checked: bool,
      language: str(30),
      icon: nullableStr(32),
      color: styleKey,
      columns: tableColumns,
      cells: tableCells,
      fileId: nullableId,
      fileName: str(255),
      mime: str(127),
      bytes: int(0, 1024 * 1024 * 1024),
      width: int(0, 100_000),
      height: int(0, 100_000),
      uploaded: bool,
      url: nullableStr(4000),
      targetType: refType,
      targetId: nullableId,
      view: styleKey,
      viewColumns,
      showDone: bool,
      ratio,
      private: bool,
      trashedAt: nullableTime,
      createdAt: time,
      deletedAt: nullableTime,
    },
    merged: { text: typed(TEXT_LIMITS.block.text), caption: typed(TEXT_LIMITS.block.caption), drawing: strokes(TEXT_LIMITS.block.drawing) },
    defaults: BLOCK_FIELD_DEFAULTS,
  },
});

export type RecordType = keyof typeof NOTES_RECORD_TYPES;

export const RECORD_TYPES = Object.keys(NOTES_RECORD_TYPES) as readonly RecordType[];

/** One of Carnet's own types: a store may also hold another app's records, read for their mentions. */
export function isNotesType(value: string): value is RecordType {
  return Object.hasOwn(NOTES_RECORD_TYPES, value);
}
