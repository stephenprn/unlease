/**
 * Moving in from Google Keep, in the browser: drop the Takeout .zip (or several, or the Keep
 * folder's files themselves), read its Keep folder, then (once the wizard has shown every note and
 * asked what the notes made of links become) write it all as one batch of records. The parsing,
 * the preview and the records are the package's (`notes/services/keepImport`), shared with the
 * phone; this file only reads the archive and stores the photos.
 *
 * Photos are kept in IndexedDB as this browser's own files, so the sync loop uploads them like any
 * photo added here.
 */
import {
  alreadyImported,
  isKeepDataFile,
  KEEP_WIZARD_WORDS,
  keepFileFinder,
  keepPlanToRecords,
  planKeepImport,
  type KeepChoices,
  type KeepPlan,
  type KeepReport,
} from '@unlease/notes/services/keepImport';

export type { KeepChoices } from '@unlease/notes/services/keepImport';

import { imageSize, normalizeMime } from '../media/attach';
import { storeFile } from '@shared/app/media/files';
import { readingEnabled } from '../store/actions';
import { clockNode, getRecord, writeImported, writeLocal } from '@shared/app/store/records';
import { useLibraryStore } from '../store/library';
import { requestSync } from '@shared/app/sync/loop';
import { unzipKeep } from './unzip';

export class KeepImportError extends Error {}

export interface PreparedImport {
  readonly plan: KeepPlan;
  /** The export's other files (photos), by their path in it. */
  readonly files: ReadonlyMap<string, Uint8Array>;
}

const basename = (path: string): string => path.split('/').pop() ?? path;
const isZip = (file: File | Blob): boolean => /\.zip$/i.test((file as File).name ?? '') || /zip/.test(file.type);

/**
 * Reads one or more Takeout archives (Takeout splits a large export), or the Keep folder's files
 * picked or dropped as they are.
 */
export async function readKeepArchive(input: Blob | readonly (File | Blob)[]): Promise<PreparedImport> {
  const given = Array.isArray(input) ? (input as readonly (File | Blob)[]) : [input as Blob];
  const entries = new Map<string, Uint8Array>();
  for (const file of given) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = (file as File).name ?? '';
    // A file that is not a zip and is named like the export's own files is one of them.
    if (!isZip(file) && name && (isKeepDataFile(name) || /\.(jpe?g|png|webp|gif|heic|avif)$/i.test(name))) {
      entries.set(`Keep/${name}`, bytes);
      continue;
    }
    try {
      for (const [path, data] of Object.entries(await unzipKeep(bytes))) entries.set(path, data);
    } catch {
      throw new KeepImportError(KEEP_WIZARD_WORDS.unreadableArchive);
    }
  }
  const decoder = new TextDecoder();
  const data: { name: string; text: string }[] = [];
  const files = new Map<string, Uint8Array>();
  for (const [path, bytes] of entries) {
    if (isKeepDataFile(basename(path))) data.push({ name: basename(path), text: decoder.decode(bytes) });
    else if (!/\.html?$/i.test(path)) files.set(path, bytes);
  }
  if (!data.some(file => /\.json$/i.test(file.name))) {
    throw new KeepImportError(KEEP_WIZARD_WORDS.noKeepNotes);
  }
  return { plan: planKeepImport(data), files };
}

/** Whether a record with this id is in this browser's library, live or deleted: an earlier import's (here, or on another device once synced). */
export const knownHere = (type: string, id: string): boolean => getRecord(type, id) !== undefined;

/** Notes an earlier import (here or on another device, once synced) brought already. */
export function alreadyHere(plan: KeepPlan): number {
  return alreadyImported(plan, knownHere);
}

export async function runKeepImport(
  prepared: PreparedImport,
  choices: KeepChoices,
  onProgress?: (done: number, total: number) => void,
  now: number = Date.now(),
): Promise<KeepReport> {
  const result = keepPlanToRecords(prepared.plan, {
    node: clockNode(),
    now,
    library: useLibraryStore.getState(),
    known: knownHere,
    reading: readingEnabled(),
    ...choices,
    findFile: keepFileFinder(prepared.files.keys()),
  });
  writeImported(result.records, now);

  let photos = 0;
  let missing = 0;
  for (const [index, upload] of result.uploads.entries()) {
    onProgress?.(index, result.uploads.length);
    const bytes = prepared.files.get(upload.file);
    if (!bytes) {
      missing += 1;
      continue;
    }
    const mime = normalizeMime(upload.mime);
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
    const { width, height } = await imageSize(blob);
    await storeFile(upload.attachmentId, blob, mime, now);
    writeLocal([{ type: 'attachment', id: upload.attachmentId, patch: { width, height, bytes: blob.size } }], now);
    photos += 1;
  }
  onProgress?.(result.uploads.length, result.uploads.length);
  requestSync();
  return { ...result.report, photos, missingPhotos: result.report.missingPhotos + missing };
}
