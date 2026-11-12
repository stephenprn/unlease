/**
 * Pages brought in from elsewhere (Réglages › Données › Importer, and the first run's step):
 * Notion's « Markdown & CSV » export (a .zip of pages, sub-pages in folders, pictures and files
 * beside them, databases as CSV) or plain Markdown (an Obsidian vault, a folder of notes, a few `.md`
 * files), as nested pages. The clients unzip and read the files (`ExportFile`: nothing leaves the
 * device); this reads them as pages (`readExport`), plans them against the pages already here and
 * the person's choices (`planImport`), lists them for the preview (`previewEntries`) and makes the
 * records (`importChanges`), the files the pages show attached after, one by one.
 *
 * - A page is a Markdown file, titled by its first heading (Notion's) or its name (a note's); its
 *   sub-pages are in the folder of its name beside it (Notion's `Voyage 1a2b….md` and `Voyage
 *   1a2b…/`, the 32-hex id cut from titles); a folder with no file of its name is a page of its name
 *   holding what is in it (an Obsidian vault's folders; its folder note `X/X.md` is its content).
 *   An emoji leading a title is the page's icon.
 * - A sub-page sits where its parent links to it on a line of its own (Notion's way), else after
 *   its content, by title.
 * - A database's CSV (Notion's `_all` one when both are there) is a table, its columns typed from
 *   their cells (numbers, boxes, dates, links, e-mails, choices). Its rows that hold more than their
 *   properties are pages too: then the database is a page of its name, the table first, those rows
 *   under it; else the table alone, in its parent where the parent links to it, its name under it.
 * - A link to a page of the export becomes a mention of it (its other words kept before it); a
 *   picture or a file of the export is attached to its block; a picture from the web shows from its
 *   address.
 * - Left out, and said why: files no page uses, HTML (Notion's other export), notes with no words,
 *   pictures absent from the export (their place stays: an empty picture under its name), files too
 *   large for the server.
 *
 * Imported again, a page whose title is already at the same place is kept as it is (« Déjà là »),
 * and only its new sub-pages are added under it: the same export twice adds nothing, an export made
 * later adds what was written since.
 */
import { getLocale, t, tx } from '@unlease/core/i18n';
import { monthNames, plural } from '@unlease/core/services/format';
import { placeAt, positionsBetween, type Placed } from '@unlease/core/services/fractionalIndex';
import { createId } from '@unlease/core/services/ids';
import type { PreviewEntry } from '@unlease/core/services/importFlow';
import { concatRich, parseRich, richFromPlain, serializeRich, setFlag, type Run } from '@unlease/core/services/richText';
import { foldText } from '@unlease/core/services/search';
import { typedEmoji } from '@unlease/design/emojiSearch';
import type { GlyphName } from '@unlease/design/glyphs';
import { canNest, RICH_KINDS, TABLE_LIMITS, type BlockKind, type CellValue, type ColumnType, type MediaKind, type TableColumn } from '../models/blocks';
import { blockFields, type NewBlockFields } from '../sync/entities';
import { PAGES_TEXT_LIMITS } from '../sync/types';
import { ROOT, isInBin, parentKey, subPages, type BlockMap, type ChildIndex } from './blocks';
import { fileNameFromUrl, isUploadableImage, MAX_FILE_BYTES, MAX_IMAGE_BYTES, mediaKindFor, mimeFromName } from './media';
import { blocksFromMarkdown, tableDraft, type BlockDraft, type MarkdownReading } from './pageText';
import { convertCell, isEmail, isWebAddress, optionsFor, parseDay, parseNumber } from './table';

// ── what the clients hand over ──────────────────────────────────────────────

/** One file of the export, as a client read it. */
export interface ExportFile {
  /** Its path in the export, `/` between folders (`Voyage 1a2b…/Lisbonne 3c4d….md`). */
  readonly path: string;
  /** Its words, for a Markdown, text or CSV file; absent for anything else, or when they could not be read. */
  readonly text?: string;
  /** Its size. */
  readonly bytes: number;
}

/** Notion's export (its pages carry their 32-hex ids), or Markdown from anywhere else. */
export type ExportKind = 'notion' | 'markdown';

/** The files a client reads as words: the rest it keeps as bytes, for the pages to show. */
export function isExportText(path: string): boolean {
  return PAGE_EXTENSIONS.has(extensionOf(path)) || extensionOf(path) === 'csv';
}

/** What a client takes from a folder or an archive: hidden files (`.obsidian/`, `.DS_Store`) and the system's leftovers are no one's pages. */
export function isExportJunk(path: string): boolean {
  return /(^|\/)(__MACOSX|\.[^/]*)(\/|$)|(^|\/)(Thumbs\.db|desktop\.ini)$/i.test(path);
}

/** An archive inside the archive (Notion cuts a large export into `Export-…-Part-1.zip` inside the one downloaded): the client opens it too. */
export function isExportArchive(path: string): boolean {
  return extensionOf(path) === 'zip';
}

// ── reading ─────────────────────────────────────────────────────────────────

/** A file of the export a page shows, attached once the pages are written. */
export interface ExportAsset {
  readonly path: string;
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
  readonly kind: MediaKind;
}

/** What a page holds of its own (its sub-pages aside). */
export interface PageCounts {
  readonly blocks: number;
  readonly pictures: number;
  readonly files: number;
  readonly tables: number;
  /** Pictures and files it shows that the export lacks (or too large): their place stays empty. */
  readonly missing: number;
  /** Links to pages the export lacks: kept as their words. */
  readonly broken: number;
}

/** A page read from the export. */
export interface ReadPage {
  /** Unique: its file's path (a folder's ends with `/`). */
  readonly key: string;
  /** The id it is written with (an existing page's instead when it is there already: `PlannedPage`). */
  readonly id: string;
  readonly title: string;
  readonly icon: string | null;
  readonly parent: string | null;
  /** Its sub-pages, in the order they sit in it. */
  readonly children: readonly string[];
  /**
   * Its blocks: a sub-page where it sits (`{ kind: 'page', extra: { importPage: key } }`), a file to
   * attach (`extra.importFile`: its path among `assets`).
   */
  readonly drafts: readonly BlockDraft[];
  readonly counts: PageCounts;
  /** A Notion database: its table's rows. */
  readonly rows: number | null;
}

/** A file left out, and why. */
export interface LeftOut {
  readonly key: string;
  readonly title: string;
  /** Where it was, or what it is (« Dans Voyage », « 2,4 Mo »). */
  readonly detail: string;
  readonly why: string;
  readonly glyph: GlyphName;
}

/** An export read: its pages as a tree, the files they show, what was left out. */
export interface ExportRead {
  readonly kind: ExportKind;
  /** The one folder everything sat in, if any (an Obsidian vault's name). */
  readonly root: string | null;
  readonly pages: Readonly<Record<string, ReadPage>>;
  /** The pages at its top, in order. */
  readonly top: readonly string[];
  readonly assets: Readonly<Record<string, ExportAsset>>;
  readonly leftOut: readonly LeftOut[];
}

