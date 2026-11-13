/**
 * Google Keep, from a Takeout export (one JSON file per note, its photos beside it, `Labels.txt`),
 * into records. Shared by both clients: they read the archive and store the photos; everything
 * a note becomes is decided here.
 *
 * - The format is undocumented: an unreadable file is counted and skipped, never fatal; a field
 *   missing or of another type reads as absent.
 * - Clocks carry each note's Keep edit time, so a later real edit on any device wins, and the
 *   cards say « Modifiée le » Keep's own date.
 * - Ids are drawn from the Keep note itself (its creation time and a hash of what names it), so an
 *   export imported twice, on this device or another, skips the notes already there instead of
 *   doubling them. A note deleted since stays deleted.
 * - A note whose every line (or item) holds an address can become links: one address, a link
 *   Claude files in « Non classé »; several, a collection of its own. A list whose lines are mostly
 *   addresses (`mostlyLinks`: two in three) can become a collection too, each of its other lines
 *   chosen in the wizard: the comment of the link above it (the default), left out, or replaced by a
 *   link typed in its place. The words around each address become its link's comment, a ticked
 *   item a done link (`services/lineLinks`). Links are planned as `addLinks` plans them
 *   (`notes/services/savedLinks`): once per collection, a reading copied from a link already saved
 *   at that address.
 * - Every note of the export is previewed before anything is written (`keepPreview`): what it
 *   becomes, or why it is left out.
 */
import { getLocale, localized, t, tc, tx } from '@unlease/core/i18n';
import { formatDay, formatUsd, plural } from '@unlease/core/services/format';
import type { ImportFate, PreviewEntry } from '@unlease/core/services/importFlow';
import { asLineColor, nextLineColor, type LineColor } from '@unlease/design/colors';
import type { GlyphName } from '@unlease/design/glyphs';
import { formatHlc } from '@unlease/core/sync/hlc';
import type { SyncRecord } from '@unlease/core/sync/record';
import { createId } from '@unlease/core/services/ids';
import { positionsBetween } from '@unlease/core/services/fractionalIndex';
import { foldText } from '@unlease/core/services/search';
import { displayHost, extractUrls, normalizeUrl, prettyUrl } from '@unlease/core/services/url';

import { nextEmblem } from '../models/collections';
import { INBOX_ID, shownTitle, type Label, type LinkItem, type Note } from '../models/entities';
import { checkFields, labelFields, linkFields, linkFromRecord, noteFields } from '../sync/entities';
import { TEXT_LIMITS } from '../sync/types';
import { keepFormattedLines } from './keepHtml';
import { freeTitle, listLinks, listName, mostlyLinks, shortLine, typedAddress, typedAddressProblem, type ListLink, type StrayLine } from './lineLinks';
import { fitLines, serializeLines } from './noteBody';
import { planLinks, savedAddresses, type LinkPlan } from './savedLinks';
import type { Templates } from './templates';

/**
 * Keep's colours, by the names Takeout writes (Keep's palette today: Coral, Peach, Sand, Mint,
 * Sage, Fog, Storm, Dusk, Blossom, Clay, Chalk), to the nearest pigment.
 */
const KEEP_COLORS: Readonly<Record<string, LineColor | null>> = {
  DEFAULT: null,
  WHITE: null,
  RED: 'red',
  ORANGE: 'orange',
  YELLOW: 'yellow',
  GREEN: 'green',
  TEAL: 'sky',
  BLUE: 'blue',
  CERULEAN: 'violet',
  DARK_BLUE: 'violet',
  PURPLE: 'lilac',
  PINK: 'pink',
  BROWN: 'brown',
  GRAY: 'grey',
  GREY: 'grey',
};

/** The photo types a note holds (the attachment record's own list). */
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif'] as const;

const PHOTO_EXTENSIONS: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  avif: 'image/avif',
};

/** One address in a note that can become links (`services/lineLinks`). */
export type KeepLink = ListLink;

/** A line of a list made mostly of links that holds none (`services/lineLinks`). */
export type KeepStray = StrayLine;

export interface ImportedNote {
  /** The JSON file's name in the export. */
  readonly source: string;
  /** What names this Keep note across exports: its ids are drawn from it. */
  readonly key: string;
  readonly kind: 'text' | 'checklist';
  readonly title: string;
  /** Plain text, or formatted lines when `rich` (`notes/services/noteBody`). */
  readonly body: string;
  readonly rich: boolean;
  readonly color: LineColor | null;
  readonly pinned: boolean;
  readonly archived: boolean;
  readonly labelNames: readonly string[];
  readonly createdAt: number;
  readonly editedAt: number;
  readonly checks: readonly { readonly text: string; readonly checked: boolean }[];
  readonly attachments: readonly { readonly filePath: string; readonly mime: string }[];
  /** Voice recordings: not imported (Keep's transcript, when there is one, is in the text). */
  readonly audio: number;
  /** Other attached files of a type a note does not hold. */
  readonly otherFiles: number;
  /** Set when every line or item holds an address, or two in three (and the note has no photo): it can become links. */
  readonly links: readonly KeepLink[] | null;
  /** With `links`: the lines or items that hold no address (none when every one does). */
  readonly strays: readonly KeepStray[];
  /** Its first words, plain, for the preview (the body's, or the first items'). */
  readonly words: string;
}

/** Why a file of the export becomes nothing. */
export type KeepSkipReason = 'trashed' | 'empty' | 'unreadable';

/** A file of the export left out, for the preview. */
export interface KeepSkipped {
  readonly source: string;
  /** Its title or first words when it could be read (a note of Keep's bin), else empty. */
  readonly title: string;
  readonly reason: KeepSkipReason;
}

export interface KeepPlan {
  readonly notes: readonly ImportedNote[];
  /** Every label: those the notes wear and those of `Labels.txt`. */
  readonly labelNames: readonly string[];
  /** Notes in Keep's bin: skipped. */
  readonly trashed: number;
  /** Notes with nothing in them: skipped. */
  readonly empty: number;
  readonly unreadable: readonly string[];
  /** Every file left out, in the export's order: the bin's, the empty ones, the unreadable ones. */
  readonly skipped: readonly KeepSkipped[];
}

interface KeepJson {
  color?: unknown;
  isTrashed?: unknown;
  isPinned?: unknown;
  isArchived?: unknown;
  textContent?: unknown;
  textContentHtml?: unknown;
  title?: unknown;
  userEditedTimestampUsec?: unknown;
  createdTimestampUsec?: unknown;
  labels?: unknown;
  listContent?: unknown;
  attachments?: unknown;
  annotations?: unknown;
}

const usecToMs = (value: unknown): number | null => {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? Math.floor(number / 1000) : null;
};

const objects = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null) : [];

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Null when unreadable; 'trashed' for notes from Keep's bin, 'empty' for notes with nothing in them. */
export function parseKeepNote(source: string, json: string): ImportedNote | 'trashed' | 'empty' | null {
  const read = readKeepNote(source, json);
  return read.kind === 'note' ? read.note : read.kind === 'unreadable' ? null : read.kind;
}

