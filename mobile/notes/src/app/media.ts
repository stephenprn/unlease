/** Photos into notes: kept on this phone's disk until the sync loop uploads them. */
import { t } from '@unlease/core/i18n';
import { createId } from '@unlease/core/services/ids';
import { saveLocalFile } from '@data/repositories/fileRepository';
import { capturePhoto, describeImage, pickImages, type MediaFile } from '@platform/media';

import { forgetLocalPaths } from './hooks/useImageSource';
import { addAttachment } from './store/actions';
import { requestSync } from './sync/syncManager';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif']);

function mimeOf(file: MediaFile): string {
  const mime = file.mime === 'image/jpg' ? 'image/jpeg' : file.mime;
  return ALLOWED.has(mime) ? mime : 'image/jpeg';
}

export function attachFiles(noteId: string, files: readonly MediaFile[], now: number = Date.now()): number {
  for (const file of files) {
    const id = createId(now);
    saveLocalFile({ id, path: file.path, mime: mimeOf(file) }, now);
    addAttachment(noteId, { id, mime: mimeOf(file), width: file.width, height: file.height, bytes: file.bytes }, now);
  }
  forgetLocalPaths();
  if (files.length > 0) requestSync();
  return files.length;
}

export async function attachSharedPaths(noteId: string, paths: readonly string[]): Promise<number> {
  const files: MediaFile[] = [];
  for (const path of paths) {
    const described = await describeImage(path);
    if (described) files.push(described);
  }
  return attachFiles(noteId, files);
}

export type PickOutcome = { readonly status: 'ok'; readonly count: number } | { readonly status: 'cancelled' } | { readonly status: 'error'; readonly message: string };

export async function pickInto(noteId: string, source: 'gallery' | 'camera'): Promise<PickOutcome> {
  const result = source === 'camera' ? await capturePhoto() : await pickImages(10);
  if (result.status === 'cancelled') return { status: 'cancelled' };
  if (result.status !== 'ok') return { status: 'error', message: result.message ? t(result.message) : t('Impossible d’ajouter la photo') };
  if (result.files.length === 0) return { status: 'error', message: t('Cette photo n’a pas pu être lue') };
  return { status: 'ok', count: attachFiles(noteId, result.files) };
}
