/**
 * Restoring a backup archive (uploaded, or a snapshot from S3) while the server runs. Its records go
 * through `SyncService.restore` (merge, or rollback: see `RestoreMode`); each photo and file the
 * server lacks comes back from the archive (a full one), else from the drive (Seafile) where the
 * backup says it is (taken as it is there, never sent again), else from S3's `fichiers/`. Photos get
 * their display copy made again. One restore at a time; the apps follow it through `status()`.
 */
import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { basename, dirname } from 'node:path/posix';
import { pipeline as pipe, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { SUITE_NAME } from '@unlease/core/apps';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, type RestoreMode, type RestoreReport, type RestoreStatus } from '@unlease/core/sync/admin';
import { sanitizeRecord, type SyncRecord } from '@unlease/core/sync/record';
import { isValidId } from '@unlease/core/sync/schema';
import { processUpload, UnsupportedImageError } from '../blobs/images';
import type { BlobBytes, BlobStore } from '../blobs/store';
import type { Dirent } from '../drive/seafile';
import { readMeta, writeMeta } from '../db/database';
import { log } from '../log';
import type { SettingsStore } from '../settings/store';
import type { RecordStore } from '../sync/records';
import type { SyncService } from '../sync/service';
import { ARCHIVE_DOCUMENT } from './archive';
import { S3Error, s3Problem } from './s3';
import { s3Client, snapshotsPrefix, toTempFile } from './service';
import { readTar, TarError } from './tar';

export type RestoreSource = { readonly kind: 'file'; readonly path: string; readonly name: string } | { readonly kind: 's3'; readonly name: string };

/** A refusal worth showing as it is. */
class RestoreError extends Error {}

const JSON_LIMIT = 1024 * 1024 * 1024;

interface FileEntry {
  readonly id: string;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly displayMime: string;
  readonly source: 'upload' | 'link';
  readonly path: string;
  readonly stored: string;
  /** Where the drive held it when the backup was made ('' when it did not). */
  readonly drive: string;
}

function fileEntries(value: unknown): FileEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): FileEntry[] => {
    const entry = raw as Record<string, unknown> | null;
    if (!entry || !isValidId(entry.id) || typeof entry.mime !== 'string' || (entry.source !== 'upload' && entry.source !== 'link')) return [];
    const count = (field: unknown): number => (typeof field === 'number' && Number.isFinite(field) && field >= 0 ? field : 0);
    return [
      {
        id: entry.id,
        mime: entry.mime,
        width: count(entry.width),
        height: count(entry.height),
        bytes: count(entry.bytes),
        displayMime: typeof entry.displayMime === 'string' ? entry.displayMime : entry.mime,
        source: entry.source,
        path: typeof entry.path === 'string' ? entry.path : '',
        stored: typeof entry.stored === 'string' && /^fichiers\/[A-Za-z0-9_-]+\.[a-z0-9]+$/.test(entry.stored) ? entry.stored : '',
        drive: typeof entry.drive === 'string' && entry.drive.startsWith('/') && !entry.drive.split('/').includes('..') ? entry.drive : '',
      },
    ];
  });
}

/** The drive a restore takes files back from (`DriveSync`). */
export interface RestoreDrive {
  ready(): boolean;
  filesIn(dir: string): Promise<Dirent[] | null>;
  fetch(path: string, signal?: AbortSignal): Promise<BlobBytes>;
  adopt(id: string, path: string, bytes: number): void;
}

export interface RestoreServiceOptions {
  readonly sync: SyncService;
  readonly records: RecordStore;
  readonly blobs: BlobStore;
  readonly settings: SettingsStore;
  readonly tmpDir: string;
  /** Files came back: the drive takes them. */
  readonly onFiles?: () => void;
  /** Where files the backup names in the drive come back from. */
  readonly drive?: RestoreDrive;
  /** Runs the restore once no backup runs, and holds backups off until it ends. */
  readonly exclusive?: <T>(work: () => Promise<T>) => Promise<T>;
  readonly fetcher?: typeof fetch;
  /** Waits between tries of a request S3 could not answer (tests: none). */
  readonly s3RetryDelaysMs?: readonly number[];
  readonly now?: () => number;
}

export class RestoreService {
  private readonly now: () => number;
  private state: RestoreStatus = { running: false, startedAt: null, finishedAt: null, error: null, report: null };

  constructor(private readonly options: RestoreServiceOptions) {
    this.now = options.now ?? Date.now;
    // The last restore, as the last start left it: one under way then was cut short.
    const stored = readMeta(options.records.db, 'restore');
    if (typeof stored === 'string') {
      try {
        const last = JSON.parse(stored) as RestoreStatus;
        this.state = last.running ? { ...last, running: false, finishedAt: last.startedAt, error: 'Interrompue : le serveur s’est arrêté. Relancez la restauration pour finir.' } : last;
      } catch {
        // Unreadable: no last restore.
      }
    }
  }

