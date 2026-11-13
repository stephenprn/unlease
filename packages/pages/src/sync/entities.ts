/**
 * Pages' blocks to and from sync records. A record may be partial (a field added later, a block seen
 * before its page): reading fills in defaults and never throws.
 */
import { isLineColor } from '@unlease/design/colors';
import { isDrawingBackground } from '@unlease/notes/models/drawing';
import { REF_TYPE_PATTERN } from '@unlease/core/refs';
import { editedAt, type Fields, type SyncRecord } from '@unlease/core/sync/record';
import { BLOCK_KINDS, type Block, type BlockKind, type BlockTarget, type CellValue, type SelectOption, type TableColumn, type ViewColumn } from '../models/blocks';
// Declares Pages' record type to the sync before any record is read.
import './types';

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const asBool = (value: unknown): boolean => value === true;
const asTime = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const asNullableTime = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function asColumns(value: unknown): TableColumn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): TableColumn[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.type !== 'string') return [];
    const options = Array.isArray(raw.options)
      ? raw.options.flatMap((option): SelectOption[] => {
          const o = option as Record<string, unknown> | null;
          return o && typeof o.id === 'string' && typeof o.name === 'string' ? [{ id: o.id, name: o.name, color: isLineColor(o.color) ? o.color : 'grey' }] : [];
        })
      : undefined;
    return [
      {
        id: raw.id,
        name: raw.name,
        type: raw.type,
        ...(typeof raw.unit === 'string' && raw.unit ? { unit: raw.unit } : {}),
        ...(options ? { options } : {}),
        ...(typeof raw.width === 'number' && Number.isFinite(raw.width) ? { width: raw.width } : {}),
      },
    ];
  });
}

function asCells(value: unknown): Record<string, CellValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: Record<string, CellValue> = {};
  for (const [key, cell] of Object.entries(value as Record<string, unknown>)) {
    if (cell === null || typeof cell === 'string' || typeof cell === 'boolean' || (typeof cell === 'number' && Number.isFinite(cell))) out[key] = cell;
    else if (Array.isArray(cell)) out[key] = cell.filter((entry): entry is string => typeof entry === 'string');
  }
  return out;
}

function asViewColumns(value: unknown): ViewColumn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ViewColumn[] => {
    const raw = entry as Record<string, unknown> | null;
    return raw && typeof raw.key === 'string' && raw.key ? [{ key: raw.key, shown: raw.shown === true }] : [];
  });
}

/** Any well-formed type, one a newer client added included: it is kept, and shows as unavailable. */
function asTarget(type: unknown, id: unknown): BlockTarget | null {
  return typeof type === 'string' && REF_TYPE_PATTERN.test(type) && typeof id === 'string' && id ? { type, id } : null;
}

export function blockFromRecord(record: SyncRecord): Block {
  const f = record.fields;
  const kind: BlockKind = (BLOCK_KINDS as readonly unknown[]).includes(f.kind) ? (f.kind as BlockKind) : 'text';
  return {
    id: record.id,
    parentId: typeof f.parentId === 'string' && f.parentId ? f.parentId : null,
    position: asString(f.position, 'a0'),
    kind,
    text: asString(f.text),
    caption: asString(f.caption),
    drawing: asString(f.drawing),
    checked: asBool(f.checked),
    language: asString(f.language),
    icon: typeof f.icon === 'string' && f.icon ? f.icon : null,
    // A pigment for any block; a drawing's plain paper only on a drawing (a callout wears pigments).
    color: isLineColor(f.color) || (kind === 'drawing' && isDrawingBackground(f.color)) ? f.color : null,
    columns: asColumns(f.columns),
    cells: asCells(f.cells),
    fileId: typeof f.fileId === 'string' && f.fileId ? f.fileId : null,
    fileName: asString(f.fileName),
    mime: asString(f.mime),
    bytes: typeof f.bytes === 'number' ? f.bytes : 0,
    width: typeof f.width === 'number' ? f.width : 0,
    height: typeof f.height === 'number' ? f.height : 0,
    uploaded: asBool(f.uploaded),
    url: typeof f.url === 'string' && f.url ? f.url : null,
    target: asTarget(f.targetType, f.targetId),
    view: f.view === 'table' ? 'table' : 'list',
    viewColumns: asViewColumns(f.viewColumns),
    showDone: asBool(f.showDone),
    calendarLabelId: typeof f.calendarLabelId === 'string' && f.calendarLabelId ? f.calendarLabelId : null,
    calendarDays: typeof f.calendarDays === 'number' && Number.isInteger(f.calendarDays) && f.calendarDays >= 1 ? f.calendarDays : 14,
    immichAlbumId: typeof f.immichAlbumId === 'string' && f.immichAlbumId ? f.immichAlbumId : null,
    immichAssetIds: Array.isArray(f.immichAssetIds) ? f.immichAssetIds.filter((entry): entry is string => typeof entry === 'string' && entry !== '') : [],
    ratio: typeof f.ratio === 'number' && Number.isFinite(f.ratio) && f.ratio > 0 ? f.ratio : 1,
    private: asBool(f.private),
    trashedAt: asNullableTime(f.trashedAt),
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
    editedAt: editedAt(record),
    movedAt: record.clocks.parentId ?? '',
  };
}

/** What a new block writes: its place, kind and text always, and only the other fields it uses. */
export type NewBlockFields = Pick<Block, 'parentId' | 'position' | 'kind' | 'createdAt'> &
  Partial<Omit<Block, 'id' | 'parentId' | 'position' | 'kind' | 'createdAt' | 'editedAt' | 'target'>> & { readonly target?: BlockTarget | null };

export function blockFields(block: NewBlockFields): Fields {
  const { target, ...rest } = block;
  const fields: Fields = { text: '', deletedAt: null };
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    fields[key] = key === 'columns' || key === 'cells' || key === 'viewColumns' || key === 'immichAssetIds' ? JSON.parse(JSON.stringify(value)) : value;
  }
  if (target !== undefined) {
    fields.targetType = target?.type ?? null;
    fields.targetId = target?.id ?? null;
  }
  return fields;
}
