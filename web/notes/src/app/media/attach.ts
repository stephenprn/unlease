/**
 * Photos into notes: picked, dropped or pasted, kept in IndexedDB, attached to
 * the note, and uploaded by the sync loop when the server is reachable.
 */
import { createId } from '@unlease/core/services/ids';

import { addAttachment } from '../store/actions';
import { requestSync } from '../sync/loop';
import { storeFile } from './files';
import { primeBlobUrl } from './images';

/** The image types the server accepts (core's attachment schema). */
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif']);
/** The server's upload limit. */
const MAX_BYTES = 25 * 1024 * 1024;

export function normalizeMime(mime: string): string {
  const lower = mime.toLowerCase();
  return lower === 'image/jpg' ? 'image/jpeg' : lower;
}

export function isAcceptedImage(file: { readonly type: string; readonly size: number }): boolean {
  return ALLOWED.has(normalizeMime(file.type)) && file.size > 0 && file.size <= MAX_BYTES;
}

/** Pixel size, read without a layout: decode off the main path when the browser can. */
export async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    }
  } catch {
    // Formats the browser cannot decode (HEIC on most) still upload; the server reads them.
  }
  return { width: 0, height: 0 };
}

export interface AttachOutcome {
  readonly added: number;
  /** Files that were not images the server takes, or too large. */
  readonly refused: number;
}

export async function attachFiles(noteId: string, files: readonly File[], now: number = Date.now()): Promise<AttachOutcome> {
  let added = 0;
  let refused = 0;
  for (const file of files) {
    if (!isAcceptedImage(file)) {
      refused += 1;
      continue;
    }
    const mime = normalizeMime(file.type);
    const { width, height } = await imageSize(file);
    const id = createId(now);
    await storeFile(id, file, mime, now);
    primeBlobUrl(id, file);
    addAttachment(noteId, { id, mime, width, height, bytes: file.size }, now);
    added += 1;
  }
  if (added > 0) requestSync();
  return { added, refused };
}
