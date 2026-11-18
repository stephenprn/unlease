/**
 * An item's files in this browser. A picture or a PDF chosen (or taken by the webcam) is sealed here
 * under the item's key, and only its sealed bytes are kept (IndexedDB) until the sync sends them
 * (`PUT /api/files/:id`, as they are). A picture gets a small one too, sealed apart, for the lists.
 *
 * Opened files are object URLs held in memory for this visit: locking the vault revokes them all
 * (`forgetOpenedFiles`), and none is ever written anywhere opened.
 */
import { createId } from '@unlease/core/services/ids';
import { openBlob, sealBlob } from '@unlease/wallet/crypto/seal';
import type { FileRole, WalletFile } from '@unlease/wallet/models/item';

import { readStoredFile, storeFile } from '@shared/app/media/files';
import { useSettingsStore } from '@shared/app/store/settings';
import { downloadBlob } from '@shared/app/sync/transport';
import { browserCipher } from './cipher';

/** A scan's long side: enough to read the small print of a paper, little enough to send. */
export const PAGE_LONG_SIDE = 2400;
/** A picture's small one, for lists and tiles. */
const THUMB_LONG_SIDE = 480;
/** The largest file kept: the server takes 100 MB, a PDF of many pages fits well under it. */
export const MAX_WALLET_FILE_BYTES = 40 * 1024 * 1024;

const SEALED_MIME = 'application/octet-stream';

async function seal(itemKey: Uint8Array, blobId: string, bytes: Uint8Array, now: number): Promise<void> {
  const sealed = sealBlob(browserCipher, itemKey, blobId, bytes);
  await storeFile(blobId, new Blob([sealed.slice().buffer as ArrayBuffer], { type: SEALED_MIME }), SEALED_MIME, now);
}

/** A picture drawn again no larger than `longSide`, as JPEG; its size. */
export async function shrinkImage(source: Blob, longSide: number, quality = 0.88): Promise<{ readonly blob: Blob; readonly width: number; readonly height: number }> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('no picture');
  return { blob, width, height };
}

const bytesOf = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer());

/** A file taken in: sealed and kept until sent; its entry for the item's details. Pictures are made JPEG and shrunk; a PDF is kept whole. */
export async function keepWalletFile(itemKey: Uint8Array, file: Blob, role: FileRole, name: string, now = Date.now()): Promise<WalletFile> {
  const id = createId(now);
  if (file.type === 'application/pdf') {
    const bytes = await bytesOf(file);
    await seal(itemKey, id, bytes, now);
    return { id, role, mime: 'application/pdf', name, width: 0, height: 0, bytes: bytes.length, thumb: null };
  }
  const page = await shrinkImage(file, PAGE_LONG_SIDE);
  const thumb = await shrinkImage(page.blob, THUMB_LONG_SIDE, 0.8);
  const thumbId = createId(now);
  const bytes = await bytesOf(page.blob);
  await seal(itemKey, id, bytes, now);
  await seal(itemKey, thumbId, await bytesOf(thumb.blob), now);
  remember(id, page.blob);
  remember(thumbId, thumb.blob);
  return { id, role, mime: 'image/jpeg', name: name.replace(/\.[a-z0-9]{1,5}$/i, '') + '.jpg', width: page.width, height: page.height, bytes: bytes.length, thumb: thumbId };
}

const openedUrls = new Map<string, string>();
const opening = new Map<string, Promise<string | null>>();

function remember(id: string, blob: Blob): string {
  const known = openedUrls.get(id);
  if (known) return known;
  const url = URL.createObjectURL(blob);
  openedUrls.set(id, url);
  return url;
}

/** A file's bytes opened: this browser's sealed copy while it waits to be sent, else the server's. Null when it cannot be had or opened. */
export async function openWalletBytes(itemKey: Uint8Array, blobId: string, signal?: AbortSignal): Promise<Uint8Array | null> {
  const local = await readStoredFile(blobId).catch(() => null);
  const server = useSettingsStore.getState().server;
  const sealed = local ?? (server ? await downloadBlob(server, blobId, 'original', signal).catch(() => null) : null);
  if (!sealed) return null;
  return openBlob(browserCipher, itemKey, blobId, await bytesOf(sealed));
}

/** A file opened as an address the page can show, for this visit. */
export function openWalletFile(itemKey: Uint8Array, blobId: string, mime: string): Promise<string | null> {
  const known = openedUrls.get(blobId);
  if (known) return Promise.resolve(known);
  const running = opening.get(blobId);
  if (running) return running;
  const key = itemKey.slice();
  const job = openWalletBytes(key, blobId)
    .then(bytes => (bytes ? remember(blobId, new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime })) : null))
    .finally(() => {
      key.fill(0);
      opening.delete(blobId);
    });
  opening.set(blobId, job);
  return job;
}

/** Already opened this visit: its address at once. */
export const openedFileUrl = (blobId: string): string | null => openedUrls.get(blobId) ?? null;

/** The vault locked: every opened file revoked. */
export function forgetOpenedFiles(): void {
  for (const url of openedUrls.values()) URL.revokeObjectURL(url);
  openedUrls.clear();
}

/** Saved to this computer, opened: the person asked for it. */
export function saveOpened(bytes: Uint8Array, name: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
