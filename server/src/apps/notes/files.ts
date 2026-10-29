/**
 * Where Carnet's photos and files go in a readable tree, the same in the drive (Seafile) and in a
 * backup archive, under a folder named after the app: `Carnet/Notes/<note>/<taken at>.jpg`,
 * `Carnet/Pages/<page>/<sub-page>/<file name>`, `Carnet/Collections/<collection>/<link>.webp`.
 * Names come from titles (`blobs/names`), oldest first, so a name never moves to another item.
 */
import { UNTITLED_PAGE, type Block } from '@unlease/notes/models/blocks';
import { INBOX_ID, INBOX_TITLE, type Attachment, type CheckItem, type Label, type LinkItem, type Note } from '@unlease/notes/models/entities';
import { bodyText } from '@unlease/notes/services/noteBody';
import { attachmentFromRecord, blockFromRecord, checkFromRecord, labelFromRecord, linkFromRecord, noteFromRecord } from '@unlease/notes/sync/entities';
import { isNotesType } from '@unlease/notes/sync/types';
import { extensionFor, safeName, stamp, uniqueName } from '../../blobs/names';
import type { StoredRecord } from '../../sync/records';
import type { FilesOptions } from '../types';
import { APP_NAME } from '@unlease/notes/brand';

/** Every live record, read once: what a backup, its Markdown and the drive's layout are made from. */
export interface Library {
  readonly records: readonly StoredRecord[];
  readonly notes: readonly Note[];
  readonly checks: readonly CheckItem[];
  readonly links: readonly LinkItem[];
  readonly labels: readonly Label[];
  readonly attachments: readonly Attachment[];
  readonly blocks: readonly Block[];
}

const live = <T extends { readonly deletedAt: number | null }>(items: T[]): T[] => items.filter(item => item.deletedAt === null);

/** Carnet's live records, from every record the server holds (read in one go, so no write lands between two types). */
export function readLibrary(all: readonly StoredRecord[]): Library {
  const records = all.filter(record => isNotesType(record.type));
  const of = (type: StoredRecord['type']) => records.filter(record => record.type === type);
  return {
    records,
    notes: live(of('note').map(noteFromRecord)),
    checks: live(of('check').map(checkFromRecord)),
    links: live(of('link').map(linkFromRecord)),
    labels: live(of('label').map(labelFromRecord)),
    attachments: live(of('attachment').map(attachmentFromRecord)),
    blocks: live(of('block').map(blockFromRecord)),
  };
}

const byAge = <T extends { readonly createdAt: number; readonly id: string }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const firstLine = (text: string): string => text.split('\n').map(line => line.trim()).find(line => line.length > 0) ?? '';

/** What a note is called: its title, else its first words, else its day. */
export function noteName(note: Note, checks: readonly CheckItem[]): string {
  if (note.id === INBOX_ID) return INBOX_TITLE;
  const words = note.title.trim() || firstLine(bodyText(note)) || firstLine(byAge(checks).map(check => check.text).join('\n'));
  const fallback = note.kind === 'links' ? 'Collection sans nom' : `${note.kind === 'drawing' ? 'Dessin' : 'Note'} du ${stamp(note.createdAt).slice(0, 10)}`;
  return safeName([...words].slice(0, 60).join(''), fallback);
}

/** The app's own folder in the drive and in an archive. */
export const FOLDER = APP_NAME;

export interface Layout {
  /** Blob id -> its path in the tree, for files a live record points at. */
  readonly files: ReadonlyMap<string, string>;
  /** Note id -> `Carnet/Notes/<name>` or `Carnet/Collections/<name>`. */
  readonly notes: ReadonlyMap<string, string>;
  /** Page id -> `Carnet/Pages/<page>/<sub-page>`. */
  readonly pages: ReadonlyMap<string, string>;
}

