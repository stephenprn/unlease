/**
 * A page's pictures, videos, PDFs and files: kept in this browser until the server has them, as a
 * note's photos are, and uploaded by the sync loop (a picture through the image route, which makes
 * its display copy; anything else as it is). Until then the page shows this browser's copy.
 */
import { t } from '@unlease/core/i18n';
import { createId } from '@unlease/core/services/ids';
import { isUploadableImage, MAX_FILE_BYTES } from '@unlease/notes/services/media';

import { setBlockFile } from '../store/pages';
import { useSettingsStore } from '../store/settings';
import { requestSync } from '../sync/loop';
import { downloadBlob } from '../sync/transport';
import { imageSize, normalizeMime } from './attach';
import { readStoredFile, storeFile } from './files';
import { primeBlobUrl } from './images';

/** The server's limit for a picture it decodes. */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export type FileOutcome = 'ok' | 'empty' | 'too-large';

export async function attachBlockFile(page: string, blockId: string, file: File, now: number = Date.now()): Promise<FileOutcome> {
  const mime = normalizeMime(file.type || 'application/octet-stream');
  const image = isUploadableImage(mime);
  if (file.size === 0) return 'empty';
  if (file.size > (image ? MAX_IMAGE_BYTES : MAX_FILE_BYTES)) return 'too-large';
  const { width, height } = image ? await imageSize(file) : { width: 0, height: 0 };
  const fileId = createId(now);
  await storeFile(fileId, file, mime, now);
  // Shown from here at once: a picture, a video or a PDF (never a page the browser would run).
  if (image || mime.startsWith('video/') || mime === 'application/pdf') primeBlobUrl(fileId, file);
  setBlockFile(page, blockId, { fileId, fileName: file.name || 'fichier', mime, bytes: file.size, width, height });
  requestSync();
  return 'ok';
}

/** What a refused file says, in the slip. */
export function fileRefusal(outcome: Exclude<FileOutcome, 'ok'>, image: boolean): string {
  if (outcome === 'empty') return t('Ce fichier est vide.');
  return image ? t('Cette image dépasse 25 Mo.') : t('Ce fichier dépasse 100 Mo.');
}

/** A page's file saved to this computer: this browser's copy while it uploads, the server's after. */
export async function saveBlockFile(fileId: string, fileName: string): Promise<boolean> {
  const local = await readStoredFile(fileId).catch(() => null);
  const server = useSettingsStore.getState().server;
  const blob = local ?? (server ? await downloadBlob(server, fileId, 'original').catch(() => null) : null);
  if (!blob) return false;
  // As bytes to save, never as a page the browser would open and run.
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'fichier';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}
