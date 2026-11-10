/**
 * An event's files (a ticket, a programme, a picture): kept in this browser until the server has
 * them, as a page's files are, and uploaded by the sync loop (a picture through the image route,
 * which makes its display copy; anything else as it is, `fileOwner` in `data.ts`). The server lays
 * them in the drive under `Agenda/`.
 */
import { t } from '@unlease/core/i18n';
import { createId } from '@unlease/core/services/ids';
import type { EventFile } from '@unlease/calendar/models/events';
import { isUploadableImage, MAX_FILE_BYTES } from '@unlease/pages/services/media';

import { readStoredFile, storeFile } from '@shared/app/media/files';
import { primeBlobUrl } from '@shared/app/media/images';
import { useSettingsStore } from '@shared/app/store/settings';
import { requestSync } from '@shared/app/sync/loop';
import { downloadBlob } from '@shared/app/sync/transport';

/** The server's limit for a picture it decodes. */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** `image/jpg` as the browser may say it, read as its proper type. */
const normalizeMime = (mime: string): string => (mime === 'image/jpg' ? 'image/jpeg' : mime.toLowerCase().split(';')[0]!.trim() || 'application/octet-stream');

/** A file picked, kept here; its entry for the event's `files`, or why not. */
export async function keepEventFile(file: File, now: number = Date.now()): Promise<EventFile | string> {
  const mime = normalizeMime(file.type || 'application/octet-stream');
  const image = isUploadableImage(mime);
  if (file.size === 0) return t('Ce fichier est vide.');
  if (file.size > (image ? MAX_IMAGE_BYTES : MAX_FILE_BYTES)) return image ? t('Cette image dépasse 25 Mo.') : t('Ce fichier dépasse 100 Mo.');
  const id = createId(now);
  await storeFile(id, file, mime, now);
  if (image || mime === 'application/pdf') primeBlobUrl(id, file);
  return { id, name: (file.name || t('Fichier')).slice(0, 255), mime, bytes: file.size, uploaded: false };
}

/** Once the event holding it is saved: the sync loop sends it. */
export const sendFiles = (): void => requestSync();

/** A file saved to this computer: this browser's copy while it uploads, the server's after. */
export async function saveEventFile(file: EventFile): Promise<boolean> {
  const local = await readStoredFile(file.id).catch(() => null);
  const server = useSettingsStore.getState().server;
  const blob = local ?? (server && file.uploaded ? await downloadBlob(server, file.id, 'original').catch(() => null) : null);
  if (!blob) return false;
  // As bytes to save, never as a page the browser would open and run.
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name || 'fichier';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}