const PAGE_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd', 'txt']);
const NOTION_ID = /\s+([0-9a-f]{32})$/i;
const NOTION_URL_ID = /^https?:\/\/(?:[\w-]+\.)?notion\.(?:so|site)\/.*?([0-9a-f]{32})(?:[?#]|$)/i;

function extensionOf(path: string): string {
  return /\.([^./]+)$/.exec(path)?.[1]?.toLowerCase() ?? '';
}

const baseOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const dirOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const stemOf = (name: string): string => (/\.[^./]+$/.test(name) ? name.replace(/\.[^./]+$/, '') : name);
const join = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name);

/** A path read against a folder: `.` and `..` resolved; null when it climbs out of the export. */
function resolvePath(dir: string, path: string): string | null {
  const out = path.startsWith('/') ? [] : dir.split('/').filter(Boolean);
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}

function decoded(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

/** A file's or a folder's name as a title: its extension (a file's) and Notion's id cut. */
function titleOfName(name: string, folder = false): { readonly title: string; readonly notionId: string | null } {
  const stem = folder ? name : stemOf(name).replace(/_all$/, '');
  const id = NOTION_ID.exec(stem);
  const title = (id ? stem.slice(0, id.index) : stem).trim();
  return { title: title || stem.trim(), notionId: id?.[1]?.toLowerCase() ?? null };
}

/** An emoji leading a title is the page's icon (« 🌍 Voyage »). */
function iconAndTitle(shown: string): { readonly icon: string | null; readonly title: string } {
  const emoji = typedEmoji(shown.slice(0, 16));
  if (emoji && shown.startsWith(emoji)) {
    const rest = shown.slice(emoji.length).trim();
    if (rest) return { icon: emoji, title: rest };
  }
  return { icon: null, title: shown };
}

/** A page's file cut in its parts: its title (its first heading, when it is one), a database row's properties, its body. */
interface Split {
  readonly heading: string | null;
  readonly properties: readonly (readonly [string, string])[];
  readonly body: string;
}

function splitPage(text: string, kind: ExportKind, nameTitle: string, columns: ReadonlySet<string> | null): Split {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  let at = 0;
  while (at < lines.length && !lines[at]!.trim()) at += 1;
  let heading: string | null = null;
  const first = /^#\s+(.+?)\s*#*\s*$/.exec(lines[at] ?? '');
  // Notion's first heading is the page's title (its file's name may be cut); a note's title is its name, a heading repeating it goes.
  if (first && (kind === 'notion' || foldText(first[1]!) === foldText(nameTitle))) {
    heading = kind === 'notion' ? first[1]! : null;
    at += 1;
  }
  const properties: [string, string][] = [];
  if (columns) {
    let next = at;
    while (next < lines.length && !lines[next]!.trim()) next += 1;
    for (; next < lines.length; next += 1) {
      const property = /^([^:\n]{1,100}):\s?(.*)$/.exec(lines[next]!);
      if (!property || !columns.has(foldText(property[1]!.trim()))) break;
      properties.push([property[1]!.trim(), property[2]!.trim()]);
    }
    if (properties.length > 0) at = next;
  }
  return { heading, properties, body: lines.slice(at).join('\n') };
}

// ── CSV ─────────────────────────────────────────────────────────────────────

/** A CSV's rows (RFC 4180: quoted fields, doubled quotes, line breaks inside quotes), its separator found from its first line (`,`, `;` or a tab). */
export function parseCsv(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, '');
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const outside = firstLine.replace(/"[^"]*"/g, '');
  const counts = [',', ';', '\t'].map(mark => ({ mark, count: outside.split(mark).length - 1 }));
  const separator = counts.reduce((best, each) => (each.count > best.count ? each : best)).mark;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at]!;
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') {
        field += '"';
        at += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === separator) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[at + 1] === '\n') at += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(each => each.some(cell => cell.trim() !== ''));
}

const MONTHS: Readonly<Record<string, number>> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

/** A day as Notion writes it (« November 12, 2026 », « 12 novembre 2026 », a time or a range after it) or as a person types it; null when it is none. */
export function exportDay(text: string): string | null {
  const value = text.split(/\s+→\s+/)[0]!.trim();
  const english = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(?:\s+\d{1,2}:\d{2}(?:\s*[AP]M)?)?(?:\s*\([^)]*\))?$/i.exec(value);
  const french = /^(\d{1,2})(?:er)?\s+([\p{L}]+)\.?\s+(\d{4})(?:\s+\d{1,2}[:h]\d{2})?$/iu.exec(value);
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2}.*)?$/.exec(value);
  const day = (year: string, month: number | undefined, date: string): string | null => (month ? parseDay(`${year}-${month}-${date}`) : null);
  if (english) return day(english[3]!, MONTHS[foldText(english[1]!)], english[2]!);
  if (french) return day(french[3]!, MONTHS[foldText(french[2]!)], french[1]!);
  if (iso) return parseDay(iso[1]!);
  return parseDay(value);
}

const YES_NO = new Set(['yes', 'no', 'oui', 'non', 'true', 'false', 'vrai', 'faux', '✓', '✔', '']);

/**
 * What a column of text holds, guessed from all its cells (its first, the title, stays text): a box
 * (Yes/No), a number, a date, a link, an e-mail, one choice among a few repeated ones, or several
 * (« a, b »); else text.
 */
