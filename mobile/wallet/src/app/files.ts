/**
 * An item's files on the phone. A picture taken or picked (upright, at most 2560 px: the media
 * module's) or a PDF is sealed at once under the item's key, natively and file to file, into this
 * app's private files; the plain copy is deleted. The sealed file waits there until the sync sends it
 * (`PUT /api/files/:id`, as it is), and stays as this phone's copy.
 *
 * Opening a file writes it plain into the cache for as long as the papers are open (`wipeOpened` on
 * lock): an image needs a file to show. A file another device added is fetched sealed first.
 */
import { t } from '@unlease/core/i18n';
import { createId } from '@unlease/core/services/ids';
import { authHeader } from '@unlease/core/sync/protocol';
import { toBase64Url } from '@unlease/wallet/crypto/bytes';
import { ITEM_TYPE } from '@unlease/wallet/crypto/vault';
import type { FileRole, WalletFile } from '@unlease/wallet/models/item';
import { loadLocalFiles, markFileUploaded, removeLocalFile, saveLocalFile } from '@shared/data/repositories/fileRepository';
import { removePath, type MediaFile } from '@shared/platform/media';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { addSyncTask } from '@shared/app/sync/syncManager';
import { SyncError } from '@shared/app/sync/transport';
import { vaultNative } from '@platform/vault';

import { useLibraryStore } from './store/libraryStore';
import { handOff, useVaultStore } from './store/vault';

const SEALED_MIME = 'application/octet-stream';

const sealedPath = (id: string): string => `${vaultNative.sealedDir()}/${id}.bin`;

const extension = (mime: string): string => (mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg');

/** A file's name as written to the cache: its own, without what a path cannot hold, its extension kept. */
function openedName(file: WalletFile): string {
  const ext = extension(file.mime);
  const base = file.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(new RegExp(`\\.${ext}$`, 'i'), '').trim().slice(0, 100);
  return `${base || file.id}.${ext}`;
}

/** A picture or a PDF taken in: sealed under the item's key, the plain copy gone; its entry for the item's details. */
export async function keepPicked(itemKey: Uint8Array, picked: MediaFile, role: FileRole, name: string, now = Date.now()): Promise<WalletFile> {
  const id = createId(now);
  const target = sealedPath(id);
  await vaultNative.sealFile(toBase64Url(itemKey), id, picked.path, target);
  await removePath(picked.path).catch(() => undefined);
  saveLocalFile({ id, path: target, mime: SEALED_MIME }, now);
  return { id, role, mime: picked.mime, name: `${name}.${extension(picked.mime)}`, width: picked.width, height: picked.height, bytes: picked.bytes, thumb: null };
}

const opened = new Map<string, string>();
const opening = new Map<string, Promise<string | null>>();

// The papers locked: the opened copies are gone from the cache (`wipeOpened`), and from here.
useVaultStore.subscribe((state, previous) => {
  if (previous.papers && !state.papers) opened.clear();
});

/** A file opened for this moment, as a `file://` address, or null when it cannot be had or opened. */
export function openWalletFile(itemKey: Uint8Array, file: WalletFile): Promise<string | null> {
  const known = opened.get(file.id);
  if (known) return Promise.resolve(known);
  const running = opening.get(file.id);
  if (running) return running;
  const key = toBase64Url(itemKey);
  const job = (async (): Promise<string | null> => {
    let source = loadLocalFiles().find(local => local.id === file.id)?.path ?? null;
    if (!source) {
      const server = useSettingsStore.getState().server;
      if (!server) return null;
      const target = sealedPath(file.id);
      const fetched = await vaultNative.download(`${server.url}/api/blobs/${encodeURIComponent(file.id)}?variant=original`, server.token, target);
      if (!fetched) return null;
      source = target;
    }
    // Under its own name, in a folder of its own: a viewer shows the file's name as its title.
    const output = `${vaultNative.openedDir()}/${file.id}/${openedName(file)}`;
    const ok = await vaultNative.openFile(key, file.id, source, output);
    if (!ok) return null;
    const uri = `file://${output}`;
    opened.set(file.id, uri);
    return uri;
  })().finally(() => opening.delete(file.id));
  opening.set(file.id, job);
  return job;
}

// ── sending the sealed files ───────────────────────────────────────────────

const UPLOAD_TIMEOUT_MS = 10 * 60_000;

async function upload(config: ServerConfig, id: string, path: string): Promise<void> {
  const form = new FormData();
  // React Native's FormData streams the file from disk (hence the `Blob` cast).
  form.append('file', { uri: `file://${path}`, type: SEALED_MIME, name: `${id}.bin` } as unknown as Blob);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), UPLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${config.url}/api/files/${encodeURIComponent(id)}`, { method: 'PUT', headers: authHeader(config.token), body: form, signal: abort.signal });
  } catch {
    throw new SyncError('network', t('Server unreachable'));
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401) throw new SyncError('unauthorized', t('Token refused'));
  if (!response.ok) throw new SyncError('http', t('Upload refused ({status})', { status: response.status }), response.status);
}

const refused = new Set<string>();
const isRefusal = (error: unknown): boolean => error instanceof SyncError && error.kind === 'http' && error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;

/** The item holding a file, by its record's plain `files`, or null. */
function ownerOf(id: string): { readonly live: boolean } | null {
  const records = Object.values(useLibraryStore.getState().itemRecords).filter(record => record.type === ITEM_TYPE && Array.isArray(record.fields.files) && (record.fields.files as unknown[]).includes(id));
  if (records.length === 0) return null;
  return { live: records.some(record => record.fields.deletedAt === null || record.fields.deletedAt === undefined) };
}

/** A file opened for viewing handed to the phone's viewer (a PDF); false when no app can show it. */
export function viewOpenedFile(uri: string, mime: string): boolean {
  // The viewer reads the file while this app is away: locking then keeps it (`handOff`).
  handOff();
  const shown = vaultNative.viewFile(uri.replace(/^file:\/\//, ''), mime);
  if (!shown) handOff(false);
  return shown;
}

export async function uploadPendingFiles(config: ServerConfig): Promise<void> {
  for (const file of loadLocalFiles()) {
    if (file.uploaded || refused.has(file.id) || file.mime !== SEALED_MIME) continue;
    const owner = ownerOf(file.id);
    if (!owner) continue;
    if (!owner.live) {
      markFileUploaded(file.id);
      continue;
    }
    try {
      await upload(config, file.id, file.path);
    } catch (error) {
      if (!isRefusal(error)) throw error;
      refused.add(file.id);
      continue;
    }
    markFileUploaded(file.id);
  }
}

const waiting = (): number => loadLocalFiles().filter(file => !file.uploaded && file.mime === SEALED_MIME && !refused.has(file.id) && ownerOf(file.id)?.live).length;

let added = false;

export function startWalletUploads(): void {
  if (added) return;
  added = true;
  addSyncTask({ run: uploadPendingFiles, restart: () => refused.clear(), pending: waiting });
}

/** Files picked for a form then left out (cancelled, or taken off before saving): their sealed copies go. */
export function dropPicked(ids: readonly string[]): void {
  for (const id of ids) {
    const local = loadLocalFiles().find(file => file.id === id);
    removeLocalFile(id);
    if (local) void removePath(local.path).catch(() => undefined);
  }
}
