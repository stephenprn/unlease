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
 *   Claude files in « Non classé »; several, a collection of its own. The words around each
 *   address become its link's comment, a ticked item a done link. Links are planned as `addLinks`
 *   plans them (`notes/services/savedLinks`): once per collection, a reading copied from a link
 *   already saved at that address.
 */
import { getLocale, t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { asLineColor, nextLineColor, type LineColor } from '@unlease/design/colors';
import { formatHlc } from '@unlease/core/sync/hlc';
import type { SyncRecord } from '@unlease/core/sync/record';
import { createId } from '@unlease/core/services/ids';
import { positionsBetween } from '@unlease/core/services/fractionalIndex';
import { foldText } from '@unlease/core/services/search';
import { extractUrls, normalizeUrl } from '@unlease/core/services/url';

import { nextEmblem } from '../models/collections';
import { INBOX_ID, type Label, type LinkItem, type Note } from '../models/entities';
import { checkFields, labelFields, linkFields, linkFromRecord, noteFields } from '../sync/entities';
import { TEXT_LIMITS } from '../sync/types';
import { keepFormattedLines } from './keepHtml';
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

/** One address in a note that can become links. */
export interface KeepLink {
  readonly url: string;
  /** The words beside it on its line or item: the link's comment. */
  readonly comment: string;
  /** Keep's own preview of the page (its `WEBLINK` annotation), shown until Claude reads it. */
  readonly title: string;
  /** A ticked item: the link is done. */
  readonly done: boolean;
}

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
  /** Set when every line or item holds an address (and the note has no photo): it can become links. */
  readonly links: readonly KeepLink[] | null;
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

/** What may sit between an address and the words beside it: bullets, dashes, colons. */
const SEPARATORS = /^[\s\-–—:|•·*>→]+|[\s\-–—:|•·*<←]+$/g;

/** The addresses of one line, and its words without them; null without an address. */
function lineLinks(line: string): { readonly urls: readonly string[]; readonly words: string } | null {
  const urls = extractUrls(line);
  if (urls.length === 0) return null;
  let words = line;
  for (const url of urls) words = words.split(url).join(' ');
  // A bare domain is the whole line: no words beside it.
  if (!/:\/\//.test(line)) words = '';
  return { urls, words: words.replace(/\s+/g, ' ').replace(SEPARATORS, '').trim() };
}

/** The links of a note whose every line or item holds an address; null otherwise. */
function linksOf(lines: readonly { readonly text: string; readonly done: boolean }[], previews: ReadonlyMap<string, string>): KeepLink[] | null {
  const filled = lines.filter(line => line.text.trim().length > 0);
  if (filled.length === 0) return null;
  const links: KeepLink[] = [];
  const byUrl = new Map<string, number>();
  for (const line of filled) {
    const found = lineLinks(line.text);
    if (!found) return null;
    for (const url of found.urls) {
      const address = normalizeUrl(url);
      const at = byUrl.get(address);
      if (at !== undefined) {
        // The same address twice: one link, both comments.
        const kept = links[at]!;
        const comment = [kept.comment, found.words].filter(Boolean).join('\n');
        links[at] = { ...kept, comment, done: kept.done && line.done };
        continue;
      }
      byUrl.set(address, links.length);
      links.push({ url, comment: found.words, title: previews.get(address) ?? '', done: line.done });
    }
  }
  return links;
}

/** Null when unreadable; 'trashed' for notes from Keep's bin, 'empty' for notes with nothing in them. */
export function parseKeepNote(source: string, json: string): ImportedNote | 'trashed' | 'empty' | null {
  let raw: KeepJson;
  try {
    raw = JSON.parse(json) as KeepJson;
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const looksLikeNote = ['textContent', 'listContent', 'title', 'createdTimestampUsec', 'userEditedTimestampUsec', 'attachments'].some(key => key in raw);
  if (!looksLikeNote) return null;
  if (raw.isTrashed === true) return 'trashed';

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

  if (!title && !body && checks.length === 0 && attachments.length === 0) return audio + otherFiles > 0 ? null : 'empty';

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

  const links =
    attachments.length > 0
      ? null
      : kind === 'checklist'
        ? linksOf(checks.map(check => ({ text: check.text, done: check.checked })), previews)
        : linksOf(body.split('\n').map(line => ({ text: line, done: false })), previews);

  const key = raw.createdTimestampUsec !== undefined && created !== null ? `keep:${String(raw.createdTimestampUsec)}` : `keep:${source}:${title}:${body.slice(0, 200)}`;

  return {
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
  };
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
  const keys = new Map<string, number>();
  // A stable order, so two notes with the same key get the same suffix in every export.
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const file of sorted) {
    if (isLabelsFile(file.name)) {
      parseKeepLabels(file.text).forEach(addLabel);
      continue;
    }
    if (!/\.json$/i.test(file.name)) continue;
    const parsed = parseKeepNote(file.name, file.text);
    if (parsed === 'trashed') trashed += 1;
    else if (parsed === 'empty') empty += 1;
    else if (parsed === null) unreadable.push(file.name);
    else {
      const seen = keys.get(parsed.key) ?? 0;
      keys.set(parsed.key, seen + 1);
      notes.push(seen === 0 ? parsed : { ...parsed, key: `${parsed.key}#${seen}` });
      parsed.labelNames.forEach(addLabel);
    }
  }
  return { notes, labelNames: [...labels.values()], trashed, empty, unreadable };
}

/** Notes of one address: each can become a link Claude files. */
export function singleLinkNotes(plan: KeepPlan): ImportedNote[] {
  return plan.notes.filter(note => note.links?.length === 1);
}

/** Notes of several addresses: each can become a collection. */
export function linkListNotes(plan: KeepPlan): ImportedNote[] {
  return plan.notes.filter(note => (note.links?.length ?? 0) > 1);
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
  const first = note.links?.find(link => link.comment)?.comment ?? note.links?.[0]?.title ?? '';
  return first || (note.links?.[0] ? note.links[0].url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60) : t('Note sans titre'));
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

export interface ImportOptions {
  /** The importing device's clock node. */
  readonly node: string;
  readonly now: number;
  readonly library: KeepLibrary;
  /** Whether a record with this id is already in the library, live or deleted: an earlier import's. */
  readonly known: (type: 'note' | 'link', id: string) => boolean;
  /** The server reads links: new links wait for Claude; otherwise they are kept plain where they land. */
  readonly reading: boolean;
  /** Notes of one address become a link Claude files from « Non classé »; false: they stay notes. */
  readonly singleLinks: boolean;
  /** The notes of several addresses (by `source`) that become collections; the others stay notes. */
  readonly collections: ReadonlySet<string>;
  /** The export's file a photo's `filePath` names, or null when it is missing. */
  readonly findFile: (filePath: string) => string | null;
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
    if (!options.known('note', keepNoteId(note))) return true;
    report.already += 1;
    return false;
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
  const collections: { id: string; emblem: string | null; color: LineColor | null }[] = Object.values(library.notes)
    .filter(note => note.kind === 'links' && note.deletedAt === null)
    .map(note => ({ id: note.id, emblem: note.emblem, color: asLineColor(note.color) }));
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
      const title = (note.title || keepNoteName(note)).slice(0, TEXT_LIMITS.note.title);
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
      collections.push({ id, emblem, color });
      report.collections += 1;
      const links = note.links!;
      const keys = positionsBetween(null, null, links.length);
      links.forEach((link, at) => {
        const [linkPlan] = planLinks([link.url], id, saved, library.linkTemplates ? { templates: library.linkTemplates, notes: library.notes } : undefined);
        if (!linkPlan || linkPlan.existing !== null) {
          report.linksKnown += 1;
          return;
        }
        const linkRecord = record('link', keepId(note.createdAt, `${note.key}#link${at}`), linkFieldsFor(id, link, linkPlan, { autoFile: false, filedBy: 'person', position: keys[at]!, createdAt: note.createdAt, doneAt: note.editedAt }), note.editedAt);
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
          archived: note.archived,
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

/** The import's summary, a line each: what came in, then what was left out and why. */
export function keepReportLines(report: KeepReport): { readonly imported: readonly string[]; readonly skipped: readonly string[] } {
  const imported: string[] = [];
  const skipped: string[] = [];
  if (report.notes > 0) {
    const kinds = [
      report.checklists > 0 ? plural(report.checklists, 'liste', 'listes') : null,
      report.formatted > 0 ? plural(report.formatted, 'mise en forme', 'mises en forme') : null,
    ].filter(Boolean);
    const notes = plural(report.notes, 'note importée', 'notes importées');
    imported.push(kinds.length > 0 ? t('{notes}, dont {kinds}', { notes, kinds: kinds.join(', ') }) : notes);
  }
  if (report.collections > 0) imported.push(plural(report.collections, 'collection créée', 'collections créées'));
  if (report.links > 0) imported.push(plural(report.links, 'lien ajouté', 'liens ajoutés'));
  if (report.labels > 0) imported.push(plural(report.labels, 'label créé', 'labels créés'));
  if (report.photos > 0) imported.push(plural(report.photos, 'photo'));
  if (report.already > 0) skipped.push(plural(report.already, 'note déjà importée', 'notes déjà importées'));
  if (report.linksKnown > 0) skipped.push(plural(report.linksKnown, 'lien déjà enregistré', 'liens déjà enregistrés'));
  if (report.trashed > 0) skipped.push(plural(report.trashed, 'note de la corbeille de Keep', 'notes de la corbeille de Keep'));
  if (report.empty > 0) skipped.push(plural(report.empty, 'note vide', 'notes vides'));
  if (report.audio > 0) skipped.push(t('{recordings} : seul le texte transcrit est importé', { recordings: plural(report.audio, 'enregistrement vocal', 'enregistrements vocaux') }));
  if (report.otherFiles > 0) skipped.push(t('{files} : type non pris en charge', { files: plural(report.otherFiles, 'fichier joint', 'fichiers joints') }));
  if (report.missingPhotos > 0) skipped.push(plural(report.missingPhotos, 'photo absente de l’archive', 'photos absentes de l’archive'));
  if (report.unreadable > 0) skipped.push(plural(report.unreadable, 'fichier illisible', 'fichiers illisibles'));
  return { imported, skipped };
}
