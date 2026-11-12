/**
 * Contacts' photos: picked from the gallery or taken with the camera (the suite's Media module), or
 * brought in by an import; kept on this phone's disk until the sync loop uploads them through the
 * platform's photo route (`PUT /api/blobs/<id>`, which makes the display copy), as a note's photos
 * are. Until then the contact shows this phone's copy; once sent, `photoUploaded` tells the others.
 */
import { t } from '@unlease/core/i18n';
import { createId } from '@unlease/core/services/ids';
import { loadLocalFiles, markFileUploaded, removeLocalFile, saveLocalFile } from '@shared/data/repositories/fileRepository';
import { capturePhoto, pickImages, removePath } from '@shared/platform/media';
import { forgetLocalPaths } from '@shared/app/hooks/useImageSource';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { addSyncTask, requestSync } from '@shared/app/sync/syncManager';

import { markContactPhotosUploaded } from './store/actions';
import { useLibraryStore } from './store/libraryStore';
import { SyncError, uploadFile } from './sync/transport';
import { later } from './later';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface KeptPhoto {
  readonly id: string;
  readonly mime: string;
}

/** A picture already in the app's storage, kept until it uploads; its blob id. */
export function keepPhoto(path: string, mime: string, now: number = Date.now()): KeptPhoto {
  const id = createId(now);
  const kind = mime === 'image/jpg' ? 'image/jpeg' : ALLOWED.has(mime) ? mime : 'image/jpeg';
  saveLocalFile({ id, path, mime: kind }, now);
  forgetLocalPaths();
  return { id, mime: kind };
}

export type PickedPhoto = { readonly status: 'ok'; readonly photo: KeptPhoto } | { readonly status: 'cancelled' } | { readonly status: 'error'; readonly message: string };

/** One picture from the gallery or the camera, upright, kept for a contact (not yet written to it). */
export async function pickPhoto(source: 'gallery' | 'camera'): Promise<PickedPhoto> {
  const result = source === 'camera' ? await capturePhoto() : await pickImages(1);
  if (result.status === 'cancelled') return { status: 'cancelled' };
  const file = result.files[0];
  if (result.status !== 'ok' || !file) return { status: 'error', message: result.message ? t(result.message) : t('Impossible d’ajouter la photo') };
  return { status: 'ok', photo: keepPhoto(file.path, file.mime) };
}

/** Photos the server refused (too large, unreadable): not retried until the app starts again. */
const refused = new Set<string>();

const isRefusal = (error: unknown): boolean =>
  error instanceof SyncError && error.kind === 'http' && error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;

/** The photos kept here and not yet sent, sent; run by the sync loop after each exchange. */
export async function uploadPendingPhotos(config: ServerConfig): Promise<void> {
  const { contacts } = useLibraryStore.getState();
  const owners = new Map<string, boolean>();
  for (const contact of Object.values(contacts)) if (contact.photoId) owners.set(contact.photoId, (owners.get(contact.photoId) ?? false) || contact.deletedAt === null);
  for (const file of loadLocalFiles()) {
    if (file.uploaded || refused.has(file.id)) continue;
    const live = owners.get(file.id);
    // A photo not yet on a contact (picked, the form still open) waits; one whose contact went is let go.
    if (live === undefined) continue;
    if (!live) {
      markFileUploaded(file.id);
      continue;
    }
    try {
      await uploadFile(config, file);
    } catch (error) {
      if (!isRefusal(error)) throw error;
      refused.add(file.id);
      continue;
    }
    markFileUploaded(file.id);
    markContactPhotosUploaded(file.id);
  }
}

/** Photos kept here that `uploadPendingPhotos` would still send: the sync counts them as waiting. */
function photosWaiting(): number {
  const live = new Set<string>();
  for (const contact of Object.values(useLibraryStore.getState().contacts)) if (contact.photoId && contact.deletedAt === null) live.add(contact.photoId);
  return loadLocalFiles().filter(file => !file.uploaded && !refused.has(file.id) && live.has(file.id)).length;
}

let added = false;

/** Once, at start (bootstrap): after each exchange, the photos kept here go up. */
export function startPhotoUploads(): void {
  if (added) return;
  added = true;
  addSyncTask({ run: uploadPendingPhotos, restart: () => refused.clear(), pending: photosWaiting });
}

/** A photo just written to a contact: the sync may send it now. */
export const photoWritten = (): void => requestSync();

/**
 * A photo kept here that no contact wears any more (replaced or removed before it was sent, or picked
 * in a form that was left): its file goes, and it leaves the queue. One a contact still wears, or
 * that the server has already, stays.
 */
export function dropPhoto(id: string): void {
  if (Object.values(useLibraryStore.getState().contacts).some(contact => contact.photoId === id)) return;
  const file = loadLocalFiles().find(entry => entry.id === id);
  if (!file || file.uploaded) return;
  removeLocalFile(id);
  forgetLocalPaths();
  later(removePath(file.path));
}

/** A contact's photo changed (saved from its form): the new one goes out, the old one, never sent, goes. */
export function photoReplaced(before: string | null, after: string | null): void {
  if (after) photoWritten();
  if (before && before !== after) dropPhoto(before);
}
