/**
 * Contacts' photos: one picked (or dropped) in the form, kept in IndexedDB and shown from there at
 * once, then uploaded by the sync loop as Carnet's photos are (`contactsData.fileOwner`); and those
 * an import brings, after its batch: a picture's bytes kept the same way, a link fetched by the
 * server (`POST /api/contacts/photos`) and so already there.
 */
import { createId } from '@unlease/core/services/ids';
import type { ImportedPhoto, PlannedWrite } from '@unlease/contacts/services/importing';

import { storeFile } from '@shared/app/media/files';
import { primeBlobUrl } from '@shared/app/media/images';
import { useSettingsStore } from '@shared/app/store/settings';
import { requestSync } from '@shared/app/sync/loop';
import { takeContactPhoto } from '../api';
import { setPhotos, type PhotoFields } from '../store/actions';

/** The image types the server takes (as Carnet's photos). */
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif']);
/** The server's upload limit. */
const MAX_BYTES = 25 * 1024 * 1024;

const normalizeMime = (mime: string): string => (mime.toLowerCase() === 'image/jpg' ? 'image/jpeg' : mime.toLowerCase());

export function isAcceptedPhoto(file: { readonly type: string; readonly size: number }): boolean {
  return ALLOWED.has(normalizeMime(file.type)) && file.size > 0 && file.size <= MAX_BYTES;
}

/** A photo picked in the form: its id minted and shown at once; null for a file that is no photo the server takes. */
export function pickPhoto(file: File, now: number = Date.now()): { readonly id: string; readonly mime: string; readonly file: File } | null {
  if (!isAcceptedPhoto(file)) return null;
  const id = createId(now);
  primeBlobUrl(id, file);
  return { id, mime: normalizeMime(file.type), file };
}

/** The picked photo kept for its upload, once the contact wears it. */
export async function keepPhoto(id: string, file: Blob, mime: string): Promise<void> {
  await storeFile(id, file, mime);
  requestSync();
}

function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** At most this many photos asked of the server at once. */
const AT_ONCE = 4;

export interface PhotosOutcome {
  readonly taken: number;
  /** Links the server could not fetch, or not asked for (no server). */
  readonly missed: number;
}

/**
 * The photos an import's plan takes, after its batch: bytes kept here for the upload, links fetched
 * by the server (skipped without one); then every contact that still has no photo wears its own, in
 * one batch.
 */
export async function takeImportPhotos(writes: readonly PlannedWrite[], now: number = Date.now()): Promise<PhotosOutcome> {
  const wanted = writes.filter((write): write is PlannedWrite & { photo: ImportedPhoto } => write.photo !== null);
  const found: { contactId: string; photo: PhotoFields }[] = [];
  let missed = 0;
  const links: { contactId: string; url: string }[] = [];
  for (const write of wanted) {
    const photo = write.photo;
    if (photo.kind === 'data') {
      const mime = normalizeMime(photo.mime || 'image/jpeg');
      if (!ALLOWED.has(mime)) {
        missed += 1;
        continue;
      }
      try {
        const blob = new Blob([bytesOf(photo.base64)], { type: mime });
        const id = createId(now);
        await storeFile(id, blob, mime, now);
        primeBlobUrl(id, blob);
        found.push({ contactId: write.id, photo: { photoId: id, photoMime: mime, photoUploaded: false } });
      } catch {
        missed += 1;
      }
    } else if (photo.kind === 'url') {
      links.push({ contactId: write.id, url: photo.url });
    } else {
      missed += 1;
    }
  }
  const server = useSettingsStore.getState().server;
  if (server) {
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < links.length) {
        const link = links[next]!;
        next += 1;
        try {
          const taken = await takeContactPhoto(server, { url: link.url });
          found.push({ contactId: link.contactId, photo: { photoId: taken.id, photoMime: taken.mime, photoUploaded: true } });
        } catch {
          missed += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, links.length) }, worker));
  } else {
    missed += links.length;
  }
  const taken = found.length > 0 ? setPhotos(found) : 0;
  if (taken > 0) requestSync();
  return { taken, missed };
}
