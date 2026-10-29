/**
 * Backups to S3. A run reads every record at once, writes the archive (`archive.ts`, without the
 * files) to a temporary file, sends to `fichiers/` each photo and file S3 does not have yet and the
 * drive (Seafile) does not hold: files live in Seafile once it is set, the archive says where (what
 * S3 holds is listed each run, so a file deleted there is sent again, and one already there from
 * another server is not), then the archive to `sauvegardes/` (last, so a snapshot never names a
 * file S3 lacks), and keeps the newest `keep` snapshots it made (another server's, such as the
 * one a new server was restored from, are never deleted). A file leaves S3 once its blob is gone
 * and no snapshot kept names it. Runs on the schedule the apps set (a failed one is tried again
 * within the hour), or on demand; never while the server holds nothing (a new server about to be
 * restored would only push its backups out).
 */
import { randomBytes } from 'node:crypto';
import { createWriteStream, openAsBlob } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { StatementSync } from 'node:sqlite';
import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { snapshotTime } from '@unlease/core/services/admin';
import { plural } from '@unlease/core/services/format';
import type { BackupRun, BackupSnapshot, BackupStatus } from '@unlease/core/sync/admin';
import { BACKUP_INTERVAL_MS } from '@unlease/core/sync/settings';
import { filesInUse } from '../apps/hooks';
import type { ServerApp } from '../apps/types';
import type { BlobFile, BlobStore } from '../blobs/store';
import { transaction, type Database } from '../db/database';
import { SeafileError, seafileProblem } from '../drive/seafile';
import { log } from '../log';
import type { BackupConfig, SettingsStore } from '../settings/store';
import type { RecordStore } from '../sync/records';
import type { SyncService } from '../sync/service';
import { archiveName, SNAPSHOT_NAME, storedKey, writeArchive } from './archive';
import { S3Client, S3Error, s3Problem } from './s3';

const HOUR = 3_600_000;
const RUNS_KEPT = 100;
const STOPPED = 'Interrompue : le serveur s’est arrêté';
/** Said when the new snapshot does not sort last: nothing is deleted from S3 then. */
const CLOCK_BEHIND = 'L’horloge du serveur semble en retard : les anciennes sauvegardes sont gardées';

/** A run's own reason to stop, said as it is. */
class RunError extends Error {}

/** Why a run failed, in the apps' words: S3's, Seafile's, or the server's own. */
function backupProblem(error: unknown): string {
  if (error instanceof RunError) return error.message;
  if (error instanceof S3Error) return s3Problem(error);
  if (error instanceof SeafileError) return `Seafile : ${seafileProblem(error)}`;
  if ((error as { name?: unknown } | null)?.name === 'AbortError') return STOPPED;
  return 'Erreur du serveur pendant la sauvegarde (voir ses journaux)';
}

interface RunRow {
  id: number;
  started_at: number;
  finished_at: number | null;
  ok: number;
  error: string | null;
  snapshot: string | null;
  bytes: number;
  files_sent: number;
  trigger: 'schedule' | 'manual';
}

const toRun = (row: RunRow): BackupRun => ({
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  ok: row.ok === 1,
  error: row.error,
  snapshot: row.snapshot,
  bytes: row.bytes,
  filesSent: row.files_sent,
  trigger: row.trigger,
});

export interface BackupServiceOptions {
  readonly db: Database;
  readonly records: RecordStore;
  /** The apps whose files and Markdown an archive lays out. */
  readonly apps: readonly ServerApp[];
  readonly blobs: BlobStore;
  readonly settings: SettingsStore;
  readonly sync: SyncService;
  /** Where temporary archives are written (on the data volume: they can be large). */
  readonly tmpDir: string;
  readonly version: string;
  readonly fetcher?: typeof fetch;
  /** Waits between tries of a request S3 could not answer (tests: none). */
  readonly s3RetryDelaysMs?: readonly number[];
  /** The drive that holds the originals: those are not sent to S3. */
  readonly drive?: { pathOf(id: string): string | null };
  readonly now?: () => number;
}

export const s3Client = (config: BackupConfig, fetcher: typeof fetch = fetch, retryDelays?: readonly number[]): S3Client => new S3Client(config, fetcher, undefined, retryDelays);
export const filesPrefix = (config: BackupConfig): string => `${config.prefix}fichiers/`;
export const snapshotsPrefix = (config: BackupConfig): string => `${config.prefix}sauvegardes/`;

/** A stream to a temporary file, for an upload that needs its size first. */
export async function toTempFile(body: ReadableStream<Uint8Array>, dir: string): Promise<string> {
  const path = join(dir, `part-${randomBytes(6).toString('hex')}`);
  try {
    await pipeline(Readable.fromWeb(body), createWriteStream(path));
  } catch (error) {
    await rm(path, { force: true });
    throw error;
  }
  return path;
}