type KeepRead = { readonly kind: 'note'; readonly note: ImportedNote } | { readonly kind: 'trashed'; readonly title: string } | { readonly kind: 'empty' } | { readonly kind: 'unreadable' };

/** The first words of a note left out of Keep's bin, so the preview names it. */
function trashedTitle(raw: KeepJson): string {
  const first = text(raw.title).trim() || text(raw.textContent).trim().split('\n')[0]?.trim() || objects(raw.listContent).map(entry => text(entry.text).trim()).find(Boolean) || '';
  return shortLine(first, 80);
}

function readKeepNote(source: string, json: string): KeepRead {
  let raw: KeepJson;
  try {
    raw = JSON.parse(json) as KeepJson;
  } catch {
    return { kind: 'unreadable' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { kind: 'unreadable' };
  const looksLikeNote = ['textContent', 'listContent', 'title', 'createdTimestampUsec', 'userEditedTimestampUsec', 'attachments'].some(key => key in raw);
  if (!looksLikeNote) return { kind: 'unreadable' };
  if (raw.isTrashed === true) return { kind: 'trashed', title: trashedTitle(raw) };

  const title = text(raw.title).trim();
  let body = text(raw.textContent).replace(/\s+$/, '');
  const checks = objects(raw.listContent)
    .filter(entry => typeof entry.text === 'string')
    .map(entry => ({ text: (entry.text as string).trim(), checked: entry.isChecked === true }))
    .filter(entry => entry.text.length > 0);
  const kind = Array.isArray(raw.listContent) ? 'checklist' : 'text';

  // Keep's link previews: a title for the link, and an address the text may have lost.
  const previews = new Map<string, string>();
  const previewUrls: string[] = [];
  for (const annotation of objects(raw.annotations)) {
    const url = text(annotation.url).trim();
    if (!url || extractUrls(url).length === 0) continue;
    const address = normalizeUrl(url);
    if (!previews.has(address)) previewUrls.push(url);
    previews.set(address, text(annotation.title).trim().slice(0, 500) || previews.get(address) || '');
  }
  if (kind === 'text') {
    const inText = new Set(extractUrls(body).map(normalizeUrl));
    const lost = previewUrls.filter(url => !inText.has(normalizeUrl(url)));
    if (lost.length > 0) body = [body, ...lost].filter(Boolean).join('\n');
  }

  const attachments: { filePath: string; mime: string }[] = [];
  let audio = 0;
  let otherFiles = 0;
  for (const entry of objects(raw.attachments)) {
    const filePath = text(entry.filePath);
    const given = text(entry.mimetype).toLowerCase();
    const extension = /\.([a-z0-9]+)$/i.exec(filePath)?.[1]?.toLowerCase() ?? '';
    const mime = given === 'image/jpg' ? 'image/jpeg' : (PHOTO_TYPES as readonly string[]).includes(given) ? given : PHOTO_EXTENSIONS[extension];
    if (given.startsWith('audio/') || /^(3gp|amr|m4a|mp3|aac|ogg|wav)$/.test(extension)) audio += 1;
    else if (filePath && mime) attachments.push({ filePath, mime });
    else otherFiles += 1;
  }

  const labelNames = objects(raw.labels)
    .map(entry => entry.name)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    .map(name => name.trim());

  if (!title && !body && checks.length === 0 && attachments.length === 0) return audio + otherFiles > 0 ? { kind: 'unreadable' } : { kind: 'empty' };

  const created = usecToMs(raw.createdTimestampUsec);
  const editedAt = usecToMs(raw.userEditedTimestampUsec) ?? created ?? 0;
  const createdAt = created ?? editedAt;

  let rich = false;
  let stored = kind === 'text' ? body : '';
  const html = text(raw.textContentHtml);
  if (kind === 'text' && html) {
    const lines = keepFormattedLines(body, html);
    if (lines) {
      rich = true;
      stored = serializeLines(fitLines(lines, TEXT_LIMITS.note.body));
    }
  }

  const items = kind === 'checklist' ? checks.map(check => ({ text: check.text, done: check.checked })) : body.split('\n').map(line => ({ text: line, done: false }));
  // A note of photos stays a note; a list becomes links when its lines are all addresses, or (two at least) two in three.
  const found = attachments.length > 0 ? null : listLinks(items, previews);
  const links = found && (found.strays.length === 0 || mostlyLinks(found)) ? found.links : null;

  const key = raw.createdTimestampUsec !== undefined && created !== null ? `keep:${String(raw.createdTimestampUsec)}` : `keep:${source}:${title}:${body.slice(0, 200)}`;

  const note: ImportedNote = {
    source,
    key,
    kind,
    title,
    body: stored,
    rich,
    color: typeof raw.color === 'string' ? KEEP_COLORS[raw.color.toUpperCase()] ?? null : null,
    pinned: raw.isPinned === true,
    archived: raw.isArchived === true,
    labelNames,
    createdAt,
    editedAt,
    checks,
    attachments,
    audio,
    otherFiles,
    links,
    strays: links && found ? found.strays : [],
    words: shortLine(kind === 'checklist' ? checks.map(check => check.text).join(', ') : body, 120),
  };
  return { kind: 'note', note };
}

/** `Labels.txt`: one label per line (a JSON list of names, or of `{ name }`, is read too). */
export function parseKeepLabels(content: string): string[] {
  const trimmed = content.replace(/^\uFEFF/, '').trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const raw = JSON.parse(trimmed) as unknown;
      const list = Array.isArray(raw) ? raw : objects([raw]).flatMap(entry => (Array.isArray(entry.labels) ? entry.labels : []));
      return list
        .map(entry => (typeof entry === 'string' ? entry : typeof entry === 'object' && entry !== null ? text((entry as { name?: unknown }).name) : ''))
        .map(name => name.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }
  return trimmed
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

const isLabelsFile = (name: string): boolean => /(^|\/)labels\.(txt|json)$/i.test(name);

/** The export's files that matter to the import: notes' JSON and the labels' list. */
export function isKeepDataFile(name: string): boolean {
  return /\.json$/i.test(name) || isLabelsFile(name);
}

export function planKeepImport(files: readonly { readonly name: string; readonly text: string }[]): KeepPlan {
  const notes: ImportedNote[] = [];
  const unreadable: string[] = [];
  const labels = new Map<string, string>();
  const addLabel = (name: string): void => {
    if (!labels.has(foldText(name))) labels.set(foldText(name), name);
  };
  let trashed = 0;
  let empty = 0;
  const skipped: KeepSkipped[] = [];
  const keys = new Map<string, number>();
  // A stable order, so two notes with the same key get the same suffix in every export.
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const file of sorted) {
    if (isLabelsFile(file.name)) {
      parseKeepLabels(file.text).forEach(addLabel);
      continue;
    }
    if (!/\.json$/i.test(file.name)) continue;
    const read = readKeepNote(file.name, file.text);
    if (read.kind === 'trashed') {
      trashed += 1;
      skipped.push({ source: file.name, title: read.title, reason: 'trashed' });
    } else if (read.kind === 'empty') {
      empty += 1;
      skipped.push({ source: file.name, title: '', reason: 'empty' });
    } else if (read.kind === 'unreadable') {
      unreadable.push(file.name);
      skipped.push({ source: file.name, title: '', reason: 'unreadable' });
    } else {
      const parsed = read.note;
      const seen = keys.get(parsed.key) ?? 0;
      keys.set(parsed.key, seen + 1);
      notes.push(seen === 0 ? parsed : { ...parsed, key: `${parsed.key}#${seen}` });
      parsed.labelNames.forEach(addLabel);
    }
  }
  return { notes, labelNames: [...labels.values()], trashed, empty, unreadable, skipped };
}

/** Notes of one address: each can become a link Claude files. */
export function singleLinkNotes(plan: KeepPlan): ImportedNote[] {
  return plan.notes.filter(note => note.links?.length === 1);
}

/** Notes of several addresses: each can become a collection. */
export function linkListNotes(plan: KeepPlan): ImportedNote[] {
  return plan.notes.filter(note => (note.links?.length ?? 0) > 1);
}

/** Notes of several addresses with lines that hold none: each such line asks what it becomes. */
export function strayListNotes(plan: KeepPlan): ImportedNote[] {
  return plan.notes.filter(note => (note.links?.length ?? 0) > 1 && note.strays.length > 0);
}

/** What names one line without an address across the wizard: its note's file and its place. */
export function strayKey(note: Pick<ImportedNote, 'source'>, stray: Pick<KeepStray, 'line'>): string {
  return `${note.source}#${stray.line}`;
}

/** What the export holds, before anything is chosen. */
export function keepPlanCounts(plan: KeepPlan): { readonly notes: number; readonly photos: number; readonly audio: number; readonly otherFiles: number } {
  let photos = 0;
  let audio = 0;
  let otherFiles = 0;
  for (const note of plan.notes) {
    photos += note.attachments.length;
    audio += note.audio;
    otherFiles += note.otherFiles;
  }
  return { notes: plan.notes.length, photos, audio, otherFiles };
}

/** The note's name in a list of choices: its title, else its first words. */
export function keepNoteName(note: ImportedNote): string {
  if (note.title) return note.title;
  if (note.links) return listName(note.links) || t('Untitled note');
  return shortLine(note.words, 60) || t('Untitled note');
}

// ── ids drawn from the Keep note ─────────────────────────────────────────────

/** 53 bits of `value`, seeded (cyrb53). */
function hash53(value: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** A UUIDv7 at `time` whose other bits come from `key`: the same Keep note gets the same id in every import. */
export function keepId(time: number, key: string): string {
  const bytes = new Uint8Array(16);
  let wall = Math.max(0, Math.floor(time));
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = wall % 256;
    wall = Math.floor(wall / 256);
  }
  let a = hash53(key, 1);
  let b = hash53(key, 2);
  for (let i = 6; i < 11; i += 1) {
    bytes[i] = a % 256;
    a = Math.floor(a / 256);
  }
  for (let i = 11; i < 16; i += 1) {
    bytes[i] = b % 256;
    b = Math.floor(b / 256);
  }
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The id a Keep note becomes (a note or a collection). */
export const keepNoteId = (note: Pick<ImportedNote, 'createdAt' | 'key'>): string => keepId(note.createdAt, note.key);

// ── the export's files ────────────────────────────────────────────────────────

const fileKey = (name: string): string =>
  (name.split('/').pop() ?? name)
    .toLowerCase()
    .replace(/[^a-z0-9._ \-()]/g, '_');

const stem = (name: string): string => name.replace(/\.[a-z0-9]+$/, '');

/**
 * Finds the file a note's attachment names among the export's: by name, case aside; else by name
 * without its extension, as Takeout sometimes writes `.jpeg` in the JSON and `.jpg` on disk.
 */
export function keepFileFinder(names: Iterable<string>): (filePath: string) => string | null {
  const exact = new Map<string, string>();
  const stems = new Map<string, string>();
  for (const name of names) {
    const key = fileKey(name);
    if (!exact.has(key)) exact.set(key, name);
    if (!stems.has(stem(key))) stems.set(stem(key), name);
  }
  return filePath => {
    const key = fileKey(filePath);
    return exact.get(key) ?? stems.get(stem(key)) ?? null;
  };
}

// ── into records ──────────────────────────────────────────────────────────────

/** What the import reads of the library it writes into. */
export interface KeepLibrary {
  readonly notes: Readonly<Record<string, Note>>;
  readonly noteOrder: readonly string[];
  readonly labels: Readonly<Record<string, Label>>;
  readonly labelOrder: readonly string[];
  readonly links: Readonly<Record<string, LinkItem>>;
  readonly linksByNote: Readonly<Record<string, readonly string[]>>;
  /** The templates links are read with (`services/templates`): a reading is copied only between collections that read alike. */
  readonly linkTemplates?: Templates;
}

/** What becomes of a line without an address in a list made a collection: the comment of the link above it, nothing, or a link of its own. */
export type StrayChoice = { readonly kind: 'comment' } | { readonly kind: 'drop' } | { readonly kind: 'link'; readonly url: string };

/** What becomes of the notes archived in Keep: archived here too, on the board, or left out. */
export const ARCHIVED_CHOICES = ['archive', 'board', 'skip'] as const;
export type ArchivedChoice = (typeof ARCHIVED_CHOICES)[number];

/** What the person decides in the wizard (`keepPlanToRecords`, `keepPreview`). */
export interface KeepChoices {
  /** Notes of one address become a link Claude files from « Non classé »; false: they stay notes. */
  readonly singleLinks: boolean;
  /** The notes of several addresses (by `source`) that become collections; the others stay notes. */
  readonly collections: ReadonlySet<string>;
  /** Each line without an address of a list made a collection (`strayKey`); absent: the comment of the link above. */
  readonly strays?: ReadonlyMap<string, StrayChoice>;
  /** The archived notes; absent: archived here too. */
  readonly archived?: ArchivedChoice;
  /** Notes left out one by one in the preview (by `key`). */
  readonly left?: ReadonlySet<string>;
}

export interface ImportOptions extends KeepChoices {
  /** The importing device's clock node. */
  readonly node: string;
  readonly now: number;
  readonly library: KeepLibrary;
  /** Whether a record with this id is already in the library, live or deleted: an earlier import's. */
  readonly known: (type: 'note' | 'link', id: string) => boolean;
  /** The server reads links: new links wait for Claude; otherwise they are kept plain where they land. */
  readonly reading: boolean;
  /** The export's file a photo's `filePath` names, or null when it is missing. */
  readonly findFile: (filePath: string) => string | null;
}

/** The choices the wizard starts from: every link list a collection, each stray line a comment, the archive kept as it is. */
export function defaultKeepChoices(plan: KeepPlan): KeepChoices {
  return { singleLinks: true, collections: new Set(linkListNotes(plan).map(note => note.source)), strays: new Map(), archived: 'archive', left: new Set() };
}

/** The address typed for each stray line to become a link, and what is wrong with it: the choices' form (`strayKey` names each field). */
export function strayProblems(plan: KeepPlan, choices: KeepChoices): Record<string, string | null> {
  const problems: Record<string, string | null> = {};
  for (const note of strayListNotes(plan)) {
    if (!choices.collections.has(note.source) || choices.left?.has(note.key)) continue;
    for (const stray of note.strays) {
      const key = strayKey(note, stray);
      const choice = choices.strays?.get(key);
      if (choice?.kind === 'link') problems[key] = typedAddressProblem(choice.url);
    }
  }
  return problems;
}

/** What an import did, for the summary it ends on. */
export interface KeepReport {
  readonly notes: number;
  readonly checklists: number;
  readonly formatted: number;
  readonly collections: number;
  /** Links added, in « Non classé » and in the new collections. */
  readonly links: number;
  /** Addresses already saved where they would have gone: not added again. */
  readonly linksKnown: number;
  readonly labels: number;
  readonly photos: number;
  /** Notes an earlier import brought already: skipped. */
  readonly already: number;
  readonly trashed: number;
  readonly empty: number;
  readonly unreadable: number;
  readonly audio: number;
  readonly otherFiles: number;
  /** Photos the JSON names but the export does not hold. */
  readonly missingPhotos: number;
  /** Lines without an address in the lists made collections: joined to a link's comment, left out, or made links. */
  readonly straysKept: number;
  readonly straysDropped: number;
  readonly straysLinked: number;
  /** Notes archived in Keep left out, as chosen. */
  readonly archivedLeft: number;
  /** Notes left out one by one in the preview. */
  readonly leftOut: number;
}

export interface ImportResult {
  readonly records: readonly SyncRecord[];
  /** `file` is the photo's file in the export, as `findFile` named it. */
  readonly uploads: readonly { readonly attachmentId: string; readonly file: string; readonly mime: string }[];
  /** `photos` counts the photos planned; the client sets it to those it stored. */
  readonly report: KeepReport;
}

/** Notes an earlier import brought already. */
export function alreadyImported(plan: KeepPlan, known: (type: 'note', id: string) => boolean): number {
  return plan.notes.filter(note => known('note', keepNoteId(note))).length;
}

/**
 * A list's links as its collection holds them, its lines without an address placed as chosen: each
 * joins the comment of the link above it (or of the first, before every link), is left out, or
 * becomes a link where it was, its words that link's comment. An address typed twice, or one the
 * list holds already, is one link, its comments joined. `key` draws each link's id: an address of
 * the list keeps its own (`link3`), one typed in a line's place takes the line's (`stray7`).
 */
export function collectionLinks(
  note: Pick<ImportedNote, 'source' | 'links' | 'strays'>,
  choices: ReadonlyMap<string, StrayChoice> | undefined,
): { readonly links: readonly { readonly link: KeepLink; readonly key: string }[]; readonly kept: number; readonly dropped: number; readonly linked: number } {
  const before = new Map<number, string[]>();
  const after = new Map<number, string[]>();
  const placed = new Map<number, { link: KeepLink; key: string }[]>();
  const add = <T>(map: Map<number, T[]>, at: number, value: T): void => {
    map.set(at, [...(map.get(at) ?? []), value]);
  };
  let kept = 0;
  let dropped = 0;
  let linked = 0;
  for (const stray of note.strays) {
    const choice = choices?.get(strayKey(note, stray));
    if (choice?.kind === 'drop') {
      dropped += 1;
      continue;
    }
    const url = choice?.kind === 'link' ? typedAddress(choice.url) : null;
    if (url) {
      linked += 1;
      add(placed, stray.at, { link: { url, comment: stray.text, title: '', done: stray.done }, key: `stray${stray.line}` });
      continue;
    }
    // A comment (or an address that is none: nothing is lost).
    kept += 1;
    add(stray.before ? before : after, stray.link, stray.text);
  }
  const ordered: { link: KeepLink; key: string }[] = [];
  (note.links ?? []).forEach((link, index) => {
    ordered.push(...(placed.get(index) ?? []));
    const comment = [...(before.get(index) ?? []), link.comment, ...(after.get(index) ?? [])].filter(Boolean).join('\n');
    ordered.push({ link: { ...link, comment }, key: `link${index}` });
  });
  ordered.push(...(placed.get(note.links?.length ?? 0) ?? []));
  // One link per address, as a list read twice would give.
  const byAddress = new Map<string, number>();
  const links: { link: KeepLink; key: string }[] = [];
  for (const entry of ordered) {
    const address = normalizeUrl(entry.link.url);
    const at = byAddress.get(address);
    if (at === undefined) {
      byAddress.set(address, links.length);
      links.push(entry);
      continue;
    }
    const first = links[at]!;
    links[at] = { ...first, link: { ...first.link, comment: [first.link.comment, entry.link.comment].filter(Boolean).join('\n'), done: first.link.done && entry.link.done } };
  }
  return { links, kept, dropped, linked };
}

export function keepPlanToRecords(plan: KeepPlan, options: ImportOptions): ImportResult {
  const { library, now } = options;
  const records: SyncRecord[] = [];
  const uploads: { attachmentId: string; file: string; mime: string }[] = [];
  let counter = 0;
  /** A clock at a past time, unique within this import. */
  const clockAt = (time: number): string => {
    counter += 1;
    return formatHlc(Math.max(1, Math.min(time, now)), counter % 1_000_000, options.node);
  };
  const record = (type: SyncRecord['type'], id: string, fields: Record<string, unknown>, time: number): SyncRecord => {
    const clock = clockAt(time);
    const clocks: Record<string, string> = {};
    for (const key of Object.keys(fields)) clocks[key] = clock;
    return { type, id, fields, clocks };
  };
  const report = {
    notes: 0,
    checklists: 0,
    formatted: 0,
    collections: 0,
    links: 0,
    linksKnown: 0,
    labels: 0,
    photos: 0,
    already: 0,
    trashed: plan.trashed,
    empty: plan.empty,
    unreadable: plan.unreadable.length,
    audio: 0,
    otherFiles: 0,
    missingPhotos: 0,
    straysKept: 0,
    straysDropped: 0,
    straysLinked: 0,
    archivedLeft: 0,
    leftOut: 0,
  };

  // Labels: a Keep label reuses the library's of the same name, case and accents aside.
  const existingLabels = library.labelOrder.map(id => library.labels[id]).filter((label): label is Label => !!label && label.deletedAt === null);
  const labelIds = new Map<string, string>();
  for (const label of existingLabels) labelIds.set(foldText(label.name), label.id);
  const newLabels = plan.labelNames.filter(name => !labelIds.has(foldText(name.slice(0, 60))));
  const lastLabel = existingLabels.at(-1)?.position ?? null;
  const labelKeys = positionsBetween(lastLabel, null, newLabels.length);
  const labelColors: (LineColor | null)[] = existingLabels.map(label => label.color);
  newLabels.forEach((name, index) => {
    const id = createId(now);
    labelIds.set(foldText(name.slice(0, 60)), id);
    const color = nextLineColor(labelColors);
    labelColors.push(color);
    records.push(record('label', id, labelFields({ name: name.slice(0, 60), color, position: labelKeys[index]!, createdAt: now, deletedAt: null }), now));
  });
  report.labels = newLabels.length;

  // Newest first, pinned first: Takeout does not keep Keep's manual order.
  const fresh = plan.notes.filter(note => {
    if (options.known('note', keepNoteId(note))) {
      report.already += 1;
      return false;
    }
    if (options.left?.has(note.key)) {
      report.leftOut += 1;
      return false;
    }
    if (note.archived && options.archived === 'skip') {
      report.archivedLeft += 1;
      return false;
    }
    return true;
  });
  const ordered = [...fresh].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.editedAt - a.editedAt);
  const asSingle = (note: ImportedNote): boolean => options.singleLinks && note.links?.length === 1;
  const asCollection = (note: ImportedNote): boolean => (note.links?.length ?? 0) > 1 && options.collections.has(note.source);
  const onBoard = ordered.filter(note => !asSingle(note));

  // Imported notes and collections go before the first note on the board today ("Non classé" is never a neighbour).
  const first = library.noteOrder.find(id => id !== INBOX_ID && library.notes[id]);
  const noteKeys = positionsBetween(null, first ? library.notes[first]!.position : null, onBoard.length);

  // Links, planned as `addLinks` plans them; each one added is seen by the next.
  const saved = savedAddresses(library.links, library.notes);
  const addSaved = (linkRecord: SyncRecord): void => {
    const link = linkFromRecord(linkRecord);
    const address = normalizeUrl(link.url);
    saved.set(address, [...(saved.get(address) ?? []), link]);
  };
  const collections: { id: string; title: string; emblem: string | null; color: LineColor | null }[] = Object.values(library.notes)
    .filter(note => note.kind === 'links' && note.deletedAt === null)
    .map(note => ({ id: note.id, title: shownTitle(note), emblem: note.emblem, color: asLineColor(note.color) }));
  const linkFieldsFor = (noteId: string, link: KeepLink, linkPlan: LinkPlan, extra: { autoFile: boolean; filedBy: LinkItem['filedBy']; position: string; createdAt: number; doneAt: number | null }) =>
    linkFields({
      noteId,
      url: linkPlan.url,
      status: options.reading ? 'pending' : 'skipped',
      autoFile: options.reading && extra.autoFile && !linkPlan.reading,
      filedBy: extra.filedBy,
      lang: getLocale(),
      copy: null,
      title: link.title.slice(0, 500),
      summary: '',
      siteName: '',
      kind: 'other',
      price: null,
      currency: null,
      attributes: [],
      imageIds: [],
      imageUrl: null,
      error: null,
      analyzedAt: null,
      ...linkPlan.reading,
      done: link.done,
      doneAt: link.done ? extra.doneAt : null,
      comment: link.comment.slice(0, TEXT_LIMITS.link.comment),
      position: extra.position,
      createdAt: extra.createdAt,
      deletedAt: null,
    });

  onBoard.forEach((note, index) => {
    const id = keepNoteId(note);
    const position = noteKeys[index]!;
    if (asCollection(note)) {
      // A title no other collection goes by: Claude files links by their collection's title.
      const title = freeTitle(note.title || keepNoteName(note), collections.map(line => line.title), TEXT_LIMITS.note.title);
      const emblem = nextEmblem(collections);
      const color = note.color ?? nextLineColor(collections.map(line => line.color));
      const fields = noteFields({
        kind: 'links',
        title,
        body: '',
        color,
        pinned: false,
        archived: false,
        trashedAt: null,
        labelIds: [],
        position,
        reminderAt: null,
        code: ([...title.trim()][0] ?? '').toUpperCase().slice(0, 3),
        emblem,
        hint: '',
        createdAt: note.createdAt,
        deletedAt: null,
      });
      const collection = record('note', id, fields, note.editedAt);
      records.push(collection);
      collections.push({ id, title, emblem, color });
      report.collections += 1;
      const { links, kept, dropped, linked } = collectionLinks(note, options.strays);
      report.straysKept += kept;
      report.straysDropped += dropped;
      report.straysLinked += linked;
      const keys = positionsBetween(null, null, links.length);
      links.forEach(({ link, key }, at) => {
        const [linkPlan] = planLinks([link.url], id, saved, library.linkTemplates ? { templates: library.linkTemplates, notes: library.notes } : undefined);
        if (!linkPlan || linkPlan.existing !== null) {
          report.linksKnown += 1;
          return;
        }
        const linkRecord = record('link', keepId(note.createdAt, `${note.key}#${key}`), linkFieldsFor(id, link, linkPlan, { autoFile: false, filedBy: 'person', position: keys[at]!, createdAt: note.createdAt, doneAt: note.editedAt }), note.editedAt);
        records.push(linkRecord);
        addSaved(linkRecord);
        report.links += 1;
      });
      return;
    }

    report.notes += 1;
    if (note.kind === 'checklist') report.checklists += 1;
    if (note.rich) report.formatted += 1;
    report.audio += note.audio;
    report.otherFiles += note.otherFiles;
    records.push(
      record(
        'note',
        id,
        noteFields({
          kind: note.kind,
          title: note.title.slice(0, TEXT_LIMITS.note.title),
          body: note.rich ? note.body : note.body.slice(0, TEXT_LIMITS.note.body),
          ...(note.rich ? { rich: true } : {}),
          color: note.color,
          pinned: note.pinned,
          archived: note.archived && options.archived !== 'board',
          trashedAt: null,
          labelIds: [...new Set(note.labelNames.map(name => labelIds.get(foldText(name.slice(0, 60)))).filter((value): value is string => !!value))],
          position,
          reminderAt: null,
          code: '',
          hint: '',
          createdAt: note.createdAt,
          deletedAt: null,
        }),
        note.editedAt,
      ),
    );
    const checkKeys = positionsBetween(null, null, note.checks.length);
    note.checks.forEach((check, at) => {
      records.push(
        record(
          'check',
          keepId(note.createdAt, `${note.key}#check${at}`),
          checkFields({ noteId: id, text: check.text.slice(0, TEXT_LIMITS.check.text), checked: check.checked, position: checkKeys[at]!, indent: 0, createdAt: note.createdAt, deletedAt: null }),
          note.editedAt,
        ),
      );
    });
    const found = note.attachments.map(attachment => ({ attachment, file: options.findFile(attachment.filePath) }));
    report.missingPhotos += found.filter(entry => entry.file === null).length;
    const present = found.filter((entry): entry is { attachment: ImportedNote['attachments'][number]; file: string } => entry.file !== null);
    const photoKeys = positionsBetween(null, null, present.length);
    present.forEach(({ attachment, file }, at) => {
      const attachmentId = keepId(note.createdAt, `${note.key}#photo${at}`);
      records.push(
        record(
          'attachment',
          attachmentId,
          { noteId: id, mime: attachment.mime, width: 0, height: 0, bytes: 0, position: photoKeys[at]!, uploaded: false, createdAt: note.createdAt, deletedAt: null },
          note.editedAt,
        ),
      );
      uploads.push({ attachmentId, file, mime: attachment.mime });
      report.photos += 1;
    });
  });

  // Notes of one address: a link each, at the top of « Non classé », for Claude to file.
  const singles = ordered.filter(asSingle);
  const inboxFirst = library.linksByNote[INBOX_ID]?.[0];
  const placed: { note: ImportedNote; link: KeepLink; plan: LinkPlan }[] = [];
  for (const note of singles) {
    const found = note.links![0]!;
    // The note's title names the link until Claude reads it; when it is not the page's own and would be
    // lost (to Claude's title, or under Keep's preview), it is kept beside the link too.
    const keepTitle = note.title !== '' && note.title !== found.title && (options.reading || found.title !== '');
    const comment = [keepTitle ? note.title : '', found.comment].filter(Boolean).join('\n');
    const link: KeepLink = { ...found, title: found.title || note.title, comment };
    if (options.known('link', keepNoteId(note))) {
      report.already += 1;
      continue;
    }
    const [linkPlan] = planLinks([link.url], null, saved);
    if (!linkPlan || linkPlan.existing !== null) {
      report.linksKnown += 1;
      continue;
    }
    placed.push({ note, link, plan: linkPlan });
    saved.set(linkPlan.url, [...(saved.get(linkPlan.url) ?? []), linkFromRecord({ type: 'link', id: keepNoteId(note), fields: { noteId: INBOX_ID, url: linkPlan.url }, clocks: {} })]);
  }
  const inboxKeys = positionsBetween(null, inboxFirst ? library.links[inboxFirst]?.position ?? null : null, placed.length);
  placed.forEach(({ note, link, plan: linkPlan }, index) => {
    records.push(
      record(
        'link',
        keepNoteId(note),
        linkFieldsFor(INBOX_ID, link, linkPlan, { autoFile: true, filedBy: null, position: inboxKeys[index]!, createdAt: note.createdAt, doneAt: note.editedAt }),
        note.editedAt,
      ),
    );
    report.links += 1;
  });

  return { records, uploads, report };
}

/** Whether an import wrote anything (the first run's step then counts as done). */
export function keepImportWrote(report: KeepReport): boolean {
  return report.notes + report.collections + report.links + report.labels + report.photos > 0;
}

/** The report's title: what happened, in a few words. */
export function keepDoneTitle(report: KeepReport): string {
  return keepImportWrote(report) ? t('Your Keep notes are here') : t('Nothing new in this archive');
}

/** The import's summary, a line each: what came in, then what was left out and why. */
export function keepReportLines(report: KeepReport): { readonly imported: readonly string[]; readonly skipped: readonly string[] } {
  const imported: string[] = [];
  const skipped: string[] = [];
  if (report.notes > 0) {
    const kinds = [
      report.checklists > 0 ? plural(report.checklists, 'list', 'lists') : null,
      report.formatted > 0 ? plural(report.formatted, 'formatted', 'formatted [many]') : null,
    ].filter(Boolean);
    const notes = plural(report.notes, 'note imported', 'notes imported');
    imported.push(kinds.length > 0 ? t('{notes}, including {kinds}', { notes, kinds: kinds.join(', ') }) : notes);
  }
  if (report.collections > 0) imported.push(plural(report.collections, 'collection created', 'collections created'));
  if (report.links > 0) imported.push(plural(report.links, 'link added', 'links added'));
  if (report.labels > 0) imported.push(plural(report.labels, 'label created [notes]', 'labels created [notes]'));
  if (report.photos > 0) imported.push(plural(report.photos, 'photo'));
  if (report.straysLinked > 0) imported.push(plural(report.straysLinked, 'line without a link replaced by a link', 'lines without a link replaced by links'));
  if (report.straysKept > 0) imported.push(plural(report.straysKept, 'line without a link kept as a comment', 'lines without a link kept as comments'));
  if (report.already > 0) skipped.push(plural(report.already, 'note already imported', 'notes already imported'));
  if (report.leftOut > 0) skipped.push(plural(report.leftOut, 'note unticked in the preview', 'notes unticked in the preview'));
  if (report.archivedLeft > 0) skipped.push(plural(report.archivedLeft, 'archived note left out', 'archived notes left out'));
  if (report.straysDropped > 0) skipped.push(plural(report.straysDropped, 'line without a link left out', 'lines without a link left out'));
  if (report.linksKnown > 0) skipped.push(plural(report.linksKnown, 'link already saved', 'links already saved'));
  if (report.trashed > 0) skipped.push(plural(report.trashed, 'note from Keep’s bin', 'notes from Keep’s bin'));
  if (report.empty > 0) skipped.push(plural(report.empty, 'empty note', 'empty notes'));
  if (report.audio > 0) skipped.push(t('{recordings}: only the transcribed text is imported', { recordings: plural(report.audio, 'voice recording', 'voice recordings') }));
  if (report.otherFiles > 0) skipped.push(t('{files}: type not supported', { files: plural(report.otherFiles, 'attached file', 'attached files') }));
  if (report.missingPhotos > 0) skipped.push(plural(report.missingPhotos, 'photo missing from the archive', 'photos missing from the archive'));
  if (report.unreadable > 0) skipped.push(plural(report.unreadable, 'unreadable file', 'unreadable files'));
  return { imported, skipped };
}

// ── the wizard: preview, counts, choices ─────────────────────────────────────

/** What it reads, named: a product's name, the same in every language. */
export const KEEP_SOURCE = 'Google Keep';

/** The wizard's words both clients show (each adds its own way to the file: a drop zone, a button). */
export const KEEP_WIZARD_WORDS = localized({
  /** Réglages › Données' « Importer » row, its second line. */
  importerMeta: tx('Your Google Keep notes, lists, labels and photos, from Google Takeout'),
  sourceTitle: tx('From Google Keep'),
  sourceLead: tx('Google Takeout exports your Keep notes as a .zip file: the import reads it here, then shows you everything before writing anything.'),
  takeoutDeselect: tx('Deselect all, then tick only “Keep”.'),
  keeps: tx('Imported notes keep their date, colour, labels, formatting and photos. Importing the same archive a second time doubles nothing.'),
  previewLabel: tx('Notes in the archive'),
  linksTitle: tx('Notes made of links'),
  toLinks: tx('Turn into links'),
  toCollections: tx('Make them collections'),
  straysTitle: tx('Lines without a link'),
  straysLead: tx('These lines of the lists becoming collections hold no address. By default, each joins the comment of the link above it.'),
  strayUrl: tx('Link address'),
  writing: tx('Writing the notes…'),
  board: tx('View the board'),
  nothingToChoose: tx('Nothing to choose in this archive: every note comes in as it is in Keep.'),
  takeoutPick: tx('Export, download the .zip file, then choose it here.'),
  takeoutDrop: tx('Export, download the .zip file, then drop it here (or the files of its Keep folder).'),
  unreadableArchive: tx('Unreadable archive: choose the .zip file downloaded from Google Takeout.'),
  noKeepNotes: tx('No Keep notes in this archive. Export “Keep” from Google Takeout.'),
});

/** A list's box among the choices, read out. */
export function keepListBoxLabel(note: ImportedNote): string {
  return t('{note} as a collection', { note: keepNoteName(note) });
}

/** What the preview reads besides the plan: what the library holds already, whether links are read, today. */
export interface KeepPreviewContext {
  readonly known: (type: 'note' | 'link', id: string) => boolean;
  readonly reading: boolean;
  readonly now: number;
}

/** Whether a Keep note is here already: an earlier import's note, or its link. */
function isHere(note: ImportedNote, choices: KeepChoices, known: KeepPreviewContext['known']): boolean {
  const id = keepNoteId(note);
  return known('note', id) || (choices.singleLinks && note.links?.length === 1 && known('link', id));
}

/** The notes in the order they come in: pinned first, newest first (Takeout keeps no manual order). */
function importOrder(notes: readonly ImportedNote[]): ImportedNote[] {
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.editedAt - a.editedAt);
}

/** What the note is in Keep, in a few words. */
function keepKindWords(note: ImportedNote): string {
  if (note.kind === 'checklist') {
    const ticked = note.checks.filter(check => check.checked).length;
    const items = plural(note.checks.length, 'item');
    return ticked > 0 ? t('List of {items}, {ticked}', { items, ticked: plural(ticked, 'ticked', 'ticked [many]') }) : t('List of {items}', { items });
  }
  if (note.words) return note.rich ? t('Formatted note') : t('Note');
  return note.attachments.length > 0 ? t('Photo without text') : t('Note');
}

/**
 * Every note of the export as the preview lists it, with the choices as they stand: what it is in
 * Keep, what it becomes (a link, a collection, still a note) or why it is left out (here already,
 * archived and left aside, Keep's bin, empty, unreadable). Its key is the note's `key`, the files
 * left out `skip:<n>`.
 */
export function keepPreview(plan: KeepPlan, context: KeepPreviewContext, choices: KeepChoices): PreviewEntry[] {
  const entries: PreviewEntry[] = importOrder(plan.notes).map(note => {
    const single = note.links?.length === 1;
    const list = (note.links?.length ?? 0) > 1;
    const collection = list && choices.collections.has(note.source);
    const asLink = single && choices.singleLinks;
    let fate: ImportFate = 'new';
    let why: string | undefined;
    if (isHere(note, choices, context.known)) {
      fate = 'same';
      why = t('Already imported: nothing will be doubled');
    } else if (note.archived && choices.archived === 'skip') {
      fate = 'skip';
      why = t('Archived in Keep: left out, as chosen');
    } else if (asLink) {
      why = context.reading ? t('Becomes a link Claude reads and files') : t('Becomes a link in Unsorted');
    } else if (collection) {
      why = t('Becomes a collection of {links}', { links: plural(collectionLinks(note, choices.strays).links.length, 'link') });
    } else if (single || list) {
      why = t('Stays a note, its links in its text');
    }
    // A text's first words, when its title does not stand for them already (a list of addresses says nothing in its words).
    const words = note.title && note.words && note.kind === 'text' && !note.links ? shortLine(note.words, 80) : null;
    const detail = [asLink ? t('Link to {site}', { site: displayHost(note.links![0]!.url) }) : keepKindWords(note), words, formatDay(note.editedAt, context.now)].filter(Boolean).join(' · ');
    const extras = [
      note.labelNames.length > 0 ? tc('notes', 'Labels: {labels}', { labels: note.labelNames.join(', ') }) : null,
      note.attachments.length > 0 ? plural(note.attachments.length, 'photo') : null,
      note.pinned ? tc('one', 'Pinned') : null,
      note.archived && choices.archived !== 'board' ? t('Archived') : null,
      note.audio > 0 ? plural(note.audio, 'voice recording not imported', 'voice recordings not imported') : null,
      collection && note.strays.length > 0 ? plural(note.strays.length, 'line without a link: to choose next', 'lines without a link: to choose next') : null,
    ].filter(Boolean);
    const glyph: GlyphName = asLink ? 'link' : collection ? 'collections' : note.kind === 'checklist' ? 'checklist' : !note.words && note.attachments.length > 0 ? 'image' : 'note';
    return { key: note.key, title: keepNoteName(note), detail, fate, ...(why ? { why } : {}), glyph, ...(extras.length > 0 ? { note: extras.join(' · ') } : {}) };
  });
  plan.skipped.forEach((left, index) => {
    const key = `skip:${index}`;
    if (left.reason === 'trashed') entries.push({ key, title: left.title || t('Untitled note'), detail: left.source, fate: 'skip', why: t('In Keep’s bin'), glyph: 'trash' });
    else if (left.reason === 'empty') entries.push({ key, title: t('Empty note'), detail: left.source, fate: 'skip', why: t('No text, list or photo'), glyph: 'note' });
    else entries.push({ key, title: left.source, detail: t('Unreadable file'), fate: 'skip', why: t('Not a Keep note the import can read'), glyph: 'alert' });
  });
  return entries;
}

/** The note a preview's entry names (the files left out name none). */
export function keepNotesByKey(plan: KeepPlan): ReadonlyMap<string, ImportedNote> {
  return new Map(plan.notes.map(note => [note.key, note]));
}

/** Whether a preview's entry can be left out by its box: a note that would come in. */
export function canLeaveOut(entry: Pick<PreviewEntry, 'key' | 'fate'>): boolean {
  return entry.fate === 'new' && !entry.key.startsWith('skip:');
}

/** One line of the preview's counts: its glyph, the count, what it means. */
export interface KeepCountLine {
  readonly icon: GlyphName;
  readonly text: string;
  readonly meta: string | null;
}

/** What the export holds, counted, for the head of the preview. */
export function keepCountLines(plan: KeepPlan, already: number): KeepCountLine[] {
  const counts = keepPlanCounts(plan);
  const checklists = plan.notes.filter(note => note.kind === 'checklist').length;
  const formatted = plan.notes.filter(note => note.rich).length;
  const kinds = [checklists > 0 ? plural(checklists, 'list', 'lists') : null, formatted > 0 ? plural(formatted, 'formatted', 'formatted [many]') : null].filter(Boolean);
  const lines: KeepCountLine[] = [
    {
      icon: 'note',
      text: plural(counts.notes, 'note'),
      meta:
        [kinds.length > 0 ? t('Including {kinds}', { kinds: kinds.join(', ') }) : null, already > 0 ? t('{notes}: skipped, nothing will be doubled', { notes: plural(already, 'note already imported', 'notes already imported') }) : null]
          .filter(Boolean)
          .join(' · ') || null,
    },
  ];
  const linkNotes = singleLinkNotes(plan).length + linkListNotes(plan).length;
  if (linkNotes > 0) lines.push({ icon: 'link', text: plural(linkNotes, 'note made of links', 'notes made of links'), meta: t('You will choose what they become at the next step.') });
  lines.push({ icon: 'tag', text: plural(plan.labelNames.length, 'label [notes]', 'labels [notes]'), meta: null });
  lines.push({
    icon: 'image',
    text: plural(counts.photos, 'photo'),
    meta:
      [
        counts.audio > 0 ? t('{recordings}: only the transcribed text is imported', { recordings: plural(counts.audio, 'voice recording', 'voice recordings') }) : null,
        counts.otherFiles > 0 ? t('{files}: type not supported', { files: plural(counts.otherFiles, 'attached file', 'attached files') }) : null,
      ]
        .filter(Boolean)
        .join(' · ') || null,
  });
  if (plan.trashed + plan.empty > 0) {
    lines.push({
      icon: 'trash',
      text: plural(plan.trashed + plan.empty, 'note left out', 'notes left out'),
      meta: [plan.trashed > 0 ? plural(plan.trashed, 'note from Keep’s bin', 'notes from Keep’s bin') : null, plan.empty > 0 ? plural(plan.empty, 'empty note', 'empty notes') : null].filter(Boolean).join(', '),
    });
  }
  if (plan.unreadable.length > 0) {
    lines.push({ icon: 'alert', text: plural(plan.unreadable.length, 'unreadable file', 'unreadable files'), meta: `${plan.unreadable.slice(0, 3).join(', ')}${plan.unreadable.length > 3 ? '…' : ''}` });
  }
  return lines;
}

/** Whether a note of the export comes in with these choices: not here already, not left out by its box nor as archived. */
export function keepNoteComes(note: ImportedNote, known: KeepPreviewContext['known'], choices: KeepChoices): boolean {
  return !isHere(note, choices, known) && !choices.left?.has(note.key) && !(note.archived && choices.archived === 'skip');
}

/** How many notes of the export come in with these choices (a link or a collection counting as its note). */
export function keepImportCount(plan: KeepPlan, known: KeepPreviewContext['known'], choices: KeepChoices): number {
  return plan.notes.filter(note => !isHere(note, choices, known) && !choices.left?.has(note.key) && !(note.archived && choices.archived === 'skip')).length;
}

/** How many links Claude would read: one per note made a link, those of the lists made collections, and the links typed in a line's place. */
export function keepLinksToRead(plan: KeepPlan, known: KeepPreviewContext['known'], choices: KeepChoices): { readonly singles: number; readonly lists: number } {
  let singles = 0;
  let lists = 0;
  for (const note of plan.notes) {
    if (isHere(note, choices, known) || choices.left?.has(note.key) || (note.archived && choices.archived === 'skip')) continue;
    if (note.links?.length === 1 && choices.singleLinks) singles += 1;
    else if ((note.links?.length ?? 0) > 1 && choices.collections.has(note.source)) lists += collectionLinks(note, choices.strays).links.length;
  }
  return { singles, lists };
}

/** The import's button: what comes in, counted. */
export function keepImportAction(count: number): string {
  return count > 0 ? t('Import {notes}', { notes: plural(count, 'note') }) : t('Import');
}

/** The notes archived in Keep that would come in (the choice is asked only when there are some). */
export function archivedCount(plan: KeepPlan, known: KeepPreviewContext['known'], choices: KeepChoices): number {
  return plan.notes.filter(note => note.archived && !isHere(note, choices, known) && !choices.left?.has(note.key)).length;
}

/** The archive's choice: its words and its options. */
export function archivedChoiceWords(count: number): { readonly title: string; readonly meta: string; readonly options: readonly { readonly value: ArchivedChoice; readonly label: string; readonly meta: string }[] } {
  return {
    title: t('Keep’s archive'),
    meta: t('{notes} in Keep: where should they go?', { notes: plural(count, 'archived note', 'archived notes') }),
    options: [
      { value: 'archive', label: t('In the archive, as in Keep'), meta: t('Within reach, off the board.') },
      { value: 'board', label: t('On the board'), meta: t('With the other notes, to archive one by one later.') },
      { value: 'skip', label: t('Don’t import them'), meta: t('They stay in Keep; another import can bring them.') },
    ],
  };
}

/** Each way a line without an address can go, as its choice offers it (short: three side by side). */
export const STRAY_CHOICES = ['comment', 'drop', 'link'] as const;
export type StrayChoiceKind = (typeof STRAY_CHOICES)[number];

export function strayChoiceLabels(): Readonly<Record<StrayChoiceKind, string>> {
  return { comment: t('Attach'), drop: t('Remove'), link: t('Link') };
}

/** A line's choice, read out: the line named. */
export function strayChoiceName(stray: KeepStray): string {
  return t('What becomes of “{line}”?', { line: shortLine(stray.text, 60) });
}

/** What the chosen way does to that line, said under it. */
export function strayChoiceMeta(note: ImportedNote, stray: KeepStray, kind: StrayChoiceKind): string {
  if (kind === 'drop') return t('This line will not be imported.');
  if (kind === 'link') return t('A link in its place, these words as its comment.');
  const link = note.links?.[stray.link];
  const name = link ? shortLine(link.comment.split('\n')[0] || link.title || prettyUrl(link.url, 40), 40) : '';
  return stray.before ? t('Added to the first link’s comment, “{link}”.', { link: name }) : t('Added to the comment of the link above, “{link}”.', { link: name });
}

/** The lists sheet's head: how many, what a collection keeps, and what Claude's reading costs. */
export function keepListsWords(count: number, links: number, reading: boolean, costEach: number | null): { readonly title: string; readonly meta: string } {
  const what = t('Each can become a collection: the text around a link becomes its comment, a ticked item a done link. Otherwise it stays a note.');
  const cost =
    links > 0
      ? reading
        ? costEach !== null
          ? t('Claude reads {links} (about {cost} in all).', { links: plural(links, 'link'), cost: formatUsd(costEach * links) })
          : t('Claude reads {links}.', { links: plural(links, 'link') })
        : t('Links stay as they are: reading by Claude is off.')
      : null;
  return { title: t('{notes} of links', { notes: plural(count, 'note made', 'notes made') }), meta: cost ? `${what} ${cost}` : what };
}

/** The single links' switch: how many, and what each costs. */
export function keepSinglesWords(count: number, reading: boolean, costEach: number | null): { readonly title: string; readonly meta: string } {
  return {
    title: t('{notes} just one link', { notes: plural(count, 'note holds', 'notes hold') }),
    meta: reading
      ? costEach !== null
        ? t('Make them links Claude reads and files (about {cost} each).', { cost: formatUsd(costEach) })
        : t('Make them links Claude reads and files.')
      : t('Make them links, kept as they are in Unsorted: reading by Claude is off.'),
  };
}

/** A list's row among the choices: made a collection, or kept a note. */
export function keepListLine(note: ImportedNote, chosen: boolean, strays: ReadonlyMap<string, StrayChoice> | undefined): string {
  if (!chosen) return t('Kept as a note');
  const links = plural(collectionLinks(note, strays).links.length, 'link');
  return note.strays.length > 0
    ? t('Collection of {links} · {lines}', { links, lines: plural(note.strays.length, 'line without a link', 'lines without a link') })
    : t('Collection of {links}', { links });
}
