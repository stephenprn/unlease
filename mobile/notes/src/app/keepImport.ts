/**
 * Keep import on the phone: pick the Takeout zip, preview it, then write one batch of records.
 * Photos become this phone's local files, so the sync loop uploads them like any other.
 */
import { t } from '@unlease/core/i18n';
import { nextLineColor, LINE_COLORS, type LineColor } from '@unlease/design/colors';
import { keepPlanToRecords, planKeepImport, type KeepPlan } from '@unlease/notes/services/keepImport';
import { saveLocalFile } from '@data/repositories/fileRepository';
import { describeImage, pickKeepArchive, readText, removePath } from '@platform/media';

import { forgetLocalPaths } from './hooks/useImageSource';
import { readingEnabled } from './store/actions';
import { deviceNode, useLibraryStore, writeImported, writeLocal } from './store/libraryStore';

export interface PreparedImport {
  readonly plan: KeepPlan;
  readonly dir: string;
  /** Archive image paths, keyed by the file name Keep's JSON uses. */
  readonly images: ReadonlyMap<string, string>;
}

export type PrepareOutcome = { readonly status: 'ok'; readonly prepared: PreparedImport } | { readonly status: 'cancelled' } | { readonly status: 'error'; readonly message: string };

export async function prepareKeepImport(): Promise<PrepareOutcome> {
  const archive = await pickKeepArchive();
  if (archive.status === 'cancelled') return { status: 'cancelled' };
  if (archive.status !== 'ok') return { status: 'error', message: archive.message ? t(archive.message) : t('Archive illisible') };
  const files: { name: string; text: string }[] = [];
  const images = new Map<string, string>();
  for (const entry of archive.entries) {
    const base = entry.name.split('/').pop() ?? entry.name;
    if (base.toLowerCase().endsWith('.json')) files.push({ name: base, text: await readText(entry.path) });
    else images.set(base, entry.path);
  }
  if (files.length === 0) {
    await removePath(archive.dir);
    return { status: 'error', message: t('Aucune note Keep dans cette archive. Exportez « Keep » depuis Google Takeout.') };
  }
  return { status: 'ok', prepared: { plan: planKeepImport(files), dir: archive.dir, images } };
}

export function linkOnlyCount(plan: KeepPlan): number {
  return plan.notes.filter(note => note.onlyUrl).length;
}

export async function runKeepImport(prepared: PreparedImport, convertLinks: boolean, now: number = Date.now()): Promise<{ notes: number; links: number; photos: number }> {
  const state = useLibraryStore.getState();
  const existingLabels = state.labelOrder.map(id => state.labels[id]).filter(l => !!l).map(l => ({ id: l!.id, name: l!.name }));
  const used: (LineColor | null)[] = existingLabels.map(l => state.labels[l.id]?.color ?? null);
  const labelColors: LineColor[] = [];
  for (let i = 0; i < LINE_COLORS.length; i += 1) {
    const color = nextLineColor([...used, ...labelColors]);
    labelColors.push(color);
  }
  const first = state.noteOrder.map(id => state.notes[id]).find(n => n && n.kind !== 'links');
  const result = keepPlanToRecords(prepared.plan, {
    node: deviceNode(),
    now,
    existingLabels,
    labelColors,
    firstPosition: first?.position ?? null,
    convertLinks,
  });
  // A server that does not read links keeps them plain where they land, as `addLink` does.
  const records = readingEnabled()
    ? result.records
    : result.records.map(record => (record.type === 'link' ? { ...record, fields: { ...record.fields, status: 'skipped', autoFile: false } } : record));
  writeImported(records, now);

  let photos = 0;
  for (const upload of result.uploads) {
    const path = prepared.images.get(upload.filePath.split('/').pop() ?? upload.filePath);
    if (!path) continue;
    const described = await describeImage(path);
    saveLocalFile({ id: upload.attachmentId, path, mime: upload.mime === 'image/jpg' ? 'image/jpeg' : upload.mime }, now);
    if (described) {
      writeLocal([{ type: 'attachment', id: upload.attachmentId, patch: { width: described.width, height: described.height, bytes: described.bytes } }], now);
    }
    photos += 1;
  }
  forgetLocalPaths();
  return { notes: result.noteCount, links: result.linkCount, photos };
}