function columnTypeOf(values: readonly string[]): ColumnType {
  const filled = values.map(value => value.trim()).filter(Boolean);
  if (filled.length === 0) return 'text';
  if (values.every(value => YES_NO.has(value.trim().toLowerCase())) && filled.length > 0) return 'checkbox';
  if (filled.every(value => /^[+\-−]?[\d\s\u00a0.,]*\d[\d\s\u00a0.,]*\s*[%€$£]?$/.test(value) && parseNumber(value) !== null)) return 'number';
  if (filled.every(value => exportDay(value) !== null)) return 'date';
  if (filled.every(value => /^https?:\/\//i.test(value) && isWebAddress(value))) return 'url';
  if (filled.every(isEmail)) return 'email';
  const short = filled.every(value => value.length <= 60);
  if (!short || values.length < 4) return 'text';
  const pieces = filled.flatMap(value => value.split(/\s*,\s*/)).filter(Boolean);
  const distinct = new Set(pieces.map(piece => piece.toLowerCase())).size;
  if (filled.some(value => value.includes(',')) && distinct <= Math.min(30, pieces.length / 2) && pieces.every(piece => piece.length <= 40)) return 'multi';
  const whole = new Set(filled.map(value => value.toLowerCase())).size;
  if (whole <= Math.min(12, filled.length / 2)) return 'select';
  return 'text';
}

/** A database's rows as a table, its columns typed (`columnTypeOf`). */
function databaseTable(rows: readonly (readonly string[])[], mint: () => string): { readonly draft: BlockDraft; readonly cut: number } | null {
  const draft = tableDraft(rows);
  if (!draft) return null;
  const width = rows.reduce((most, row) => Math.max(most, row.length), 0);
  const columns = (draft.extra?.columns ?? []) as TableColumn[];
  const body = draft.children ?? [];
  const typed = columns.map((column, index): TableColumn => {
    if (index === 0) return column;
    const values = body.map(row => String(((row.extra?.cells ?? {}) as Record<string, CellValue>)[column.id] ?? ''));
    const type = columnTypeOf(values);
    if (type === 'text') return column;
    const named: TableColumn = { ...column, type };
    if (type !== 'select' && type !== 'multi') return named;
    const names = [...new Set(values.flatMap(value => (type === 'multi' ? value.split(/\s*,\s*/) : [value])).map(value => value.trim()).filter(Boolean))];
    return { ...named, options: optionsFor(names.slice(0, TABLE_LIMITS.options), [], mint) };
  });
  const children = body.map(row => {
    const cells = (row.extra?.cells ?? {}) as Record<string, CellValue>;
    const converted: Record<string, CellValue> = {};
    typed.forEach((column, index) => {
      const value = cells[column.id] ?? '';
      const text = typeof value === 'string' ? value : String(value);
      converted[column.id] = column.type === 'date' ? (exportDay(text) ?? '') : convertCell(value, columns[index]!, column);
    });
    return { ...row, extra: { cells: converted } };
  });
  return { draft: { ...draft, extra: { columns: typed }, children }, cut: Math.max(0, width - columns.length) };
}

// ── the tree ────────────────────────────────────────────────────────────────

interface Node {
  readonly key: string;
  readonly id: string;
  readonly kind: 'page' | 'folder' | 'database';
  /** The page's Markdown (a folder's note), or the database's CSV. */
  readonly file: string | null;
  /** The folder its sub-pages are in. */
  readonly folder: string;
  readonly nameTitle: string;
  readonly notionId: string | null;
  title: string;
  icon: string | null;
  parent: Node | null;
  children: Node[];
  split: Split | null;
  /** A database shown as its table alone, in its parent (no row of it is a page). */
  tableOnly: boolean;
  rows: string[][] | null;
  drafts: BlockDraft[];
  readonly placed: Set<string>;
  missing: number;
  broken: number;
  cut: number;
}

interface ReadOptions {
  /** Ids for the pages and the tables' options (tests make them predictable). */
  readonly mint?: () => string;
}

/**
 * The export's files as pages (`ExportRead`): their tree, their blocks, the files they show, and
 * what is left out with why. Nothing here reads a disk: the client hands the files' words over.
 */
export function readExport(given: readonly ExportFile[], { mint = () => createId() }: ReadOptions = {}): ExportRead {
  const leftOut: LeftOut[] = [];
  const where = (path: string): string => {
    const dir = dirOf(path);
    return dir ? t('Dans {path}', { path: dir.split('/').map(part => titleOfName(part, true).title).join(' › ') }) : '';
  };
  const leave = (path: string, why: string, glyph: GlyphName = 'file'): void => {
    leftOut.push({ key: `skip:${path}`, title: baseOf(path), detail: where(path), why, glyph });
  };

  // Paths as written, without a folder everything sits in (the archive's own, an Obsidian vault's).
  let files = given
    .map(file => ({ ...file, path: file.path.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '') }))
    .filter(file => file.path && !file.path.endsWith('/') && !isExportJunk(file.path));
  let root: string | null = null;
  for (;;) {
    const first = files[0]?.path.split('/')[0];
    if (!first || !files.every(file => file.path.startsWith(`${first}/`))) break;
    root = first;
    files = files.map(file => ({ ...file, path: file.path.slice(first.length + 1) }));
  }
  const kind: ExportKind = files.some(file => NOTION_ID.test(stemOf(baseOf(file.path)).replace(/_all$/, '')) || file.path.split('/').some(part => NOTION_ID.test(part))) ? 'notion' : 'markdown';

  const pageFiles = files.filter(file => PAGE_EXTENSIONS.has(extensionOf(file.path)));
  const csvFiles = files.filter(file => extensionOf(file.path) === 'csv');
  const others = files.filter(file => !PAGE_EXTENSIONS.has(extensionOf(file.path)) && extensionOf(file.path) !== 'csv');

  const assets: Record<string, ExportAsset> = {};
  for (const file of others) {
    const mime = mimeFromName(file.path);
    assets[file.path] = { path: file.path, name: baseOf(file.path), mime, bytes: file.bytes, kind: mediaKindFor(mime) };
  }

  // Each database once, from its `_all` CSV (every property) when Notion wrote both.
  const databases = new Map<string, ExportFile>();
  for (const file of csvFiles) {
    const key = join(dirOf(file.path), `${stemOf(baseOf(file.path)).replace(/_all$/, '')}.csv`);
    const known = databases.get(key);
    if (!known || /_all\.csv$/i.test(file.path)) databases.set(key, file);
  }

  const nodes = new Map<string, Node>();
  const owners = new Map<string, Node>();
  const byFile = new Map<string, Node>();
  const make = (key: string, nodeKind: Node['kind'], file: string | null, folder: string, name: string): Node => {
    const { title, notionId } = titleOfName(name, nodeKind === 'folder');
    const node: Node = { key, id: mint(), kind: nodeKind, file, folder, nameTitle: title, notionId, title, icon: null, parent: null, children: [], split: null, tableOnly: false, rows: null, drafts: [], placed: new Set(), missing: 0, broken: 0, cut: 0 };
    nodes.set(key, node);
    if (file) byFile.set(file, node);
    return node;
  };

  // A folder note (`Voyage/Voyage.md`) is its folder's page, not a page inside it, unless a `Voyage.md` beside the folder is.
  const pagePaths = new Set(pageFiles.map(file => stemOf(file.path)));
  const folderNotes = new Map<string, string>();
  for (const file of pageFiles) {
    const dir = dirOf(file.path);
    if (dir && stemOf(baseOf(file.path)) === baseOf(dir) && !pagePaths.has(dir)) folderNotes.set(dir, file.path);
  }
  const isFolderNote = (path: string): boolean => folderNotes.get(dirOf(path)) === path;
  for (const file of pageFiles) {
    if (isFolderNote(file.path)) continue;
    const folder = join(dirOf(file.path), stemOf(baseOf(file.path)));
    const node = make(file.path, 'page', file.path, folder, baseOf(file.path));
    if (!owners.has(folder)) owners.set(folder, node);
  }
  for (const [key, file] of databases) {
    const folder = stemOf(key);
    const node = make(key, 'database', file.path, folder, baseOf(key));
    byFile.set(key, node);
    if (!owners.has(folder)) owners.set(folder, node);
  }
  // Every folder holding a page or a table somewhere under it, and owned by no page: a page of its name.
  const holding = new Set<string>();
  for (const file of [...pageFiles, ...csvFiles]) for (let dir = dirOf(file.path); dir; dir = dirOf(dir)) holding.add(dir);
  for (const dir of [...holding].sort()) {
    if (owners.has(dir)) continue;
    const node = make(`${dir}/`, 'folder', folderNotes.get(dir) ?? null, dir, baseOf(dir));
    owners.set(dir, node);
  }
  for (const node of nodes.values()) {
    const place = node.kind === 'folder' ? dirOf(node.folder) : dirOf(node.file!);
    const parent = place ? (owners.get(place) ?? null) : null;
    if (parent && parent !== node) {
      node.parent = parent;
      parent.children.push(node);
    }
  }

  const texts = new Map(files.map(file => [file.path, file]));

  // Titles, icons and databases first: links anywhere need every page's name and form.
  for (const node of nodes.values()) {
    if (node.kind !== 'database') continue;
    const text = texts.get(node.file!)?.text;
    node.rows = text === undefined ? null : parseCsv(text);
  }
  for (const node of nodes.values()) {
    if (node.kind === 'database' || !node.file) continue;
    const text = texts.get(node.file)?.text;
    if (text === undefined) continue;
    const columns = node.parent?.kind === 'database' && node.parent.rows ? new Set((node.parent.rows[0] ?? []).map(name => foldText(name.trim()))) : null;
    node.split = splitPage(text, kind, node.nameTitle, columns);
  }
  for (const node of nodes.values()) {
    const shown = node.split?.heading?.trim() || node.nameTitle;
    const { icon, title } = iconAndTitle(shown);
    node.icon = icon;
    node.title = title;
  }

  // What is read of a file: an unreadable or empty note, an empty table, is left out with why; one holding
  // sub-pages stays, as a page of its name holding them.
  const unreadable = new Set<Node>();
  for (const node of nodes.values()) {
    if (node.kind === 'folder' || !node.file) continue;
    const file = texts.get(node.file);
    if (file?.text === undefined) {
      unreadable.add(node);
      leave(node.file, node.kind === 'database' ? t('Tableau illisible : son texte n’a pas pu être lu.') : t('Illisible : son texte n’a pas pu être lu.'), node.kind === 'database' ? 'table' : 'page');
    } else if (node.kind === 'page' && !file.text.trim()) {
      if (node.children.length === 0) leave(node.file, t('Note vide : rien à importer.'), 'page');
      unreadable.add(node);
    } else if (node.kind === 'database' && (node.rows?.length ?? 0) === 0) {
      if (node.children.length === 0) leave(node.file, t('Tableau vide : rien à importer.'), 'table');
      unreadable.add(node);
    }
  }
  // A database row holding only its properties lives in its table: no page of its own.
  const rowOnly = (node: Node): boolean => node.parent?.kind === 'database' && node.children.length === 0 && !!node.split && !node.split.body.trim();
  for (const node of [...nodes.values()]) {
    if (!(unreadable.has(node) && node.children.length === 0) && !rowOnly(node)) continue;
    node.parent?.children.splice(node.parent.children.indexOf(node), 1);
    nodes.delete(node.key);
  }
  for (const node of nodes.values()) {
    if (node.kind !== 'database') continue;
    if (unreadable.has(node)) node.rows = [];
    node.tableOnly = node.parent !== null && node.children.length === 0 && (node.rows?.length ?? 0) > 0;
  }

  const byNotionId = new Map<string, Node>();
  const byName = new Map<string, Node[]>();
  for (const node of nodes.values()) {
    if (node.notionId) byNotionId.set(node.notionId, node);
    for (const name of new Set([foldText(node.nameTitle), foldText(node.title)])) byName.set(name, [...(byName.get(name) ?? []), node]);
  }
  const assetsByName = new Map<string, string[]>();
  for (const path of Object.keys(assets)) {
    const name = foldText(baseOf(path));
    assetsByName.set(name, [...(assetsByName.get(name) ?? []), path]);
  }
  const folded = new Map<string, string>();
  for (const path of [...byFile.keys(), ...Object.keys(assets)]) folded.set(path.toLowerCase(), path);

  type Target = { readonly node: Node } | { readonly asset: string };
  const found = (path: string): Target | null => {
    const exact = byFile.get(path) ?? byFile.get(folded.get(path.toLowerCase()) ?? '');
    if (exact && nodes.has(exact.key)) return { node: exact };
    const asset = assets[path] ? path : folded.get(path.toLowerCase());
    return asset && assets[asset] ? { asset } : null;
  };
  /** Where a link leads: a page or a table of the export, a file of it, or nowhere in it (null). */
  const resolve = (from: Node, href: string): Target | null => {
    const notion = NOTION_URL_ID.exec(href);
    if (notion) {
      const node = byNotionId.get(notion[1]!.toLowerCase());
      return node && nodes.has(node.key) ? { node } : null;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) return null;
    const path = decoded(href.split('#')[0]!.split('?')[0]!);
    if (!path) return null;
    const dir = from.kind === 'folder' ? (from.file ? dirOf(from.file) : from.folder) : dirOf(from.file ?? from.key);
    for (const candidate of [resolvePath(dir, path), resolvePath('', path)]) {
      if (candidate === null) continue;
      const target = found(candidate) ?? (extensionOf(candidate) ? null : (found(`${candidate}.md`) ?? found(`${candidate}.markdown`)));
      if (target) return target;
    }
    return null;
  };
  /** A wiki link's target (`[[Lisbonne]]`, `[[Voyage/Lisbonne]]`, `![[photo.jpg]]`): by its name, the one nearest first. */
  const named = (from: Node, name: string): Target | null => {
    const path = name.trim();
    if (path.includes('/')) {
      const target = resolve(from, path);
      if (target) return target;
    }
    const wanted = foldText(baseOf(path));
    const pages = (byName.get(wanted) ?? byName.get(foldText(stemOf(baseOf(path)))) ?? []).filter(node => nodes.has(node.key));
    if (pages.length > 0) return { node: pages.find(node => node.parent === from.parent) ?? pages[0]! };
    const files = assetsByName.get(wanted) ?? [];
    const near = files.find(file => dirOf(file) === from.folder || dirOf(file) === dirOf(from.file ?? '')) ?? files[0];
    return near ? { asset: near } : null;
  };

  const used = new Set<string>();
  const mentionOf = (node: Node, words: string): Run[] => {
    const mention: Run = { kind: 'mention', target: { type: 'page', id: node.id } };
    const label = words.trim();
    // The words are the page's name (Notion's links, a wiki link): the mention alone says it.
    if (!label || foldText(label) === foldText(node.title) || foldText(label) === foldText(node.nameTitle) || /\.(md|csv)$/i.test(label)) return [mention];
    return concatRich(richFromPlain(`${label} (`), [mention], richFromPlain(')'));
  };
  const isPage = (node: Node): boolean => !(node.kind === 'database' && node.tableOnly);

  const mediaDraft = (from: Node, asset: ExportAsset, label: string): BlockDraft => {
    const caption = label && foldText(label) !== foldText(asset.name) && foldText(label) !== foldText(stemOf(asset.name)) ? label.slice(0, PAGES_TEXT_LIMITS.block.caption) : '';
    const limit = isUploadableImage(asset.mime) ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
    used.add(asset.path);
    const fields = { fileName: asset.name.slice(0, 255), mime: asset.mime.slice(0, 127), bytes: asset.bytes, ...(caption ? { caption } : {}) };
    if (asset.bytes > limit) {
      from.missing += 1;
      leave(asset.path, isUploadableImage(asset.mime) ? t('Image de plus de 25 Mo : sa place reste vide dans « {page} ».', { page: from.title }) : t('Fichier de plus de 100 Mo : sa place reste vide dans « {page} ».', { page: from.title }), asset.kind === 'image' ? 'image' : 'file');
      return { kind: asset.kind, text: '', extra: fields };
    }
    if (asset.bytes === 0) {
      from.missing += 1;
      leave(asset.path, t('Fichier vide : sa place reste vide dans « {page} ».', { page: from.title }), asset.kind === 'image' ? 'image' : 'file');
      return { kind: asset.kind, text: '', extra: fields };
    }
    return { kind: asset.kind, text: '', extra: { ...fields, importFile: asset.path } };
  };
  const placeholder = (node: Node): BlockDraft => (isPage(node) ? { kind: 'page', text: node.title, extra: { importPage: node.key } } : tableOf(node));
  const tableOf = (node: Node): BlockDraft => {
    const table = node.rows && node.rows.length > 0 ? databaseTable(node.rows, mint) : null;
    if (!table) return { kind: 'text', text: '' };
    node.cut = table.cut;
    return node.tableOnly ? { ...table.draft, extra: { ...table.draft.extra, caption: node.title.slice(0, PAGES_TEXT_LIMITS.block.caption) } } : table.draft;
  };

  const readingOf = (node: Node): MarkdownReading => ({
    link: (words, href, wiki) => {
      const target = wiki ? named(node, href) : resolve(node, href);
      if (target && 'node' in target && isPage(target.node)) return mentionOf(target.node, words);
      if (!target && !wiki && !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('#') && /\.(md|markdown|csv)(?:[#?]|$)/i.test(href)) node.broken += 1;
      if (!target && wiki) node.broken += 1;
      return null;
    },
    alone: (words, href, picture) => {
      const target = resolve(node, href) ?? (picture ? named(node, href) : null);
      if (target && 'asset' in target) return mediaDraft(node, assets[target.asset]!, words);
      if (target && 'node' in target) {
        const child = target.node;
        if (child.parent !== node || node.placed.has(child.key)) return null;
        node.placed.add(child.key);
        return placeholder(child);
      }
      if (!picture) return null;
      if (/^https?:\/\//i.test(href)) {
        const name = fileNameFromUrl(href);
        const caption = words && foldText(words) !== foldText(name) ? words.slice(0, PAGES_TEXT_LIMITS.block.caption) : '';
        return href.length <= 4000 ? { kind: 'image', text: '', extra: { url: href, fileName: name.slice(0, 255), ...(caption ? { caption } : {}) } } : null;
      }
      // A picture the export lacks: its place stays, an empty picture under its name.
      const name = baseOf(decoded(href.split('#')[0]!.split('?')[0]!)) || words;
      node.missing += 1;
      leftOut.push({ key: `missing:${node.key}:${href}`, title: name, detail: t('Dans « {page} »', { page: node.title }), why: t('Absente de l’export : sa place reste vide dans la page.'), glyph: 'image' });
      return { kind: 'image', text: '', extra: { caption: (words || name).slice(0, PAGES_TEXT_LIMITS.block.caption) } };
    },
  });

  // Each page's blocks, its sub-pages where it links to them, the others after, by title.
  const order = (list: readonly Node[]): Node[] => [...list].sort((a, b) => a.title.localeCompare(b.title, 'fr', { numeric: true, sensitivity: 'base' }));
  for (const node of nodes.values()) {
    const drafts: BlockDraft[] = [];
    if (node.kind === 'database') {
      if (!node.tableOnly) {
        const table = tableOf(node);
        if (table.kind === 'table') drafts.push(table);
        // Its rows that are pages, in the table's order.
        const titles = (node.rows ?? []).slice(1).map(row => foldText((row[0] ?? '').trim()));
        const rank = (child: Node): number => {
          const at = titles.indexOf(foldText(child.title));
          return at < 0 ? titles.length : at;
        };
        for (const child of [...node.children].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, 'fr'))) {
          node.placed.add(child.key);
          drafts.push(placeholder(child));
        }
      }
    } else if (node.split) {
      // A database row's properties, as Notion shows them over its page (« Statut : Fait », "Status: Done": written once in this device's language).
      const colon = getLocale() === 'fr' ? ' :' : ':';
      for (const [name, value] of node.split.properties) {
        const key = setFlag(richFromPlain(`${name}${colon}`), 0, name.length + colon.length, 'b', true);
        drafts.push({ kind: 'text', text: serializeRich(concatRich(key, richFromPlain(` ${value}`))) });
      }
      drafts.push(...blocksFromMarkdown(node.split.body, readingOf(node)));
    }
    for (const child of order(node.children)) if (!node.placed.has(child.key)) drafts.push(placeholder(child));
    node.drafts = drafts;
  }

  for (const path of Object.keys(assets)) {
    if (used.has(path)) continue;
    const extension = extensionOf(path);
    const why =
      extension === 'html' || extension === 'htm'
        ? t('Page HTML : choisissez « Markdown & CSV » dans l’export de Notion.')
        : extension === 'zip'
          ? t('Archive dans l’archive : décompressez-la, puis importez son contenu.')
          : t('Aucune page ne s’en sert.');
    leave(path, why, assets[path]!.kind === 'image' ? 'image' : 'file');
  }

  const pages: Record<string, ReadPage> = {};
  const tree = (node: Node): void => {
    if (!isPage(node)) return;
    const children = pageKeysIn(node.drafts);
    pages[node.key] = {
      key: node.key,
      id: node.id,
      title: node.title,
      icon: node.icon,
      parent: node.parent ? node.parent.key : null,
      children,
      drafts: node.drafts,
      counts: { ...countDrafts(node.drafts), missing: node.missing, broken: node.broken },
      rows: node.kind === 'database' ? Math.max(0, (node.rows?.length ?? 1) - 1) : null,
    };
    for (const key of children) tree(nodes.get(key)!);
  };
  const top = order([...nodes.values()].filter(node => node.parent === null && isPage(node)));
  for (const node of top) tree(node);
  // A column cut for room is said once, on its database.
  for (const node of nodes.values()) {
    if (node.cut > 0) leftOut.push({ key: `columns:${node.key}`, title: node.title, detail: t('Tableau'), why: t('Plus de {count} colonnes : les {cut} dernières sont laissées de côté.', { count: TABLE_LIMITS.columns, cut: node.cut }), glyph: 'table' });
  }

  return { kind, root, pages, top: top.map(node => node.key), assets, leftOut };
}

/** The sub-pages a page's blocks hold, in reading order. */
function pageKeysIn(drafts: readonly BlockDraft[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly BlockDraft[]): void => {
    for (const draft of list) {
      if (draft.kind === 'page' && typeof draft.extra?.importPage === 'string') out.push(draft.extra.importPage);
      else if (draft.children) walk(draft.children);
    }
  };
  walk(drafts);
  return out;
}

function countDrafts(drafts: readonly BlockDraft[]): Pick<PageCounts, 'blocks' | 'pictures' | 'files' | 'tables'> {
  let blocks = 0;
  let pictures = 0;
  let files = 0;
  let tables = 0;
  const walk = (list: readonly BlockDraft[]): void => {
    for (const draft of list) {
      if (draft.kind === 'page') continue;
      if (draft.kind === 'row') continue;
      blocks += 1;
      if (draft.kind === 'table') tables += 1;
      else if (draft.kind === 'image' && (draft.extra?.importFile || draft.extra?.url)) pictures += 1;
      else if (draft.kind !== 'image' && draft.extra?.importFile) files += 1;
      if (draft.children) walk(draft.children);
    }
  };
  walk(drafts);
  return { blocks, pictures, files, tables };
}

// ── planning ────────────────────────────────────────────────────────────────

/** Where the pages go: under a new page of their own (the default), at the top of the tree, or in a page already here. */
export type ImportPlacement = 'new' | 'top' | 'inside';

export interface ImportChoices {
  readonly placement: ImportPlacement;
  /** The new page's title (`new`): « Import Notion du 12 novembre » (`importContainerTitle`). */
  readonly containerTitle: string;
  /** The page they go in (`inside`). */
  readonly insideId: string | null;
  /** Kept out of Claude's reach (`private`), each page brought. */
  readonly private: boolean;
  /** Pages the person left out (their keys): their sub-pages go with them. */
  readonly off: ReadonlySet<string>;
}

/** The pages here now, as both clients' stores hold them. */
export interface ImportLibrary {
  readonly blocks: BlockMap;
  readonly blocksByParent: ChildIndex;
}

export interface PlannedPage {
  readonly key: string;
  /** Its id once written: its own, or the page already here it is (`same`). */
  readonly id: string;
  readonly title: string;
  readonly icon: string | null;
  /** The export's pages above it, the top first. */
  readonly trail: readonly string[];
  readonly depth: number;
  /** New, or here already (same title, same place: kept as it is, its new sub-pages added). */
  readonly fate: 'new' | 'same';
  /** Left out by the person, itself (`off`) or a page above it (`offAbove`). */
  readonly off: boolean;
  readonly offAbove: boolean;
  readonly counts: PageCounts;
  readonly rows: number | null;
}

export interface ImportTotals {
  /** Pages written (the new page holding them aside). */
  readonly pages: number;
  readonly pictures: number;
  readonly files: number;
  readonly tables: number;
  readonly blocks: number;
  /** Pages here already, kept. */
  readonly same: number;
  /** Pages the person left out, those under them included. */
  readonly off: number;
}

export interface ImportPlan {
  readonly read: ExportRead;
  readonly choices: ImportChoices;
  /** Every page of the export in reading order, the tree's. */
  readonly pages: readonly PlannedPage[];
  /** The new page holding them (`new`): its id, made or found again (the same title at the top). */
  readonly container: { readonly id: string; readonly title: string; readonly fate: 'new' | 'same' } | null;
  /** The page they go in, or null for the top of the tree (the container's own place for `new`). */
  readonly destination: string | null;
  readonly totals: ImportTotals;
}

const WORDS_TITLES = {
  notion: tx('Import Notion du {date}'),
  markdown: tx('Import Markdown du {date}'),
} as const;

/** The new page's title: « Import Notion du 12 novembre », or the vault's own name for Markdown from one folder. Written once, in the device's language. */
export function importContainerTitle(read: Pick<ExportRead, 'kind' | 'root'>, now: number): string {
  if (read.kind === 'markdown' && read.root && !/^Export-/i.test(read.root)) return titleOfName(read.root, true).title;
  const day = new Date(now);
  return t(WORDS_TITLES[read.kind], { date: `${day.getDate()} ${monthNames()[day.getMonth()]}` });
}

const livePage = (blocks: BlockMap, id: string): boolean => {
  const block = blocks[id];
  return !!block && block.kind === 'page' && block.deletedAt === null && block.trashedAt === null && !isInBin(blocks, id);
};

/** The live pages right under a page (in its content), or at the top. */
function pagesUnder(library: ImportLibrary, parent: string | null): string[] {
  const ids = parent === null ? [...(library.blocksByParent[ROOT] ?? [])] : subPages(library.blocks, library.blocksByParent, parent);
  return ids.filter(id => livePage(library.blocks, id));
}

const sameTitle = (a: string, b: string): boolean => foldText(a.trim()) === foldText(b.trim());

/**
 * What the import will do, against the pages here now (re-planned at « Importer », as they may have
 * synced meanwhile): each page new or here already, the pages left out, what is written.
 */
export function planImport(read: ExportRead, choices: ImportChoices, library: ImportLibrary, mint: () => string = () => createId()): ImportPlan {
  let destination: string | null = null;
  let container: ImportPlan['container'] = null;
  if (choices.placement === 'new') {
    const found = pagesUnder(library, null).find(id => sameTitle(library.blocks[id]!.text, choices.containerTitle));
    container = found ? { id: found, title: choices.containerTitle, fate: 'same' } : { id: mint(), title: choices.containerTitle, fate: 'new' };
  } else if (choices.placement === 'inside' && choices.insideId && livePage(library.blocks, choices.insideId)) {
    destination = choices.insideId;
  }
  // Where the matching starts: the container found again, the page chosen, the top; a new container holds nothing yet.
  const start: string | null | undefined = container ? (container.fate === 'same' ? container.id : undefined) : destination;
  const pages: PlannedPage[] = [];
  const totals = { pages: 0, pictures: 0, files: 0, tables: 0, blocks: 0, same: 0, off: 0 };
  const walk = (keys: readonly string[], existingParent: string | null | undefined, trail: readonly string[], offAbove: boolean): void => {
    // An existing page matches one page of the export at most.
    const free = existingParent === undefined ? [] : pagesUnder(library, existingParent);
    for (const key of keys) {
      const page = read.pages[key];
      if (!page) continue;
      const match = free.find(id => sameTitle(library.blocks[id]!.text, page.title));
      if (match) free.splice(free.indexOf(match), 1);
      const off = choices.off.has(key);
      const fate = match ? 'same' : 'new';
      pages.push({ key, id: match ?? page.id, title: page.title, icon: page.icon, trail, depth: trail.length, fate, off, offAbove, counts: page.counts, rows: page.rows });
      if (off || offAbove) totals.off += 1;
      else if (fate === 'same') totals.same += 1;
      else {
        totals.pages += 1;
        totals.pictures += page.counts.pictures;
        totals.files += page.counts.files;
        totals.tables += page.counts.tables;
        totals.blocks += page.counts.blocks;
      }
      walk(page.children, match ?? undefined, [...trail, page.title], offAbove || off);
    }
  };
  walk(read.top, start, [], false);
  return { read, choices, pages, container, destination, totals };
}

// ── the preview ─────────────────────────────────────────────────────────────

/** What a page holds, in a line: « 24 blocs · 3 images · 1 tableau », « Vide ». */
export function pageCountsWords(counts: PageCounts, rows: number | null = null): string {
  const parts: string[] = [];
  if (rows !== null) parts.push(t('Tableau de {rows}', { rows: plural(rows, 'ligne') }));
  else if (counts.blocks > 0) parts.push(plural(counts.blocks, 'bloc'));
  if (counts.pictures > 0) parts.push(plural(counts.pictures, 'image'));
  if (counts.files > 0) parts.push(plural(counts.files, 'fichier'));
  if (counts.tables > 0 && rows === null) parts.push(plural(counts.tables, 'tableau', 'tableaux'));
  return parts.length > 0 ? parts.join(' · ') : t('Vide');
}

/** What a page lacks, said under it: pictures absent, links to pages absent. */
function pageWants(counts: PageCounts): string | undefined {
  const parts: string[] = [];
  if (counts.missing > 0) parts.push(plural(counts.missing, 'fichier absent de l’export, sa place reste vide', 'fichiers absents de l’export, leur place reste vide'));
  if (counts.broken > 0) parts.push(plural(counts.broken, 'lien vers une page absente, gardé comme texte', 'liens vers des pages absentes, gardés comme texte'));
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** Every page in the tree's order, each with what it holds, its place and what becomes of it; then what is left out, with why. */
export function previewEntries(plan: ImportPlan): PreviewEntry[] {
  const pages = plan.pages.map(
    (page): PreviewEntry => ({
      key: page.key,
      title: page.icon ? `${page.icon} ${page.title}` : page.title,
      detail: pageCountsWords(page.counts, page.rows),
      fate: page.fate,
      why: page.offAbove ? t('Sa page parente est laissée de côté.') : page.fate === 'same' ? t('Déjà là : gardée telle quelle, ses sous-pages nouvelles ajoutées.') : pageWants(page.counts),
      glyph: page.rows !== null ? 'table' : 'page',
      ...(page.trail.length > 0 ? { note: t('Dans {path}', { path: page.trail.join(' › ') }) } : {}),
    }),
  );
  const skipped = plan.read.leftOut.map((item): PreviewEntry => ({ key: item.key, title: item.title, detail: item.detail, fate: 'skip', why: item.why, glyph: item.glyph }));
  return [...pages, ...skipped];
}

/** The preview's counts, a line each. */
export function importCountLines(plan: ImportPlan): { readonly icon: GlyphName; readonly text: string; readonly meta: string | null }[] {
  const { totals } = plan;
  const lines: { icon: GlyphName; text: string; meta: string | null }[] = [
    { icon: 'page', text: plural(totals.pages, 'page'), meta: totals.same > 0 ? plural(totals.same, 'page déjà là, gardée telle quelle', 'pages déjà là, gardées telles quelles') : null },
  ];
  if (totals.pictures + totals.files > 0) lines.push({ icon: 'image', text: plural(totals.pictures + totals.files, 'image ou fichier', 'images ou fichiers'), meta: t('Joints à leurs pages un à un, une fois les pages écrites') });
  if (totals.tables > 0) lines.push({ icon: 'table', text: plural(totals.tables, 'tableau', 'tableaux'), meta: plan.read.kind === 'notion' ? t('Les bases de données de Notion, leurs colonnes typées d’après leurs cellules') : null });
  const left = plan.read.leftOut.length;
  if (left > 0 || totals.off > 0) lines.push({ icon: 'eyeOff', text: plural(left + totals.off, 'élément laissé de côté', 'éléments laissés de côté'), meta: t('Chacun dit pourquoi dans la liste') });
  return lines;
}

// ── writing ─────────────────────────────────────────────────────────────────

/** A block's change, as each client's `writeLocal` takes it. */
export interface ImportChange {
  readonly type: 'block';
  readonly id: string;
  readonly patch: Readonly<Record<string, unknown>>;
}

/** A file of the export to attach to its block once the pages are written. */
export interface ImportFileJob {
  readonly blockId: string;
  /** The page it is in. */
  readonly pageId: string;
  readonly asset: ExportAsset;
}

export interface ImportWritten {
  readonly changes: readonly ImportChange[];
  readonly files: readonly ImportFileJob[];
  /** Every block made (pages included): what taking the import back erases. */
  readonly created: readonly string[];
  /** The pages made. */
  readonly pages: number;
  /** Where to open them: the new page holding them, the first page made, or the page they went in. */
  readonly opened: string | null;
}

const IMPORT_KEYS = new Set(['importPage', 'importFile']);

/** Markup cut to a field's limit, never inside a mark or a mention. */
function fitMarkup(markup: string, limit: number): string {
  if (markup.length <= limit) return markup;
  let runs = parseRich(markup);
  let out = serializeRich(runs);
  while (out.length > limit && runs.length > 0) {
    const last = runs[runs.length - 1]!;
    runs = last.kind === 'text' && last.text.length > 1 ? [...runs.slice(0, -1), { ...last, text: last.text.slice(0, Math.max(1, last.text.length - Math.ceil((out.length - limit) / 2))) }] : runs.slice(0, -1);
    out = serializeRich(runs);
  }
  return out;
}

/**
 * The records of a plan (`planImport`, made just before), as one batch: the new page holding them,
 * each page and its blocks, new pages placed after those already in their place (`placeAt`, its
 * moved twins written too), mentions of pages here already pointed at them and of pages left out
 * turned into their names. The files to attach after are listed, each with its block.
 */
export function importChanges(plan: ImportPlan, library: ImportLibrary, now: number, mint: () => string = () => createId(now)): ImportWritten {
  const { read, choices } = plan;
  const changes: ImportChange[] = [];
  const files: ImportFileJob[] = [];
  const created: string[] = [];
  const planned = new Map(plan.pages.map(page => [page.key, page]));
  const ids = new Map<string, string>();
  const named = new Map<string, string>();
  for (const page of plan.pages) {
    const own = read.pages[page.key]!.id;
    if (page.fate === 'same') ids.set(own, page.id);
    else if (page.off || page.offAbove) named.set(own, page.title);
  }
  const written = (key: string): boolean => {
    const page = planned.get(key);
    return !!page && page.fate === 'new' && !page.off && !page.offAbove;
  };
  const kept = choices.private ? { private: true } : {};

  /** Mentions of pages here already point at them; of pages left out, their names stand instead. */
  const remap = (markup: string): string => {
    if (!markup.includes('{@page=')) return markup;
    const runs = parseRich(markup).flatMap((run): Run[] => {
      if (run.kind !== 'mention' || run.target.type !== 'page') return [run];
      const moved = ids.get(run.target.id);
      if (moved) return [{ ...run, target: { type: 'page', id: moved } }];
      const name = named.get(run.target.id);
      return name !== undefined ? richFromPlain(name) : [run];
    });
    return serializeRich(runs);
  };

  const add = (id: string, fields: Record<string, unknown>): void => {
    changes.push({ type: 'block', id, patch: fields });
    created.push(id);
  };
  const holds = (kind: BlockKind): boolean => canNest(kind) || kind === 'table' || kind === 'columns';

  const writeBlocks = (drafts: readonly BlockDraft[], container: string, pageId: string): void => {
    // A draft that holds nothing has what was under it after it, in the same place.
    const flat: BlockDraft[] = [];
    const collect = (list: readonly BlockDraft[]): void => {
      for (const draft of list) {
        if (draft.kind === 'page' && typeof draft.extra?.importPage === 'string' && !written(draft.extra.importPage)) continue;
        flat.push(draft);
        if (!holds(draft.kind) && draft.children) collect(draft.children);
      }
    };
    collect(drafts);
    if (flat.length === 0) return;
    const positions = positionsBetween(null, null, flat.length);
    flat.forEach((draft, index) => {
      const position = positions[index]!;
      const sub = draft.kind === 'page' ? draft.extra?.importPage : undefined;
      if (typeof sub === 'string') {
        writePage(sub, container, position);
        return;
      }
      const id = mint();
      const extra: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(draft.extra ?? {})) if (!IMPORT_KEYS.has(key)) extra[key] = value;
      const text = RICH_KINDS.has(draft.kind) ? fitMarkup(remap(draft.text), PAGES_TEXT_LIMITS.block.text) : draft.text.slice(0, PAGES_TEXT_LIMITS.block.text);
      add(
        id,
        blockFields({
          ...extra,
          kind: draft.kind,
          text,
          ...(draft.checked !== undefined ? { checked: draft.checked } : {}),
          ...(draft.language !== undefined ? { language: draft.language.slice(0, 30) } : {}),
          parentId: container,
          position,
          createdAt: now,
        } as NewBlockFields),
      );
      const file = draft.extra?.importFile;
      if (typeof file === 'string' && read.assets[file]) files.push({ blockId: id, pageId, asset: read.assets[file] });
      if (holds(draft.kind) && draft.children) writeBlocks(draft.children, id, pageId);
    });
  };

  const writePage = (key: string, parentId: string | null, position: string): void => {
    const page = read.pages[key]!;
    add(page.id, blockFields({ kind: 'page', text: page.title.slice(0, 500), ...(page.icon ? { icon: page.icon } : {}), parentId, position, createdAt: now, trashedAt: null, ...kept }));
    writeBlocks(page.drafts, page.id, page.id);
  };

  /** New pages at the end of a place that holds pages already: after them, any twin moved aside in the same batch. */
  const appendTo = (parent: string | null, keys: readonly string[]): void => {
    if (keys.length === 0) return;
    const siblings: Placed[] = (library.blocksByParent[parentKey(parent)] ?? []).flatMap(id => (library.blocks[id] ? [{ id, position: library.blocks[id]!.position }] : []));
    const { positions, moved } = placeAt(siblings, siblings.length, keys.length);
    for (const twin of moved) changes.push({ type: 'block', id: twin.id, patch: { position: twin.position } });
    keys.forEach((key, index) => writePage(key, parent, positions[index]!));
  };

  let top: string | null = plan.destination;
  if (plan.container) {
    top = plan.container.id;
    if (plan.container.fate === 'new') {
      const firsts = read.top.filter(written);
      const anything = plan.pages.some(page => !page.off && !page.offAbove && page.fate === 'new');
      if (anything) {
        const siblings: Placed[] = (library.blocksByParent[ROOT] ?? []).flatMap(id => (library.blocks[id] ? [{ id, position: library.blocks[id]!.position }] : []));
        const { positions, moved } = placeAt(siblings, siblings.length, 1);
        for (const twin of moved) changes.push({ type: 'block', id: twin.id, patch: { position: twin.position } });
        add(plan.container.id, blockFields({ kind: 'page', text: plan.container.title.slice(0, 500), parentId: null, position: positions[0]!, createdAt: now, trashedAt: null, ...kept }));
        const inside = positionsBetween(null, null, firsts.length);
        firsts.forEach((key, index) => writePage(key, plan.container!.id, inside[index]!));
      }
    }
  }
  if (!plan.container || plan.container.fate === 'same') appendTo(top, read.top.filter(written));
  // A page here already: its new sub-pages after what it holds.
  for (const page of plan.pages) {
    if (page.fate !== 'same' || page.off || page.offAbove) continue;
    appendTo(page.id, read.pages[page.key]!.children.filter(written));
  }

  const made = plan.pages.filter(page => written(page.key));
  const opened = plan.container && created.includes(plan.container.id) ? plan.container.id : plan.container?.fate === 'same' ? plan.container.id : (made.find(page => page.depth === 0)?.id ?? made[0]?.id ?? plan.destination);
  return { changes, files, created, pages: made.length, opened };
}

/** Taking an import back: every block it made, gone for good (its files are not sent once their blocks are). */
export function importUndoChanges(created: readonly string[], now: number): ImportChange[] {
  return created.map(id => ({ type: 'block', id, patch: { deletedAt: now } }));
}

// ── the report ──────────────────────────────────────────────────────────────

/** What came in, a line each. */
export function importReportLines(written: Pick<ImportWritten, 'pages'>, attached: number, tables: number): string[] {
  const lines = [plural(written.pages, 'page importée', 'pages importées')];
  if (attached > 0) lines.push(plural(attached, 'image ou fichier joint', 'images ou fichiers joints'));
  if (tables > 0) lines.push(plural(tables, 'tableau', 'tableaux'));
  return lines;
}

/** What was left out, a line each: the files with why, the pages the person left out, the files that could not be kept. */
export function importSkippedLines(plan: ImportPlan, failed: readonly { readonly name: string; readonly why: string }[]): string[] {
  const lines = plan.read.leftOut.map(item => t('{file} : {why}', { file: item.title, why: item.why }));
  if (plan.totals.off > 0) lines.push(plural(plan.totals.off, 'page laissée de côté par vous', 'pages laissées de côté par vous'));
  if (plan.totals.same > 0) lines.push(plural(plan.totals.same, 'page déjà là, gardée telle quelle', 'pages déjà là, gardées telles quelles'));
  for (const file of failed) lines.push(t('{file} : {why}', { file: file.name, why: file.why }));
  return lines;
}