export function layoutLibrary(library: Library, options: FilesOptions): Layout {
  const files = new Map<string, string>();
  const notes = new Map<string, string>();
  const pages = new Map<string, string>();
  const checksOf = new Map<string, CheckItem[]>();
  for (const check of library.checks) checksOf.set(check.noteId, [...(checksOf.get(check.noteId) ?? []), check]);

  const roots = { Notes: new Set<string>(), Collections: new Set<string>() };
  for (const note of byAge(library.notes)) {
    const root = note.kind === 'links' ? 'Collections' : 'Notes';
    notes.set(note.id, `${FOLDER}/${root}/${uniqueName(noteName(note, checksOf.get(note.id) ?? []), roots[root])}`);
  }

  const inFolder = new Map<string, Set<string>>();
  const place = (folder: string, name: string, extension: string, id: string): void => {
    const taken = inFolder.get(folder) ?? new Set<string>();
    inFolder.set(folder, taken);
    files.set(id, `${folder}/${uniqueName(name, taken, extension)}`);
  };

  for (const photo of byAge(library.attachments)) {
    const folder = notes.get(photo.noteId);
    if (folder) place(folder, stamp(photo.createdAt), extensionFor(options.mimeOf?.(photo.id) ?? photo.mime), photo.id);
  }

  if (options.kept) {
    for (const link of byAge(library.links)) {
      const folder = notes.get(link.noteId);
      if (!folder) continue;
      const name = safeName(link.title || link.siteName || link.url.replace(/^https?:\/\//, ''), 'Lien');
      link.imageIds.forEach((id, index) => place(folder, index === 0 ? name : `${name} ${index + 1}`, extensionFor(options.mimeOf?.(id) ?? 'image/webp'), id));
    }
  }

  const blocks = new Map(library.blocks.map(block => [block.id, block]));
  // The page a block sits in, through columns, toggles and list items.
  const containingPage = (id: string | null): Block | null => {
    let current = id ? blocks.get(id) : undefined;
    for (let guard = 0; current && guard < 200; guard += 1) {
      if (current.kind === 'page') return current;
      current = current.parentId ? blocks.get(current.parentId) : undefined;
    }
    return null;
  };
  const subPages = new Map<string, Block[]>();
  for (const block of library.blocks) {
    if (block.kind !== 'page') continue;
    const key = containingPage(block.parentId)?.id ?? '';
    subPages.set(key, [...(subPages.get(key) ?? []), block]);
  }
  const namePages = (parent: string, folder: string, depth: number): void => {
    if (depth > 50) return;
    const taken = new Set<string>();
    for (const page of byAge(subPages.get(parent) ?? [])) {
      if (pages.has(page.id)) continue;
      const path = `${folder}/${uniqueName(safeName(page.text, UNTITLED_PAGE), taken)}`;
      pages.set(page.id, path);
      namePages(page.id, path, depth + 1);
    }
  };
  namePages('', `${FOLDER}/Pages`, 0);

  for (const block of byAge(library.blocks)) {
    if (!block.fileId || block.kind === 'page') continue;
    const page = containingPage(block.parentId);
    const folder = (page && pages.get(page.id)) ?? `${FOLDER}/Pages/Sans page`;
    const mime = options.mimeOf?.(block.fileId) ?? block.mime;
    const dot = block.fileName.lastIndexOf('.');
    const hasExtension = dot > 0 && dot >= block.fileName.length - 6;
    const stem = hasExtension ? block.fileName.slice(0, dot) : block.fileName;
    const extension = hasExtension ? block.fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') || extensionFor(mime) : extensionFor(mime);
    place(folder, safeName(stem, stamp(block.createdAt)), extension, block.fileId);
  }

  return { files, notes, pages };
}

/** Every file Carnet's records point at (photos, link pictures, page files): a live record's, and a tombstoned one's when `keep` says so. */
export function notesFilesInUse(records: readonly StoredRecord[], keep: (record: StoredRecord) => boolean): Set<string> {
  const ids = new Set<string>();
  for (const record of records) {
    const live = record.fields.deletedAt === null || record.fields.deletedAt === undefined;
    if (!live && !keep(record)) continue;
    if (record.type === 'attachment') {
      ids.add(record.id);
    } else if (record.type === 'link' && Array.isArray(record.fields.imageIds)) {
      for (const id of record.fields.imageIds) if (typeof id === 'string') ids.add(id);
    } else if (record.type === 'block' && typeof record.fields.fileId === 'string') {
      ids.add(record.fields.fileId);
    }
  }
  return ids;
}