  private setState(state: RestoreStatus): void {
    this.state = state;
    writeMeta(this.options.records.db, 'restore', JSON.stringify(state));
  }

  status(): RestoreStatus {
    return this.state;
  }

  get running(): boolean {
    return this.state.running;
  }

  /** Starts in the background, or answers null while another runs; an uploaded archive's file is removed once read. */
  start(source: RestoreSource, mode: RestoreMode): Promise<void> | null {
    if (this.state.running) return null;
    this.setState({ running: true, startedAt: this.now(), finishedAt: null, error: null, report: null });
    const exclusive = this.options.exclusive ?? (<T>(work: () => Promise<T>) => work());
    return exclusive(() => this.restore(source, mode))
      .then(report => {
        this.setState({ ...this.state, running: false, finishedAt: this.now(), report });
        log.info('backup restored', { ...report });
      })
      .catch(error => {
        const message = error instanceof RestoreError ? error.message : error instanceof S3Error ? s3Problem(error) : error instanceof TarError || String((error as { code?: unknown }).code ?? '').startsWith('Z_') ? 'Archive illisible : ce n’est pas une sauvegarde .tar.gz' : 'La restauration a échoué';
        this.setState({ ...this.state, running: false, finishedAt: this.now(), error: message });
        log.error('restore failed', { error });
      });
  }

