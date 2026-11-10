/**
 * Photos, the Keep archive and a backup archive, through the Media TurboModule; and a file the app
 * made, saved where the person chooses.
 */
import { t } from '@unlease/core/i18n';

import NativeMedia, { type ArchiveResult, type MediaFile, type MediaResult, type PickedFile, type SavedFile } from '../../specs/NativeMedia';

export type { ArchiveResult, MediaFile, MediaResult, PickedFile, SavedFile };

const unavailable = (message: string) => ({ status: 'error', message, files: [] as MediaFile[] });

export async function pickImages(max = 10): Promise<MediaResult> {
  if (!NativeMedia) return unavailable(t('Sélecteur de photos indisponible'));
  return NativeMedia.pickImages(max);
}

export async function capturePhoto(): Promise<MediaResult> {
  if (!NativeMedia) return unavailable(t('Appareil photo indisponible'));
  return NativeMedia.capturePhoto();
}

export async function describeImage(path: string): Promise<MediaFile | null> {
  if (!NativeMedia) return null;
  try {
    return await NativeMedia.describeImage(path);
  } catch {
    return null;
  }
}

export async function pickKeepArchive(): Promise<ArchiveResult> {
  if (!NativeMedia) return { status: 'error', message: t('Import indisponible'), dir: '', entries: [] };
  return NativeMedia.pickKeepArchive();
}

/** A backup archive (`.tar.gz`), typed every way a file manager may type it. */
const ARCHIVE_TYPES = ['application/gzip', 'application/x-gzip', 'application/x-tar', 'application/x-compressed-tar', 'application/octet-stream'];

export async function pickBackupArchive(): Promise<PickedFile> {
  if (!NativeMedia) return { status: 'error', message: t('Sélecteur de fichiers indisponible'), path: '', name: '', bytes: 0 };
  return NativeMedia.pickFile(ARCHIVE_TYPES);
}

export async function readText(path: string): Promise<string> {
  if (!NativeMedia) return '';
  return NativeMedia.readText(path);
}

export async function removePath(path: string): Promise<void> {
  if (!NativeMedia) return;
  try {
    await NativeMedia.remove(path);
  } catch {
    // Cleanup is best effort; the cache directory is the OS's to reclaim anyway.
  }
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Bytes as base64 for the bridge, a few thousand characters at a time (a string grown one piece at a time is copied whole each time). */
export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const codes: number[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    // 61 is '=', the padding.
    codes.push(BASE64.charCodeAt((n >> 18) & 63), BASE64.charCodeAt((n >> 12) & 63), i + 1 < bytes.length ? BASE64.charCodeAt((n >> 6) & 63) : 61, i + 2 < bytes.length ? BASE64.charCodeAt(n & 63) : 61);
    if (codes.length >= 8192) {
      parts.push(String.fromCharCode(...codes));
      codes.length = 0;
    }
  }
  if (codes.length > 0) parts.push(String.fromCharCode(...codes));
  return parts.join('');
}

/** A file the app made, offered to save through Android's own save screen: 'ok', 'cancelled' or 'error'. */
export async function saveFile(name: string, mime: string, bytes: Uint8Array): Promise<SavedFile> {
  if (!NativeMedia) return { status: 'error', message: '' };
  return NativeMedia.saveFile(name, mime, toBase64(bytes));
}
