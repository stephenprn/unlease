/** Photos into notes: kept on this phone's disk until the sync loop uploads them. */
import { t } from '@unlease/core/i18n';
import { createId } from '@unlease/core/services/ids';
import { saveLocalFile } from '@shared/data/repositories/fileRepository';
import { capturePhoto, describeImage, pickImages, type MediaFile } from '@shared/platform/media';

import { forgetLocalPaths } from '@shared/app/hooks/useImageSource';
import { addAttachment, captureNote, type CapturedNote } from './store/actions';
import { requestSync } from '@shared/app/sync/syncManager';

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

/** A note written over the home screen with the photos picked for it, in one change; their files go up with the next sync. */
export function captureNoteWith(note: Omit<CapturedNote, 'photos'>, files: readonly MediaFile[], now: number = Date.now()): string {
  const photos = files.map(file => {
    const id = createId(now);
    saveLocalFile({ id, path: file.path, mime: mimeOf(file) }, now);
    return { id, mime: mimeOf(file), width: file.width, height: file.height, bytes: file.bytes };
  });
  const id = captureNote({ ...note, photos }, now);
  if (photos.length > 0) {
    forgetLocalPaths();
    requestSync();
  }
  return id;
}

/** Photos picked or taken, not yet in a note: the outcome `pickInto` gives, with the files themselves. */
export type PhotosOutcome = { readonly status: 'ok'; readonly files: readonly MediaFile[] } | { readonly status: 'cancelled' } | { readonly status: 'error'; readonly message: string };

export async function pickPhotos(source: 'gallery' | 'camera'): Promise<PhotosOutcome> {
  const result = source === 'camera' ? await capturePhoto() : await pickImages(10);
  if (result.status === 'cancelled') return { status: 'cancelled' };
  if (result.status !== 'ok') return { status: 'error', message: result.message ? t(result.message) : t('Couldn’t add the photo') };
  if (result.files.length === 0) return { status: 'error', message: t('This photo couldn’t be read') };
  return { status: 'ok', files: result.files };
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
  const picked = await pickPhotos(source);
  return picked.status === 'ok' ? { status: 'ok', count: attachFiles(noteId, picked.files) } : picked;
}
