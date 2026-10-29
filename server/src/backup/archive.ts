/**
 * A backup archive, `unlease-2026-10-26T03-00-00Z.tar.gz`, everything under one folder of that name:
 * `unlease.json` (every record of every app with its clocks, and every photo and file's description:
 * what a restore reads), `LISEZMOI.md`, each app's Markdown under its folder (`ServerApp.markdown`),
 * and in a full archive the files themselves under `Fichiers/`, laid out like the drive. On S3 the
 * files travel apart, once each, as `fichiers/<id>.<ext>`, except those the drive (Seafile) holds:
 * `unlease.json` says where.
 */
import type { Writable } from 'node:stream';
import { SUITE_SLUG } from '@unlease/core/apps';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '@unlease/core/sync/admin';
import type { SyncRecord } from '@unlease/core/sync/record';
import { filesOf, markdownOf, readmeLines } from '../apps/hooks';
import type { ServerApp } from '../apps/types';
import { extensionFor } from '../blobs/names';
import type { BlobFile, BlobInfo } from '../blobs/store';
import type { StoredRecord } from '../sync/records';
import { FILES_DIR, readme } from './markdown';
import { TarWriter } from './tar';

/** What a restore reads, at the archive's root folder. */
export const ARCHIVE_DOCUMENT = `${SUITE_SLUG}.json`;

/** A photo or file as `unlease.json` describes it. */
export interface ArchivedFile {
  readonly id: string;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly displayMime: string;
  readonly displayBytes: number;
  readonly source: BlobInfo['source'];
  readonly createdAt: number;
  /** Where a full archive keeps it. */
  readonly path: string;
  /** Where S3 keeps it, under the backup's prefix (when it is not in the drive, or was sent before). */
  readonly stored: string;
  /** Where the drive (Seafile) holds its original, in the library; null when it does not. */
  readonly drive: string | null;
}

export interface BackupDocument {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: number;
  readonly createdAt: string;
  readonly server: string;
  readonly epoch: string;
  readonly records: readonly SyncRecord[];
  readonly files: readonly ArchivedFile[];
}

export const SNAPSHOT_NAME = new RegExp(`^${SUITE_SLUG}-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}Z(?:-complet)?\\.tar\\.gz$`);

/** `unlease-2026-10-26T03-00-00Z.tar.gz`, from UTC so names sort by time. */
export function archiveName(createdAt: number, full = false): string {
  return `${SUITE_SLUG}-${new Date(createdAt).toISOString().slice(0, 19).replaceAll(':', '-')}Z${full ? '-complet' : ''}.tar.gz`;
}

/** The S3 key of a blob's file, under the prefix: the same for every backup. */
export function storedKey(blob: Pick<BlobInfo, 'id' | 'mime' | 'displayMime' | 'source'>): string {
  return `fichiers/${blob.id}.${extensionFor(blob.source === 'link' ? blob.displayMime : blob.mime)}`;
}

export interface ArchiveInput {
  /** Every record the server holds, read in one go. */
  readonly records: readonly StoredRecord[];
  /** The apps whose files and Markdown it lays out. */
  readonly apps: readonly ServerApp[];
  readonly blobs: readonly BlobInfo[];
  readonly createdAt: number;
  readonly version: string;
  readonly epoch: string;
  /** Where the drive holds a blob's original, if it does. */
  readonly driveOf?: (id: string) => string | null;
}

export interface ArchiveReport {
  readonly files: number;
  /** Files a full archive could not read (gone from the disk and the drive). */
  readonly missing: number;
}

/**
 * Writes the archive as tar to `out` (gzip it on the way). With `open`, the files go in too: each is
 * read when its turn comes, from the disk or the drive.
 */
export async function writeArchive(out: Writable, input: ArchiveInput, open: ((id: string) => Promise<BlobFile | null>) | null): Promise<ArchiveReport> {
  const lost: string[] = [];
  const root = archiveName(input.createdAt, open !== null).replace(/\.tar\.gz$/, '');
  const mimeOf = new Map(input.blobs.map(blob => [blob.id, blob.source === 'link' ? blob.displayMime : blob.mime]));
  const options = { kept: true, mimeOf: (id: string) => mimeOf.get(id) };
  const paths = filesOf(input.apps, input.records, options);
  const files: ArchivedFile[] = input.blobs.map(blob => ({
    id: blob.id,
    mime: blob.mime,
    width: blob.width,
    height: blob.height,
    bytes: blob.bytes,
    displayMime: blob.displayMime,
    displayBytes: blob.displayBytes,
    source: blob.source,
    createdAt: blob.createdAt,
    path: `${FILES_DIR}/${paths.get(blob.id) ?? `Autres/${blob.id}.${extensionFor(mimeOf.get(blob.id) ?? blob.mime)}`}`,
    stored: storedKey(blob),
    drive: input.driveOf?.(blob.id) ?? null,
  }));
  const document: BackupDocument = {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    createdAt: new Date(input.createdAt).toISOString(),
    server: input.version,
    epoch: input.epoch,
    records: input.records.map(({ type, id, fields, clocks }) => ({ type, id, fields, clocks })),
    files,
  };
  const tar = new TarWriter(out);
  const at = input.createdAt;
  await tar.file(`${root}/${ARCHIVE_DOCUMENT}`, JSON.stringify(document, null, 1), at);
  await tar.file(`${root}/LISEZMOI.md`, readme(input.createdAt, input.version, open !== null, readmeLines(input.apps)), at);
  for (const file of markdownOf(input.apps, input.records, options)) await tar.file(`${root}/${file.path}`, file.text, at);
  let written = 0;
  let missing = 0;
  if (open) {
    for (const file of files) {
      const found = await open(file.id);
      const bytes = found ? await found.read().catch(() => null) : null;
      if (!bytes) {
        missing += 1;
        lost.push(file.path);
        continue;
      }
      // A file cut short throws: the archive past it would be unusable.
      await tar.stream(`${root}/${file.path}`, bytes.size, bytes.body, file.createdAt);
      written += 1;
    }
  }
  // Said in the archive itself: a full archive without some of its files must not pass for complete.
  if (lost.length > 0) await tar.file(`${root}/FICHIERS-MANQUANTS.md`, `# Fichiers manquants\n\nCes fichiers n’ont pas pu être lus (ni sur le serveur, ni dans le drive) et ne sont pas dans cette archive :\n\n${lost.map(path => `- ${path}`).join('\n')}\n`, at);
  await tar.end();
  return { files: written, missing };
}
