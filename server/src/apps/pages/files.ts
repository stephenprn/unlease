/**
 * Where Pages' files go in a readable tree, the same in the drive (Seafile) and in a backup
 * archive, under a folder named after the app and the pages that hold them:
 * `Pages/<page>/<sub-page>/<file name>`. Names come from titles (`blobs/names`), oldest first, so a
 * name never moves to another page.
 */
import { APP_NAME } from '@unlease/pages/brand';
import { UNTITLED_PAGE, type Block } from '@unlease/pages/models/blocks';
import { blockFromRecord } from '@unlease/pages/sync/entities';
import { isPagesType } from '@unlease/pages/sync/types';
import { extensionFor, safeName, stamp, uniqueName } from '../../blobs/names';
import type { StoredRecord } from '../../sync/records';
import type { FilesOptions } from '../types';

/** The app's own folder in the drive and in an archive. */
export const FOLDER = APP_NAME;

/** Pages' live blocks, from every record the server holds (read in one go). */
export function readBlocks(all: readonly StoredRecord[]): Block[] {
  return all.filter(record => isPagesType(record.type)).map(blockFromRecord).filter(block => block.deletedAt === null);
}

export interface PagesLayout {
  /** Blob id -> its path in the tree, for files a live block points at. */
  readonly files: ReadonlyMap<string, string>;
  /** Page id -> `Pages/<page>/<sub-page>`. */
  readonly pages: ReadonlyMap<string, string>;
}

const byAge = <T extends { readonly createdAt: number; readonly id: string }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export function layoutPages(blocks: readonly Block[], options: FilesOptions): PagesLayout {
  const files = new Map<string, string>();
  const pages = new Map<string, string>();
  const byId = new Map(blocks.map(block => [block.id, block]));
  // The page a block sits in, through columns, toggles and list items.
  const containingPage = (id: string | null): Block | null => {
    let current = id ? byId.get(id) : undefined;
    for (let guard = 0; current && guard < 200; guard += 1) {
      if (current.kind === 'page') return current;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return null;
  };
  const subPages = new Map<string, Block[]>();
  for (const block of blocks) {
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
  namePages('', FOLDER, 0);

  const inFolder = new Map<string, Set<string>>();
  for (const block of byAge(blocks)) {
    if (!block.fileId || block.kind === 'page') continue;
    const page = containingPage(block.parentId);
    const folder = (page && pages.get(page.id)) ?? `${FOLDER}/Sans page`;
    const mime = options.mimeOf?.(block.fileId) ?? block.mime;
    const dot = block.fileName.lastIndexOf('.');
    const hasExtension = dot > 0 && dot >= block.fileName.length - 6;
    const stem = hasExtension ? block.fileName.slice(0, dot) : block.fileName;
    const extension = hasExtension ? block.fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') || extensionFor(mime) : extensionFor(mime);
    const taken = inFolder.get(folder) ?? new Set<string>();
    inFolder.set(folder, taken);
    files.set(block.fileId, `${folder}/${uniqueName(safeName(stem, stamp(block.createdAt)), taken, extension)}`);
  }
  return { files, pages };
}

/** Every file a block points at (pictures, videos, PDFs, files): a live block's, and a tombstoned one's when `keep` says so. */
export function pagesFilesInUse(records: readonly StoredRecord[], keep: (record: StoredRecord) => boolean): Set<string> {
  const ids = new Set<string>();
  for (const record of records) {
    if (record.type !== 'block' || typeof record.fields.fileId !== 'string') continue;
    const live = record.fields.deletedAt === null || record.fields.deletedAt === undefined;
    if (live || keep(record)) ids.add(record.fields.fileId);
  }
  return ids;
}
