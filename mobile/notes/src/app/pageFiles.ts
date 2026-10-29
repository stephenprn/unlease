/**
 * A page's pictures, videos, PDFs and files from the phone: kept on its disk until the sync loop
 * uploads them (a picture through the photo route, which makes its display copy; anything else as
 * it is, `PUT /api/files`), as a note's photos are. Until then the page shows this phone's copy.
 */
import { t } from '@unlease/core/i18n';
import type { MediaKind } from '@unlease/notes/models/blocks';
import { createId } from '@unlease/core/services/ids';
import { isUploadableImage, MAX_FILE_BYTES } from '@unlease/notes/services/media';
import { authHeader } from '@unlease/core/sync/protocol';
import { loadLocalFiles, markFileUploaded, saveLocalFile } from '@data/repositories/fileRepository';
import { pickDocument } from '@platform/documents';
import { pickImages, removePath } from '@platform/media';

import { forgetLocalPaths } from './hooks/useImageSource';
import { useLibraryStore } from './store/libraryStore';
import { markBlockFileUploaded, setBlockFile } from './store/pages';
import type { ServerConfig } from './store/settingsStore';
import { SyncError, uploadFile as uploadPhoto } from './sync/transport';

export type AttachOutcome = { readonly status: 'ok' | 'cancelled' } | { readonly status: 'error'; readonly message: string };

/** What the system's document picker offers for each kind. */
const PICKED_TYPES: Record<Exclude<MediaKind, 'image'>, readonly string[]> = {
  video: ['video/*'],
  pdf: ['application/pdf'],
  file: ['*/*'],
};

/** The picker names a file but not its type: read from its extension. */
const TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  avif: 'image/avif',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
};

function mimeFromName(name: string): string {
  const extension = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  return TYPES_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

const baseName = (path: string): string => path.split('/').filter(Boolean).pop() ?? 'image';

/** A picture from the system's photo picker, upright and at most 2560 px, into the block. */
export async function attachPickedImage(page: string, blockId: string, now: number = Date.now()): Promise<AttachOutcome> {
  const result = await pickImages(1);
  if (result.status === 'cancelled') return { status: 'cancelled' };
  const file = result.files[0];
  if (result.status !== 'ok' || !file) return { status: 'error', message: result.message ? t(result.message) : t('Impossible d’ajouter la photo') };
  const fileId = createId(now);
  saveLocalFile({ id: fileId, path: file.path, mime: file.mime }, now);
  forgetLocalPaths();
  setBlockFile(page, blockId, { fileId, fileName: baseName(file.path), mime: file.mime, bytes: file.bytes, width: file.width, height: file.height });
  return { status: 'ok' };
}

/** A video, a PDF or any file from the system's document picker, into the block. */
export async function attachPickedDocument(page: string, blockId: string, kind: Exclude<MediaKind, 'image'>, now: number = Date.now()): Promise<AttachOutcome> {
  const picked = await pickDocument(PICKED_TYPES[kind]);
  if (picked.status === 'cancelled') return { status: 'cancelled' };
  if (picked.status !== 'ok' || !picked.path) return { status: 'error', message: picked.message ? t(picked.message) : t('Fichier illisible') };
  const refusal = picked.bytes === 0 ? t('Ce fichier est vide.') : picked.bytes > MAX_FILE_BYTES ? t('Ce fichier dépasse 100 Mo.') : null;
  if (refusal) {
    await removePath(picked.path);
    return { status: 'error', message: refusal };
  }
  const fileId = createId(now);
  const mime = mimeFromName(picked.name);
  saveLocalFile({ id: fileId, path: picked.path, mime }, now);
  forgetLocalPaths();
  setBlockFile(page, blockId, { fileId, fileName: picked.name || 'fichier', mime, bytes: picked.bytes, width: 0, height: 0 });
  return { status: 'ok' };
}

/** Long enough for 100 Mo on a slow uplink. */
const FILE_UPLOAD_TIMEOUT_MS = 10 * 60_000;

/** A page's video, PDF or file, kept by the server as it is. */
async function uploadPageFile(config: ServerConfig, file: { readonly id: string; readonly path: string; readonly mime: string }, name: string): Promise<void> {
  const form = new FormData();
  // React Native's FormData streams the file from disk (hence the `Blob` cast).
  form.append('file', { uri: file.path.startsWith('file://') ? file.path : `file://${file.path}`, type: file.mime, name: name || file.id } as unknown as Blob);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FILE_UPLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${config.url}/api/files/${encodeURIComponent(file.id)}`, { method: 'PUT', headers: authHeader(config.token), body: form, signal: abort.signal });
  } catch {
    throw new SyncError('network', t('Serveur injoignable'));
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401) throw new SyncError('unauthorized', t('Jeton refusé'));
  if (!response.ok) throw new SyncError('http', t('Envoi refusé ({status})', { status: response.status }), response.status);
}

/** Files the server refused (too large, unreadable): not retried until the app starts again. */
const refused = new Set<string>();

const isRefusal = (error: unknown): boolean =>
  error instanceof SyncError && error.kind === 'http' && error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;

/**
 * The files of page blocks kept here and not yet sent, sent; called by the sync loop beside the
 * note photos' uploads (whose files have an attachment record; these have a block instead).
 */
export async function uploadPendingPageFiles(config: ServerConfig): Promise<void> {
  const { attachments, blocks } = useLibraryStore.getState();
  for (const file of loadLocalFiles()) {
    if (file.uploaded || refused.has(file.id) || attachments[file.id]) continue;
    const owners = Object.values(blocks).filter(block => block.fileId === file.id);
    // A file whose block never made it (a crash between the two writes) waits.
    if (owners.length === 0) continue;
    const live = owners.find(block => block.deletedAt === null);
    if (!live) {
      markFileUploaded(file.id);
      continue;
    }
    try {
      if (isUploadableImage(file.mime)) await uploadPhoto(config, file);
      else await uploadPageFile(config, file, live.fileName);
    } catch (error) {
      if (!isRefusal(error)) throw error;
      refused.add(file.id);
      continue;
    }
    markFileUploaded(file.id);
    if (owners.some(block => !block.uploaded)) markBlockFileUploaded(file.id);
  }
}