  private async restore(source: RestoreSource, requested: RestoreMode): Promise<RestoreReport> {
    const { sync, records, settings, tmpDir } = this.options;
    const work = join(tmpDir, `restore-${randomBytes(6).toString('hex')}`);
    await mkdir(work, { recursive: true });
    let archive = source.kind === 'file' ? source.path : null;
    try {
      if (source.kind === 's3') {
        const config = settings.backup();
        if (!config) throw new RestoreError('Sauvegarde S3 non configurée');
        archive = await toTempFile((await s3Client(config, this.options.fetcher, this.options.s3RetryDelaysMs).get(`${snapshotsPrefix(config)}${source.name}`)).body, work);
      }
      const { document, root, extracted } = await this.read(archive!, work);

      const incoming: SyncRecord[] = [];
      for (const raw of document.records as unknown[]) {
        const { record } = sanitizeRecord(raw);
        if (record) incoming.push(record);
      }
      // A server that holds nothing (but "Non classé") takes the backup as it was: its devices then send back what is newer.
      const mode: RestoreMode = records.holdsNothing() ? 'merge' : requested;
      const written = sync.restore(incoming, mode);

      let files = 0;
      let missing = 0;
      let needDrive = 0;
      const { drive } = this.options;
      const listings = new Map<string, Promise<Dirent[] | null>>();
      // The records are in: a file that fails counts as missing rather than stopping the rest.
      for (const entry of fileEntries(document.files)) {
        // What a backup keeps must really be here: a display copy alone, or a file the drive lost, comes back from the backup.
        if (await this.options.blobs.holdsKept(entry.id)) continue;
        try {
          const extractedPath = extracted.get(`${root}${entry.path}`);
          if (!extractedPath && entry.drive && drive?.ready() && (await this.fromDrive(entry, drive, listings))) {
            files += 1;
            continue;
          }
          const data = await this.bytesOf(entry, extractedPath);
          if (!data) {
            // Kept in a drive this server is not linked to yet: it comes back once Seafile is set and the restore run again.
            if (entry.drive && !drive?.ready()) needDrive += 1;
            else missing += 1;
            continue;
          }
          await this.save(entry, data);
          files += 1;
        } catch (error) {
          missing += 1;
          log.warn('restore: a file could not be put back', { id: entry.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
      if (files > 0) this.options.onFiles?.();
      return { mode, source: source.name, records: written, files, missingFiles: missing, needDrive };
    } finally {
      await rm(work, { recursive: true, force: true });
      if (source.kind === 'file') await rm(source.path, { force: true });
    }
  }

  /** `unlease.json`, and the files of a full archive extracted to `work`. */
  private async read(archive: string, work: string): Promise<{ document: Record<string, unknown>; root: string; extracted: Map<string, string> }> {
    let document: Record<string, unknown> | null = null;
    let root = '';
    const extracted = new Map<string, string>();
    // `pipeline` passes a read error on to the gunzip stream, which the loop then throws.
    for await (const entry of readTar(pipe(createReadStream(archive), createGunzip(), () => undefined))) {
      const depth = entry.name.split('/').length;
      if ((entry.name === ARCHIVE_DOCUMENT || entry.name.endsWith(`/${ARCHIVE_DOCUMENT}`)) && depth <= 2 && !document) {
        if (entry.size > JSON_LIMIT) throw new RestoreError(`${ARCHIVE_DOCUMENT} trop gros`);
        const chunks: Buffer[] = [];
        for await (const piece of entry.body) chunks.push(piece);
        try {
          document = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        } catch {
          throw new RestoreError(`${ARCHIVE_DOCUMENT} illisible`);
        }
        root = entry.name.slice(0, -ARCHIVE_DOCUMENT.length);
      } else if (/(^|\/)Fichiers\//.test(entry.name)) {
        const path = join(work, `file-${extracted.size}`);
        await pipeline(Readable.from(entry.body), createWriteStream(path));
        extracted.set(entry.name, path);
      }
    }
    if (!document) throw new RestoreError(`Archive sans ${ARCHIVE_DOCUMENT} : ce n’est pas une sauvegarde faite par ${SUITE_NAME}`);
    if (document.format !== BACKUP_FORMAT || !Array.isArray(document.records)) throw new RestoreError(`${ARCHIVE_DOCUMENT} illisible`);
    if (typeof document.version !== 'number' || document.version > BACKUP_FORMAT_VERSION) throw new RestoreError('Sauvegarde faite par une version plus récente du serveur');
    return { document, root, extracted };
  }

  /**
   * A file the drive holds where the backup says: its row comes back pointing there (a photo's
   * display copy made again from it), nothing is copied to this disk or sent to the drive again.
   * False when the drive has nothing at that place.
   */
  private async fromDrive(entry: FileEntry, drive: RestoreDrive, listings: Map<string, Promise<Dirent[] | null>>): Promise<boolean> {
    const dir = dirname(entry.drive);
    let listing = listings.get(dir);
    if (!listing) listings.set(dir, (listing = drive.filesIn(dir).catch(() => null)));
    const found = (await listing)?.find(item => item.type === 'file' && item.name === basename(entry.drive));
    if (!found) return false;
    const { blobs } = this.options;
    const size = found.size >= 0 ? found.size : entry.bytes;
    const base = { id: entry.id, width: entry.width, height: entry.height, source: entry.source };
    if (blobs.get(entry.id)) await blobs.remove(entry.id);
    let saved = false;
    if (entry.mime.startsWith('image/')) {
      const data = Buffer.from(await new Response((await drive.fetch(entry.drive)).body).arrayBuffer());
      try {
        const processed = await processUpload(data);
        await blobs.save(
          { ...base, mime: processed.mime, width: processed.width, height: processed.height, bytes: data.length, displayMime: processed.display ? 'image/webp' : processed.mime, displayBytes: processed.display?.length ?? data.length },
          { display: processed.display, original: null },
        );
        saved = true;
      } catch (error) {
        if (!(error instanceof UnsupportedImageError)) throw error;
      }
    }
    if (!saved) await blobs.save({ ...base, mime: entry.mime, bytes: size, displayMime: entry.mime, displayBytes: size }, { display: null, original: null });
    drive.adopt(entry.id, entry.drive, size);
    return true;
  }

  /** A file's bytes: from the archive, else from S3 (null when neither has it). */
  private async bytesOf(entry: FileEntry, extractedPath: string | undefined): Promise<Buffer | null> {
    if (extractedPath) return readFile(extractedPath);
    const config = this.options.settings.backup();
    if (!config || !entry.stored) return null;
    try {
      const { body } = await s3Client(config, this.options.fetcher, this.options.s3RetryDelaysMs).get(`${config.prefix}${entry.stored}`);
      return Buffer.from(await new Response(body).arrayBuffer());
    } catch (error) {
      if (error instanceof S3Error && (error.status === 404 || error.code === 'NoSuchKey')) return null;
      throw error;
    }
  }

  private async save(entry: FileEntry, data: Buffer): Promise<void> {
    const { blobs } = this.options;
    if (blobs.get(entry.id)) await blobs.remove(entry.id);
    const base = { id: entry.id, width: entry.width, height: entry.height, source: entry.source };
    if (entry.source === 'link') {
      await blobs.save({ ...base, mime: entry.mime, bytes: entry.bytes, displayMime: entry.displayMime, displayBytes: data.length }, { display: data, original: null });
      return;
    }
    if (entry.mime.startsWith('image/')) {
      try {
        const processed = await processUpload(data);
        await blobs.save(
          { ...base, mime: processed.mime, width: processed.width, height: processed.height, bytes: data.length, displayMime: processed.display ? 'image/webp' : processed.mime, displayBytes: processed.display?.length ?? data.length },
          { display: processed.display, original: data },
        );
        return;
      } catch (error) {
        if (!(error instanceof UnsupportedImageError)) throw error;
      }
    }
    await blobs.save({ ...base, mime: entry.mime, bytes: data.length, displayMime: entry.mime, displayBytes: data.length }, { display: null, original: data });
  }
}