export class BackupService {
  private readonly now: () => number;
  private readonly fetcher: typeof fetch;
  private readonly insertRun: StatementSync;
  private readonly finishRun: StatementSync;
  private readonly lastRun: StatementSync;
  private readonly lastOk: StatementSync;
  private readonly trimRuns: StatementSync;
  private readonly fileRow: StatementSync;
  private readonly putFile: StatementSync;
  private readonly touchFile: StatementSync;
  private readonly staleFiles: StatementSync;
  private readonly dropFile: StatementSync;
  private readonly addSnapshot: StatementSync;
  private readonly ownSnapshots: StatementSync;
  private readonly forgetSnapshot: StatementSync;
  private running: Promise<void> | null = null;
  /** Restores under way: no backup starts meanwhile (one would delete from S3 what they are about to fetch). */
  private paused = 0;
  private timer: NodeJS.Timeout | null = null;
  private readonly stopper = new AbortController();

  constructor(private readonly options: BackupServiceOptions) {
    this.now = options.now ?? Date.now;
    this.fetcher = options.fetcher ?? fetch;
    const { db } = options;
    this.insertRun = db.prepare('INSERT INTO backup_runs (started_at, trigger) VALUES (?, ?) RETURNING id');
    this.finishRun = db.prepare('UPDATE backup_runs SET finished_at = ?, ok = ?, error = ?, snapshot = ?, bytes = ?, files_sent = ? WHERE id = ?');
    this.lastRun = db.prepare('SELECT * FROM backup_runs ORDER BY id DESC LIMIT 1');
    this.lastOk = db.prepare('SELECT started_at FROM backup_runs WHERE ok = 1 ORDER BY id DESC LIMIT 1');
    this.trimRuns = db.prepare('DELETE FROM backup_runs WHERE id <= (SELECT id FROM backup_runs ORDER BY id DESC LIMIT 1 OFFSET ?)');
    this.fileRow = db.prepare('SELECT key, bytes FROM backup_files WHERE blob_id = ?');
    this.putFile = db.prepare(
      'INSERT INTO backup_files (blob_id, key, bytes, last_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT (blob_id) DO UPDATE SET key = excluded.key, bytes = excluded.bytes, last_seen_at = excluded.last_seen_at',
    );
    this.touchFile = db.prepare('UPDATE backup_files SET last_seen_at = MAX(last_seen_at, ?) WHERE blob_id = ?');
    this.staleFiles = db.prepare('SELECT blob_id, key, blob_id IN (SELECT id FROM blobs) AS here FROM backup_files WHERE last_seen_at < ?');
    this.dropFile = db.prepare('DELETE FROM backup_files WHERE blob_id = ?');
    this.addSnapshot = db.prepare('INSERT INTO backup_snapshots (name, created_at) VALUES (?, ?) ON CONFLICT (name) DO NOTHING');
    this.ownSnapshots = db.prepare('SELECT name FROM backup_snapshots');
    this.forgetSnapshot = db.prepare('DELETE FROM backup_snapshots WHERE name = ?');
    // A run the server stopped in the middle of.
    db.prepare('UPDATE backup_runs SET finished_at = started_at, error = ? WHERE finished_at IS NULL').run(STOPPED);
  }

  start(): void {
    const tick = () => {
      const next = this.nextAt();
      if (!this.running && this.paused === 0 && next !== null && next <= this.now() && this.hasData()) this.run('schedule');
    };
    setTimeout(tick, 30_000).unref();
    this.timer = setInterval(tick, 60_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopper.abort();
  }

  /** Whether there is anything to back up: a server that holds nothing yet (but "Non classé") makes no snapshot. */
  hasData(): boolean {
    return !this.options.records.holdsNothing();
  }

  /** Runs `work` (a restore) once no backup runs, and starts none until it ends. */
  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    this.paused += 1;
    try {
      await this.running;
      return await work();
    } finally {
      this.paused -= 1;
    }
  }

