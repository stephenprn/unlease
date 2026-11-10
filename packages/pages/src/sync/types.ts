/**
 * Pages' record type, declared to the suite's sync (`@unlease/core/sync/schema`) when this module
 * loads: every program that reads pages imports it through `sync/entities`. A page and every block in
 * it is one `block` record (`models/blocks`). Adding a field is safe; renaming or removing one is a
 * migration on every device.
 */
import { REF_TYPE_PATTERN } from '@unlease/core/refs';
import {
  bool,
  defineRecordTypes,
  id,
  int,
  isObject,
  nullableId,
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
import { DRAWING_LIMITS } from '@unlease/notes/models/drawing';
import { mergeStrokes } from '@unlease/notes/services/drawing';
import { BLOCK_FIELD_DEFAULTS, BLOCK_KINDS, TABLE_LIMITS, VIEW_LIMITS } from '../models/blocks';

/** The longest text each typed field may hold. */
export const PAGES_TEXT_LIMITS = {
  block: { text: 100_000, caption: 2000, drawing: DRAWING_LIMITS.chars },
} as const;

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

export const PAGES_RECORD_TYPES = defineRecordTypes({
  block: {
    app: 'pages',
    fields: {
      parentId: nullableId,
      position,
      kind: oneOf(BLOCK_KINDS),
      text: str(PAGES_TEXT_LIMITS.block.text),
      caption: str(PAGES_TEXT_LIMITS.block.caption),
      drawing: str(PAGES_TEXT_LIMITS.block.drawing),
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
      calendarLabelId: nullableId,
      calendarDays: int(1, 92),
      ratio,
      private: bool,
      trashedAt: nullableTime,
      createdAt: time,
      deletedAt: nullableTime,
    },
    merged: { text: typed(PAGES_TEXT_LIMITS.block.text), caption: typed(PAGES_TEXT_LIMITS.block.caption), drawing: strokes(PAGES_TEXT_LIMITS.block.drawing) },
    defaults: BLOCK_FIELD_DEFAULTS,
  },
});

export type PagesRecordType = keyof typeof PAGES_RECORD_TYPES;

export const PAGES_TYPES = Object.keys(PAGES_RECORD_TYPES) as readonly PagesRecordType[];

/** One of Pages' own types. */
export function isPagesType(value: string): value is PagesRecordType {
  return Object.hasOwn(PAGES_RECORD_TYPES, value);
}
