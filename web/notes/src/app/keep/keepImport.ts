/**
 * Moving in from Google Keep, in the browser: drop the Takeout .zip, read its
 * Keep folder, show what is in it, then write it all as one batch of records.
 * The parsing and the records are core's (`notes/services/keepImport`), shared
 * with the phone; this file only reads the archive and stores the photos.
 *
 * Photos are kept in IndexedDB as this browser's own files, so the sync loop
 * uploads them like any photo added here.
 */
import { t } from '@unlease/core/i18n';
import { LINE_COLORS, nextLineColor, type LineColor } from '@unlease/design/colors';
import { keepPlanToRecords, planKeepImport, type KeepPlan } from '@unlease/notes/services/keepImport';

import { imageSize, normalizeMime } from '../media/attach';
import { storeFile } from '../media/files';
import { readingEnabled } from '../store/actions';
import { clockNode, useLibraryStore, writeImported, writeLocal } from '../store/library';
import { requestSync } from '../sync/loop';
import { unzipKeep } from './unzip';

export class KeepImportError extends Error {}

export interface PreparedImport {
  readonly plan: KeepPlan;
  /** Image bytes in the archive, by the file name Keep's JSON uses for them. */
  readonly images: ReadonlyMap<string, Uint8Array>;
}

const basename = (path: string): string => path.split('/').pop() ?? path;

export async function readKeepArchive(file: Blob): Promise<PreparedImport> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = await unzipKeep(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new KeepImportError(t('Archive illisible : choisissez le fichier .zip téléchargé depuis Google Takeout.'));
  }
  const decoder = new TextDecoder();
  const files: { name: string; text: string }[] = [];
  const images = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(entries)) {
    const name = basename(path);
    if (name.toLowerCase().endsWith('.json')) files.push({ name, text: decoder.decode(data) });
    else images.set(name, data);
  }
  if (files.length === 0) {
    throw new KeepImportError(t('Aucune note Keep dans cette archive. Exportez « Keep » depuis Google Takeout.'));
  }
  return { plan: planKeepImport(files), images };
}

export function linkOnlyCount(plan: KeepPlan): number {
  return plan.notes.filter(note => note.onlyUrl).length;
}

export function photoCount(plan: KeepPlan): number {
  return plan.notes.reduce((count, note) => count + note.attachments.length, 0);
}

export interface ImportCounts {
  readonly notes: number;
  readonly links: number;
  readonly photos: number;
}

export async function runKeepImport(prepared: PreparedImport, convertLinks: boolean, now: number = Date.now()): Promise<ImportCounts> {
  const state = useLibraryStore.getState();
  const existingLabels = state.labelOrder
    .map(id => state.labels[id])
    .filter(label => !!label)
    .map(label => ({ id: label!.id, name: label!.name }));
  const used: (LineColor | null)[] = existingLabels.map(label => state.labels[label.id]?.color ?? null);
  const labelColors: LineColor[] = [];
  for (let i = 0; i < LINE_COLORS.length; i += 1) labelColors.push(nextLineColor([...used, ...labelColors]));
  const first = state.noteOrder.map(id => state.notes[id]).find(note => note && note.kind !== 'links');

  const result = keepPlanToRecords(prepared.plan, {
    node: clockNode(),
    now,
    existingLabels,
    labelColors,
    firstPosition: first?.position ?? null,
    convertLinks,
  });
  // A server that does not read links keeps them plain where they land, as `addLink` does.
  const reading = readingEnabled();
  const records = reading
    ? result.records
    : result.records.map(record => (record.type === 'link' ? { ...record, fields: { ...record.fields, status: 'skipped', autoFile: false } } : record));
  writeImported(records, now);

  let photos = 0;
  for (const upload of result.uploads) {
    const bytes = prepared.images.get(basename(upload.filePath));
    if (!bytes) continue;
    const mime = normalizeMime(upload.mime);
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
    const { width, height } = await imageSize(blob);
    await storeFile(upload.attachmentId, blob, mime, now);
    writeLocal([{ type: 'attachment', id: upload.attachmentId, patch: { width, height, bytes: blob.size } }], now);
    photos += 1;
  }
  requestSync();
  return { notes: result.noteCount, links: result.linkCount, photos };
}