  /** Starts a run unless one is under way (or a restore); the apps follow it through `status()`. */
  run(trigger: 'schedule' | 'manual'): Promise<void> {
    if (this.paused > 0) return this.running ?? Promise.resolve();
    this.running ??= this.backup(trigger).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** When the schedule wants the next run: from the last one, sooner after a failure. */
  nextAt(): number | null {
    const config = this.options.settings.backup();
    if (!config || config.recurrence === 'off') return null;
    const last = this.lastRun.get() as RunRow | undefined;
    if (!last) return this.now();
    const interval = BACKUP_INTERVAL_MS[config.recurrence];
    return last.started_at + (last.ok === 1 ? interval : Math.min(interval, HOUR));
  }

  status(): BackupStatus {
    const last = this.lastRun.get() as RunRow | undefined;
    const ok = this.lastOk.get() as { started_at: number } | undefined;
    return { running: this.running !== null, last: last ? toRun(last) : null, lastSuccessAt: ok?.started_at ?? null, nextAt: this.nextAt() };
  }

  /** The snapshots on S3, newest first. */
  async list(): Promise<BackupSnapshot[]> {
    const config = this.options.settings.backup();
    if (!config) return [];
    const prefix = snapshotsPrefix(config);
    const objects = await s3Client(config, this.fetcher, this.options.s3RetryDelaysMs).list(prefix);
    return objects
      .map(object => ({ name: object.key.slice(prefix.length), bytes: object.size, at: object.lastModified }))
      .filter(snapshot => SNAPSHOT_NAME.test(snapshot.name))
      .map(snapshot => ({ ...snapshot, at: snapshotTime(snapshot.name, snapshot.at) }))
      .sort((a, b) => b.at - a.at);
  }

  /** One snapshot's bytes, from S3. */
  async download(name: string, signal?: AbortSignal): Promise<{ readonly body: ReadableStream<Uint8Array>; readonly size: number }> {
    const config = this.options.settings.backup();
    if (!config) throw new Error('no S3 settings');
    return s3Client(config, this.fetcher, this.options.s3RetryDelaysMs).get(`${snapshotsPrefix(config)}${name}`, signal);
  }

  /** A full archive, files included, written as it is read: for a download. */
  async full(out: Writable): Promise<void> {
    const { records, apps, blobs, sync, version } = this.options;
    const gzip = createGzip({ level: 4 });
    const done = pipeline(gzip, out);
    try {
      const driveOf = (id: string): string | null => this.options.drive?.pathOf(id) ?? null;
      const report = await writeArchive(gzip, { records: records.all(), apps, blobs: blobs.all(), createdAt: this.now(), version, epoch: sync.epoch, driveOf }, id => blobs.openKept(id));
      if (report.missing > 0) log.warn('full archive: files could not be read and are listed in FICHIERS-MANQUANTS.md', { missing: report.missing });
      gzip.end();
    } catch (error) {
      gzip.destroy(error instanceof Error ? error : new Error(String(error)));
    }
    await done;
  }

  private async backup(trigger: 'schedule' | 'manual'): Promise<void> {
    const config = this.options.settings.backup();
    if (!config) return;
    const { db, records, apps, blobs, sync, settings, version, tmpDir } = this.options;
    const startedAt = this.now();
    const runId = Number((this.insertRun.get(startedAt, trigger) as { id: number }).id);
    const name = archiveName(startedAt);
    const archive = join(tmpDir, name);
    const client = s3Client(config, this.fetcher, this.options.s3RetryDelaysMs);
    const signal = this.stopper.signal;
    // Moved elsewhere during the run: what it sends from now on would be counted at the wrong place.
    const stillThere = (): void => {
      const now = settings.backup();
      if (!now || now.endpoint !== config.endpoint || now.bucket !== config.bucket || now.prefix !== config.prefix) throw new RunError('Les réglages S3 ont changé pendant la sauvegarde : elle reprendra au prochain essai');
    };
    let sent = 0;
    let skipped = 0;
    let bytes = 0;
    try {
      const stored = records.all();
      const all = blobs.all();
      const driveOf = (id: string): string | null => this.options.drive?.pathOf(id) ?? null;
      const gzip = createGzip({ level: 6 });
      const written = pipeline(gzip, createWriteStream(archive));
      try {
        await writeArchive(gzip, { records: stored, apps, blobs: all, createdAt: startedAt, version, epoch: sync.epoch, driveOf }, null);
        gzip.end();
      } catch (error) {
        gzip.destroy(error instanceof Error ? error : new Error(String(error)));
      }
      await written;
      bytes = (await stat(archive)).size;

      // What S3 holds now, whatever this server remembers sending: a file deleted there (by hand, a
      // lifecycle rule) goes again, and one another server sent (before this one restored it) is not sent twice.
      const files = filesPrefix(config);
      const present = new Map((await client.list(files)).map(object => [object.key.slice(files.length), object.size]));
      // In the drive: not sent, and not named by this snapshot on S3.
      const inS3 = all.filter(blob => driveOf(blob.id) === null);
      for (const blob of inS3) {
        if (signal.aborted) throw new RunError(STOPPED);
        const key = storedKey(blob);
        const known = this.fileRow.get(blob.id) as { key: string; bytes: number } | undefined;
        const there = present.get(key.slice('fichiers/'.length));
        if (known?.key === key && there === known.bytes) continue;
        // A file that cannot be read (gone from the disk and the drive) is left out, not the whole backup.
        try {
          // The original only (never a display copy in its place, which would overwrite the real one on S3).
          const file = await blobs.openKept(blob.id);
          if (!file) throw new Error('no file');
          if (there !== undefined && there === file.size) {
            this.putFile.run(blob.id, key, there, startedAt);
            continue;
          }
          const size = await this.send(client, `${config.prefix}${key}`, file);
          stillThere();
          this.putFile.run(blob.id, key, size, startedAt);
          sent += 1;
        } catch (error) {
          if (error instanceof S3Error || error instanceof RunError || signal.aborted) throw error;
          skipped += 1;
          log.warn('backup: a file could not be read', { id: blob.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
      // Every file this snapshot names, sent now or before, is needed while it is kept.
      transaction(db, () => {
        for (const blob of inS3) this.touchFile.run(startedAt, blob.id);
      });

      stillThere();
      await client.put(`${snapshotsPrefix(config)}${name}`, await openAsBlob(archive), 'application/gzip', signal);
      this.addSnapshot.run(name, startedAt);
      const pruned = await this.prune(client, config, name, filesInUse(apps, stored));
      const unread = skipped > 0 ? `${plural(skipped, 'fichier illisible', 'fichiers illisibles')}, absent${skipped > 1 ? 's' : ''} de cette sauvegarde` : null;
      const warning = [unread, pruned ? null : CLOCK_BEHIND].filter(Boolean).join(' · ') || null;
      this.finishRun.run(this.now(), 1, warning, name, bytes, sent, runId);
      log.info('backup sent to S3', { snapshot: name, bytes, filesSent: sent, skipped });
    } catch (error) {
      this.finishRun.run(this.now(), 0, backupProblem(error), null, bytes, sent, runId);
      log.error('backup failed', { error });
    } finally {
      await rm(archive, { force: true });
      this.trimRuns.run(RUNS_KEPT);
    }
  }

  /** Sends one file and gives its size as sent. */
  private async send(client: S3Client, key: string, file: BlobFile): Promise<number> {
    const mime = file.mime || 'application/octet-stream';
    if (file.path) {
      const body = await openAsBlob(file.path);
      await client.put(key, body, mime, this.stopper.signal);
      return body.size;
    }
    // In the drive: through a temporary file, since S3 wants the size before the bytes.
    const temporary = await toTempFile((await file.read(this.stopper.signal)).body, this.options.tmpDir);
    try {
      const body = await openAsBlob(temporary);
      await client.put(key, body, mime, this.stopper.signal);
      return body.size;
    } finally {
      await rm(temporary, { force: true });
    }
  }

  /**
   * Keeps the newest `keep` snapshots this server made, and the files any snapshot kept names
   * (another server's included). Names sort by the time they were made: when one sorts after
   * `made` (this run's), the server's clock is behind (a box without a battery-backed clock,
   * booted before it got the time) and nothing is deleted (false).
   */
  private async prune(client: S3Client, config: BackupConfig, made: string, referenced: ReadonlySet<string>): Promise<boolean> {
    const prefix = snapshotsPrefix(config);
    const snapshots = (await client.list(prefix)).filter(object => SNAPSHOT_NAME.test(object.key.slice(prefix.length)) && !object.key.endsWith('-complet.tar.gz')).sort((a, b) => (a.key < b.key ? -1 : 1));
    if (snapshots.some(object => object.key > `${prefix}${made}`)) {
      log.warn('backup: the new snapshot is not the newest on S3 (server clock behind?): nothing pruned', { snapshot: made, newest: snapshots.at(-1)?.key });
      return false;
    }
    const own = new Set((this.ownSnapshots.all() as unknown as { name: string }[]).map(row => row.name));
    const mine = snapshots.filter(object => own.has(object.key.slice(prefix.length)));
    const extra = new Set(mine.slice(0, Math.max(0, mine.length - config.keep)));
    for (const object of extra) {
      await client.delete(object.key);
      this.forgetSnapshot.run(object.key.slice(prefix.length));
    }
    const oldest = snapshots.find(object => !extra.has(object));
    if (!oldest) return true;
    const cutoff = snapshotTime(oldest.key.slice(prefix.length), oldest.lastModified);
    for (const row of this.staleFiles.all(cutoff) as unknown as { blob_id: string; key: string; here: number }[]) {
      // The drive holds it now: S3's older copy goes once no snapshot kept names it. Otherwise only
      // a blob gone that no live record points at (one not restored yet: S3's copy may be the last).
      const inDrive = row.here === 1 && this.options.drive?.pathOf(row.blob_id) != null;
      if (!inDrive && (row.here === 1 || referenced.has(row.blob_id))) continue;
      await client.delete(`${config.prefix}${row.key}`);
      this.dropFile.run(row.blob_id);
    }
    return true;
  }
}
