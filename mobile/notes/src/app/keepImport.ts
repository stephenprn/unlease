/**
 * Keep import on the phone (its wizard, `ui/features/importing/KeepWizard`): pick the Takeout zip,
 * preview every note, choose what the notes made of links become, then write one batch of records.
 * The parsing, the preview and the records are the package's (`notes/services/keepImport`), shared
 * with the web. Photos become this phone's local files, so the sync loop uploads them like any
 * other; the export's other files are removed.
 */
import { t } from '@unlease/core/i18n';
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
import { saveLocalFile } from '@shared/data/repositories/fileRepository';
import { describeImage, pickKeepArchive, readText, removePath } from '@shared/platform/media';

import { forgetLocalPaths } from '@shared/app/hooks/useImageSource';
import { readingEnabled } from './store/actions';
import { deviceNode, getRecord, useLibraryStore, writeImported, writeLocal } from './store/libraryStore';
import type { RecordType } from '@unlease/notes/sync/types';

export interface PreparedImport {
  readonly plan: KeepPlan;
  readonly dir: string;
  /** Where each of the export's photos was extracted, by its path in the zip. */
  readonly images: ReadonlyMap<string, string>;
}

export type PrepareOutcome = { readonly status: 'ok'; readonly prepared: PreparedImport } | { readonly status: 'cancelled' } | { readonly status: 'error'; readonly message: string };

const basename = (path: string): string => path.split('/').pop() ?? path;

export async function prepareKeepImport(): Promise<PrepareOutcome> {
  const archive = await pickKeepArchive();
  if (archive.status === 'cancelled') return { status: 'cancelled' };
  if (archive.status !== 'ok') return { status: 'error', message: archive.message ? t(archive.message) : KEEP_WIZARD_WORDS.unreadableArchive };
  const files: { name: string; text: string }[] = [];
  const images = new Map<string, string>();
  for (const entry of archive.entries) {
    const base = basename(entry.name);
    if (isKeepDataFile(base)) files.push({ name: base, text: await readText(entry.path) });
    else images.set(entry.name, entry.path);
  }
  if (!files.some(file => /\.json$/i.test(file.name))) {
    await discardKeepImport({ dir: archive.dir, images });
    return { status: 'error', message: KEEP_WIZARD_WORDS.noKeepNotes };
  }
  return { status: 'ok', prepared: { plan: planKeepImport(files), dir: archive.dir, images } };
}

/** The extracted export, removed: an import cancelled leaves nothing behind. */
export async function discardKeepImport(prepared: Pick<PreparedImport, 'dir' | 'images'>, keep: ReadonlySet<string> = new Set()): Promise<void> {
  await removePath(prepared.dir);
  for (const path of prepared.images.values()) if (!keep.has(path)) await removePath(path);
}

/** Whether a record with this id is on this phone, live or deleted: an earlier import's (the preview's and the plan's). */
export const knownHere = (type: 'note' | 'link', id: string): boolean => getRecord(type as RecordType, id) !== undefined;

/** Notes an earlier import (here or on another device, once synced) brought already. */
export function alreadyHere(plan: KeepPlan): number {
  return alreadyImported(plan, knownHere);
}

export async function runKeepImport(prepared: PreparedImport, choices: KeepChoices, onProgress?: (done: number, total: number) => void, now: number = Date.now()): Promise<KeepReport> {
  const result = keepPlanToRecords(prepared.plan, {
    node: deviceNode(),
    now,
    library: useLibraryStore.getState(),
    known: knownHere,
    reading: readingEnabled(),
    ...choices,
    findFile: keepFileFinder(prepared.images.keys()),
  });
  writeImported(result.records, now);

  let photos = 0;
  let missing = 0;
  const kept = new Set<string>();
  for (const [index, upload] of result.uploads.entries()) {
    onProgress?.(index, result.uploads.length);
    const path = prepared.images.get(upload.file);
    if (!path) {
      missing += 1;
      continue;
    }
    const described = await describeImage(path);
    saveLocalFile({ id: upload.attachmentId, path, mime: upload.mime }, now);
    kept.add(path);
    if (described) {
      writeLocal([{ type: 'attachment', id: upload.attachmentId, patch: { width: described.width, height: described.height, bytes: described.bytes } }], now);
    }
    photos += 1;
  }
  onProgress?.(result.uploads.length, result.uploads.length);
  forgetLocalPaths();
  // The JSON, and the photos no note took (the bin's, an earlier import's), are not kept.
  await discardKeepImport(prepared, kept);
  return { ...result.report, photos, missingPhotos: result.report.missingPhotos + missing };
}
