/**
 * The files joined to an event (a ticket, a programme, a photo): picked here, kept on the phone's
 * disk until the sync loop uploads them (a picture through the photo route, anything else as it is,
 * `PUT /api/files`), as Pages' files are; the server lays them in Seafile under `Agenda/`.
 */
import { t } from '@unlease/core/i18n';
import { createId } from '@unlease/core/services/ids';
import { authHeader } from '@unlease/core/sync/protocol';
import type { EventFile } from '@unlease/calendar/models/events';
import { isUploadableImage, MAX_FILE_BYTES } from '@unlease/pages/services/media';
import { loadLocalFiles, markFileUploaded, saveLocalFile } from '@shared/data/repositories/fileRepository';
import { forgetLocalPaths } from '@shared/app/hooks/useImageSource';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { addSyncTask } from '@shared/app/sync/syncManager';
import { pickDocument } from '@shared/platform/documents';
import { pickImages, removePath } from '@shared/platform/media';

import { markEventFileUploaded } from './store/actions';
import { useLibraryStore } from './store/libraryStore';
import { SyncError, uploadFile as uploadPhoto } from './sync/transport';

export type PickOutcome = { readonly status: 'ok'; readonly file: EventFile } | { readonly status: 'cancelled' } | { readonly status: 'error'; readonly message: string };

const TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  gif: 'image/gif',
  txt: 'text/plain',
  ics: 'text/calendar',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
};

export function mimeFromName(name: string): string {
  const extension = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  return TYPES[extension] ?? 'application/octet-stream';
}

const baseName = (path: string): string => path.split('/').filter(Boolean).pop() ?? 'photo';

/** A photo from the system's picker. */
export async function pickEventPhoto(now: number = Date.now()): Promise<PickOutcome> {
  const result = await pickImages(1);
  if (result.status === 'cancelled') return { status: 'cancelled' };
  const picked = result.files[0];
  if (result.status !== 'ok' || !picked) return { status: 'error', message: result.message ? t(result.message) : t('Impossible d’ajouter la photo') };
  const id = createId(now);
  saveLocalFile({ id, path: picked.path, mime: picked.mime }, now);
  forgetLocalPaths();
  return { status: 'ok', file: { id, name: baseName(picked.path), mime: picked.mime, bytes: picked.bytes, uploaded: false } };
}

/** Any document from the system's picker (a ticket's PDF), up to 100 Mo. */
export async function pickEventDocument(now: number = Date.now()): Promise<PickOutcome> {
  const picked = await pickDocument(['*/*']);
  if (picked.status === 'cancelled') return { status: 'cancelled' };
  if (picked.status !== 'ok' || !picked.path) return { status: 'error', message: picked.message ? t(picked.message) : t('Fichier illisible') };
  const refusal = picked.bytes === 0 ? t('Ce fichier est vide.') : picked.bytes > MAX_FILE_BYTES ? t('Ce fichier dépasse 100 Mo.') : null;
  if (refusal) {
    await removePath(picked.path);
    return { status: 'error', message: refusal };
  }
  const id = createId(now);
  const mime = mimeFromName(picked.name);
  saveLocalFile({ id, path: picked.path, mime }, now);
  forgetLocalPaths();
  return { status: 'ok', file: { id, name: picked.name || t('fichier'), mime, bytes: picked.bytes, uploaded: false } };
}

const FILE_UPLOAD_TIMEOUT_MS = 10 * 60_000;

async function uploadDocument(config: ServerConfig, file: { readonly id: string; readonly path: string; readonly mime: string }, name: string): Promise<void> {
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

const refused = new Set<string>();

const isRefusal = (error: unknown): boolean =>
  error instanceof SyncError && error.kind === 'http' && error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;

/** The events' files kept here and not yet sent, sent; run by the sync loop after each exchange. */
export async function uploadPendingEventFiles(config: ServerConfig): Promise<void> {
  const { events } = useLibraryStore.getState();
  for (const local of loadLocalFiles()) {
    if (local.uploaded || refused.has(local.id)) continue;
    const owners = Object.values(events).filter(event => event.files.some(file => file.id === local.id));
    // Another app's file (none here), or an event that never made it: it waits.
    if (owners.length === 0) continue;
    const live = owners.find(event => event.deletedAt === null);
    if (!live) {
      markFileUploaded(local.id);
      continue;
    }
    const meta = live.files.find(file => file.id === local.id)!;
    try {
      if (isUploadableImage(local.mime)) await uploadPhoto(config, local);
      else await uploadDocument(config, local, meta.name);
    } catch (error) {
      if (!isRefusal(error)) throw error;
      refused.add(local.id);
      continue;
    }
    markFileUploaded(local.id);
    markEventFileUploaded(local.id);
  }
}

let added = false;

/** Once, at start (bootstrap): after each exchange, the events' files kept here go up. */
export function startFileUploads(): void {
  if (added) return;
  added = true;
  addSyncTask({ run: uploadPendingEventFiles, restart: () => refused.clear() });
}
