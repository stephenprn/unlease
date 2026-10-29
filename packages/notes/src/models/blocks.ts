/**
 * Pages and what they hold (the web's knowledge base). As in Notion, a page is a block: every page
 * and every block in it is one `block` record whose `parentId` is its container, so a sub-page sits
 * in its parent's content and moving anything is one write. Kind-specific fields are written only
 * when a block uses them; reading fills in defaults.
 */
import { localized, tx } from '@unlease/core/i18n';
import type { Ref, RefType } from '@unlease/core/refs';
import type { LineColor } from '@unlease/design/colors';

export const BLOCK_KINDS = [
  'page',
  'text',
  'h1',
  'h2',
  'h3',
  'h4',
  'bullet',
  'numbered',
  'todo',
  'toggle',
  'callout',
  'code',
  'table',
  'row',
  'image',
  'video',
  'pdf',
  'file',
  'bookmark',
  'embed',
  'columns',
  'column',
  'toc',
  'drawing',
] as const;

export type BlockKind = (typeof BLOCK_KINDS)[number];

/** Kinds whose `text` is rich text (marks and mentions, `core/services/richText`). */
export const RICH_KINDS: ReadonlySet<BlockKind> = new Set(['text', 'h1', 'h2', 'h3', 'h4', 'bullet', 'numbered', 'todo', 'toggle', 'callout']);

/** Kinds with blocks under them: a page's content, a column's, or nested under an item. */
export const NESTING_KINDS: ReadonlySet<BlockKind> = new Set(['page', 'text', 'bullet', 'numbered', 'todo', 'toggle', 'callout', 'column']);

export const MEDIA_KINDS = ['image', 'video', 'pdf', 'file'] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

export function isMediaKind(kind: BlockKind): kind is MediaKind {
  return (MEDIA_KINDS as readonly string[]).includes(kind);
}

/** Kinds that take a caption under them, once one is written. */
export const CAPTION_KINDS: ReadonlySet<BlockKind> = new Set(['code', 'table', 'image', 'video', 'pdf', 'file', 'bookmark', 'embed', 'drawing']);

/** The headings a page's table of contents lists (`toc`). */
export const HEADING_KINDS: ReadonlySet<BlockKind> = new Set(['h1', 'h2', 'h3', 'h4']);

/**
 * What a bookmark, an embed or a mention points at: anything of the suite (`@unlease/core/refs`),
 * a type a newer client added included. A collection is a note of kind `links`.
 */
export type BlockTarget = Ref;

/** The types this build shows. */
export type TargetType = RefType;

/** A table column's type. Stored as a key: an unknown one (from a newer client) shows as text. */
export const COLUMN_TYPES = ['text', 'number', 'checkbox', 'url', 'email', 'phone', 'date', 'select', 'multi'] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

export const COLUMN_TYPE_NAMES: Record<ColumnType, string> = localized({
  text: tx('Texte'),
  number: tx('Nombre'),
  checkbox: tx('Case à cocher'),
  url: tx('Lien'),
  email: tx('E-mail'),
  phone: tx('Téléphone'),
  date: tx('Date'),
  select: tx('Sélection'),
  multi: tx('Sélection multiple'),
});

export function isColumnType(value: unknown): value is ColumnType {
  return typeof value === 'string' && (COLUMN_TYPES as readonly string[]).includes(value);
}

export interface SelectOption {
  readonly id: string;
  readonly name: string;
  readonly color: LineColor;
}

export interface TableColumn {
  readonly id: string;
  readonly name: string;
  /** A `ColumnType`, or a newer client's key shown as text. */
  readonly type: string;
  /** A number column's unit, written after the value (« 12 € », « 3 kg »). */
  readonly unit?: string;
  /** A select's choices, in order. */
  readonly options?: readonly SelectOption[];
  /** In px; the table's default when absent. */
  readonly width?: number;
}

/** A cell: text, a number, a box, an ISO day (`2026-10-21`), an option id, or option ids. */
export type CellValue = string | number | boolean | null | readonly string[];

/** How an embedded collection shows its links. Stored as a key: an unknown one shows as a list. */
export const COLLECTION_VIEWS = ['list', 'table'] as const;

export type CollectionView = (typeof COLLECTION_VIEWS)[number];

/** A column of a collection shown as a table (`notes/services/collectionTable`): its place is its index. */
export interface ViewColumn {
  readonly key: string;
  readonly shown: boolean;
}

export const VIEW_LIMITS = { columns: 100, key: 80 } as const;

export interface Block {
  readonly id: string;
  /** The container: a page, a column, an item it is nested under, a table (rows). Null: a top-level page. */
  readonly parentId: string | null;
  /** Fractional index among its siblings. */
  readonly position: string;
  readonly kind: BlockKind;
  /** Rich text for text kinds, a page's title, a code block's source. */
  readonly text: string;
  /** One line of plain text under a code block, a table, a media, a bookmark or an embed (`CAPTION_KINDS`). */
  readonly caption: string;
  /** A drawing block's strokes (`notes/services/drawing`). */
  readonly drawing: string;
  readonly checked: boolean;
  /** A code block's language key (`notes/services/code`). */
  readonly language: string;
  /** A page's or a callout's emoji. */
  readonly icon: string | null;
  /** A callout's wash. */
  readonly color: LineColor | null;
  readonly columns: readonly TableColumn[];
  readonly cells: Readonly<Record<string, CellValue>>;
  /** The blob holding an uploaded image, video, PDF or file. */
  readonly fileId: string | null;
  readonly fileName: string;
  readonly mime: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  /** True once the server holds the file; other devices show it only then. */
  readonly uploaded: boolean;
  /** An image, video, PDF or file shown from its address instead of an upload. */
  readonly url: string | null;
  /** A bookmark's or an embed's subject. */
  readonly target: BlockTarget | null;
  /** An embedded collection's look. */
  readonly view: CollectionView;
  /** An embedded collection's table columns, in order, as the person arranged them. */
  readonly viewColumns: readonly ViewColumn[];
  /** An embedded collection also shows its links done, under « Déjà faits ». */
  readonly showDone: boolean;
  /** A column's share of its row's width (1 each by default). */
  readonly ratio: number;
  /** A page kept away from Claude: neither it nor its sub-pages are ever sent with a question. */
  readonly private: boolean;
  /** A page in the bin (everything under it goes with it). */
  readonly trashedAt: number | null;
  readonly createdAt: number;
  readonly deletedAt: number | null;
  /** The newest field clock's time. */
  readonly editedAt: number;
}

export const UNTITLED_PAGE = tx('Sans titre');

/** The longest a column, an option or a table may grow (the schema refuses more). */
export const TABLE_LIMITS = { columns: 30, options: 100, name: 200, unit: 20, cellText: 10_000 } as const;

export function canNest(kind: BlockKind): boolean {
  return NESTING_KINDS.has(kind);
}

/** What a block reads for a field it never wrote (`blockFromRecord`): an undo writes these back. */
export const BLOCK_FIELD_DEFAULTS: Readonly<Record<string, unknown>> = {
  parentId: null,
  text: '',
  caption: '',
  drawing: '',
  checked: false,
  language: '',
  icon: null,
  color: null,
  columns: [],
  cells: {},
  fileId: null,
  fileName: '',
  mime: '',
  bytes: 0,
  width: 0,
  height: 0,
  uploaded: false,
  url: null,
  targetType: null,
  targetId: null,
  view: null,
  viewColumns: [],
  showDone: false,
  ratio: 1,
  private: false,
  trashedAt: null,
  deletedAt: null,
};
