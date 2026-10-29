/**
 * Keeps the drive's folder in step with the notes and pages: each pass sends the originals it
 * lacks (photos of notes, files of pages; not link pictures), moves those whose note or page was
 * renamed, deletes those whose blob the collector removed, then removes the folders left empty.
 * Once a file is in the drive its original leaves this disk (after a pause, so a read under way
 * ends first); the display copy stays. A file already at its place in the drive with the same size
 * (a server restored on a new box, its drive kept) is taken as it is, never sent a second time. Turned off, a pass brings every original back first.
 * One pass at a time; a failed pass is retried by the next, and a pass stops as soon as the
 * drive's settings change under it.
 */
import { openAsBlob } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, dirname } from 'node:path/posix';
import type { StatementSync } from 'node:sqlite';
import { plural } from '@unlease/core/services/format';
import type { DriveStatus } from '@unlease/core/sync/admin';
import { filesOf } from '../apps/hooks';
import type { ServerApp } from '../apps/types';
import type { BlobBytes, BlobStore, RemoteFiles } from '../blobs/store';
import type { Database } from '../db/database';
import { log } from '../log';
import type { DriveConfig, SettingsStore } from '../settings/store';
import type { RecordStore } from '../sync/records';
import { SeafileClient, SeafileError, seafileProblem, type Dirent } from './seafile';

/** How long an original stays on disk after it reached the drive. */
const LOCAL_GRACE_MS = 10 * 60_000;
const PASS_INTERVAL_MS = 5 * 60_000;
/** A new upload is sent after this pause, so a burst of photos goes in one pass. */
const KICK_DELAY_MS = 20_000;

/** `stored` in the drive, to `delete` from it, or `lost`: gone from the drive with no copy left here. */
interface Row {
  readonly blob_id: string;
  readonly path: string;
  readonly bytes: number;
  readonly state: 'stored' | 'delete' | 'lost';
  readonly updated_at: number;
}

export interface DriveSyncOptions {
  readonly db: Database;
  readonly records: RecordStore;
  /** The apps whose files the drive holds, each under its own folder. */
  readonly apps: readonly ServerApp[];
  readonly blobs: BlobStore;
  readonly settings: SettingsStore;
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
}

/** `x (1).jpg` for `x.jpg`: where Seafile put a file whose name was taken. */
const settled = (path: string, target: string): boolean => path === target || path.replace(/ \(\d+\)(?=\.[^./]*$|$)/, '') === target;

/** Whether an error stops the pass (the drive is unreachable or refuses the token) rather than one file. */
const fatal = (error: unknown): boolean => !(error instanceof SeafileError) || error.status <= 0 || error.status === 401 || error.status === 403 || error.status === 443;

const missing = (error: unknown): boolean => error instanceof SeafileError && error.status === 404;

/** The same drive, still on: a pass stops when this no longer holds. */
const sameDrive = (a: DriveConfig, b: DriveConfig | null): boolean =>
  b !== null && a.url === b.url && a.token === b.token && a.repoId === b.repoId && a.folder === b.folder && a.leaving === b.leaving;

export class DriveSync implements RemoteFiles {
  private readonly now: () => number;
  private readonly fetcher: typeof fetch;
  private readonly rowsAll: StatementSync;
  private readonly rowOne: StatementSync;
  private readonly insert: StatementSync;
  private readonly movePath: StatementSync;
  private readonly setBytes: StatementSync;
  private readonly setState: StatementSync;
  private readonly markDelete: StatementSync;
  private readonly drop: StatementSync;
  private readonly adoptRow: StatementSync;
  private running: Promise<void> | null = null;
  private queued: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private kickTimer: NodeJS.Timeout | null = null;
  private readonly stopper = new AbortController();
  private lastPassAt: number | null = null;
  private error: string | null = null;
  private waiting = 0;

  constructor(private readonly options: DriveSyncOptions) {
    this.now = options.now ?? Date.now;
    this.fetcher = options.fetcher ?? fetch;
    const { db } = options;
    this.rowsAll = db.prepare('SELECT * FROM drive_files');
    this.rowOne = db.prepare("SELECT * FROM drive_files WHERE blob_id = ? AND state = 'stored'");
    this.insert = db.prepare('INSERT INTO drive_files (blob_id, path, bytes, state, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (blob_id) DO NOTHING');
    // A move keeps the row's state: a blob the collector removed meanwhile is still deleted, at its new place.
    this.movePath = db.prepare('UPDATE drive_files SET path = ? WHERE blob_id = ?');
    this.setBytes = db.prepare('UPDATE drive_files SET bytes = ? WHERE blob_id = ?');
    this.setState = db.prepare('UPDATE drive_files SET state = ?, updated_at = ? WHERE blob_id = ?');
    this.markDelete = db.prepare("UPDATE drive_files SET state = 'delete', updated_at = ? WHERE blob_id = ?");
    this.drop = db.prepare('DELETE FROM drive_files WHERE blob_id = ?');
    this.adoptRow = db.prepare(
      "INSERT INTO drive_files (blob_id, path, bytes, state, updated_at) VALUES (?, ?, ?, 'stored', ?) ON CONFLICT (blob_id) DO UPDATE SET path = excluded.path, bytes = excluded.bytes, state = 'stored', updated_at = excluded.updated_at",
    );
  }

  private client(config: DriveConfig): SeafileClient {
    return new SeafileClient(config.url, config.token, this.fetcher);
  }

  // RemoteFiles: what the blob store asks.

  find(id: string): { readonly size: number; readonly read: (signal?: AbortSignal) => Promise<BlobBytes> } | null {
    const row = this.rowOne.get(id) as Row | undefined;
    const config = this.options.settings.drive();
    if (!row || !config) return null;
    return {
      size: row.bytes,
      read: async signal => {
        const file = await this.client(config).download(row.path, signal);
        // Edited in the drive (a photo turned, a PDF annotated): its size is the drive's now.
        const size = file.size >= 0 ? file.size : row.bytes;
        if (size !== row.bytes) this.setBytes.run(size, id);
        return { body: file.body, size };
      },
    };
  }

  forget(id: string): void {
    this.markDelete.run(this.now(), id);
  }

  // What backups and restores ask.

  /** Where the drive holds a blob's original, or null (no drive, or not there yet). */
  pathOf(id: string): string | null {
    if (!this.options.settings.drive()) return null;
    return (this.rowOne.get(id) as Row | undefined)?.path ?? null;
  }

  /** A drive is set (and not being turned off): a restore takes files from it. */
  ready(): boolean {
    const config = this.options.settings.drive();
    return config !== null && !config.leaving;
  }

  /** A folder of the drive, or null when it does not exist (or no drive is set). */
  async filesIn(dir: string): Promise<Dirent[] | null> {
    const config = this.options.settings.drive();
    return config ? this.client(config).list(dir) : null;
  }

  /** A file of the drive, by its path. */
  async fetch(path: string, signal?: AbortSignal): Promise<BlobBytes> {
    const config = this.options.settings.drive();
    if (!config) throw new SeafileError(0, 'no drive');
    const file = await this.client(config).download(path, signal);
    return { body: file.body, size: file.size };
  }

  /** The drive holds the blob's original at `path`, as it is (a restore found it there). */
  adopt(id: string, path: string, bytes: number): void {
    this.adoptRow.run(id, path, bytes, this.now());
  }

  // Scheduling.

  start(): void {
    const tick = () => void this.run();
    setTimeout(tick, 15_000).unref();
    this.timer = setInterval(tick, PASS_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.kickTimer) clearTimeout(this.kickTimer);
    this.timer = null;
    this.stopper.abort();
  }

  /** Something changed (an upload, a restore): a pass soon. */
  kick(): void {
    if (this.kickTimer || !this.options.settings.drive()) return;
    this.kickTimer = setTimeout(() => {
      this.kickTimer = null;
      void this.run();
    }, KICK_DELAY_MS);
    this.kickTimer.unref();
  }

  /** A pass that starts after this call: asked during one, the next follows it (callers meanwhile share it). */
  run(): Promise<void> {
    if (this.stopper.signal.aborted) return Promise.resolve();
    if (this.running) {
      this.queued ??= this.running.then(() => {
        this.queued = null;
        return this.run();
      });
      return this.queued;
    }
    this.running = this.pass()
      .catch(error => {
        this.error = seafileProblem(error);
        log.warn('drive pass failed', { error: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        this.running = null;
        this.lastPassAt = this.now();
      });
    return this.running;
  }

  status(): DriveStatus {
    const rows = this.rowsAll.all() as unknown as Row[];
    const stored = rows.filter(row => row.state === 'stored');
    const lost = rows.filter(row => row.state === 'lost').length;
    const config = this.options.settings.drive();
    return {
      running: this.running !== null,
      files: stored.length,
      bytes: stored.reduce((sum, row) => sum + row.bytes, 0),
      waiting: config?.leaving ? rows.length : this.waiting,
      lastPassAt: this.lastPassAt,
      error: config ? (this.error ?? (lost > 0 ? `${plural(lost, 'fichier introuvable', 'fichiers introuvables')} dans Seafile, sans copie sur le serveur` : null)) : null,
    };
  }

  // The pass.

  private async pass(): Promise<void> {
    const config = this.options.settings.drive();
    if (!config) {
      this.waiting = 0;
      this.error = null;
      return;
    }
    const client = this.client(config);
    if (config.leaving) return this.bringBack(client, config);

    const { blobs, records, apps, settings } = this.options;
    const signal = this.stopper.signal;
    const current = () => !signal.aborted && sameDrive(config, settings.drive());
    const known = new Map(blobs.all().map(blob => [blob.id, blob]));
    const files = filesOf(apps, records.all(), { kept: false, mimeOf: id => known.get(id)?.mime });
    const rows = new Map((this.rowsAll.all() as unknown as Row[]).map(row => [row.blob_id, row]));
    const dirs = new Set<string>();
    const emptied = new Set<string>();
    let failure: string | null = null;
    let stopped = false;
    const attempt = async (what: string, work: () => Promise<void>): Promise<void> => {
      if (stopped || !current()) {
        stopped = true;
        return;
      }
      try {
        await work();
        this.waiting = Math.max(0, this.waiting - 1);
      } catch (error) {
        if (fatal(error)) throw error;
        failure ??= seafileProblem(error);
        log.warn('drive: a file failed', { what, error: error instanceof Error ? error.message : String(error) });
      }
    };

    const deletions = [...rows.values()].filter(row => row.state === 'delete');
    const moves: [string, string, Row][] = [];
    const uploads: [string, string][] = [];
    for (const [id, relative] of files) {
      if (known.get(id)?.source !== 'upload') continue;
      const target = `${config.folder}/${relative}`;
      const row = rows.get(id);
      if (row?.state === 'stored') {
        if (!settled(row.path, target)) moves.push([id, target, row]);
      } else if (!row) {
        uploads.push([id, target]);
      }
    }
    this.waiting = deletions.length + moves.length + uploads.length;
    this.error = null;

    for (const row of deletions) {
      await attempt(row.path, async () => {
        try {
          await client.delete(row.path);
        } catch (error) {
          // Gone already (lost, deleted by hand): nothing left to delete.
          if (!missing(error)) throw error;
        }
        this.drop.run(row.blob_id);
        emptied.add(dirname(row.path));
      });
    }
    for (const [id, target, row] of moves) {
      await attempt(row.path, async () => {
        try {
          this.movePath.run(await client.place(row.path, target, dirs), id);
          emptied.add(dirname(row.path));
        } catch (error) {
          if (!missing(error)) throw error;
          await this.notWhereItWas(client, id, row, target, dirs);
        }
      });
    }
    // Each folder listed once a pass, to find files already where they go.
    const listings = new Map<string, Promise<Dirent[] | null>>();
    const listed = (dir: string): Promise<Dirent[] | null> => {
      let listing = listings.get(dir);
      if (!listing) listings.set(dir, (listing = client.list(dir).catch(() => null)));
      return listing;
    };
    for (const [id, target] of uploads) {
      await attempt(target, async () => {
        const local = await blobs.localOriginal(id);
        if (!local) return;
        // Already there, the same bytes (the drive kept while the server was restored): taken, not sent twice.
        const there = (await listed(dirname(target)))?.find(entry => entry.type === 'file' && entry.size === local.size && settled(`${dirname(target)}/${entry.name}`, target));
        if (there) {
          this.adopt(id, `${dirname(target)}/${there.name}`, local.size);
          return;
        }
        const landed = await client.upload(dirname(target), basename(target), await openAsBlob(local.path), signal);
        // Removed by the collector while it travelled: it goes from the drive too.
        this.insert.run(id, landed, local.size, blobs.get(id) ? 'stored' : 'delete', this.now());
      });
    }
    if (stopped || !current()) return;

    // Originals that reached the drive a while ago leave this disk: the drive holds them.
    const cutoff = this.now() - LOCAL_GRACE_MS;
    for (const row of this.rowsAll.all() as unknown as Row[]) {
      if (row.state === 'stored' && row.updated_at < cutoff) await rm(blobs.path(row.blob_id, 'original'), { force: true });
    }

    for (const dir of [...emptied].sort((a, b) => b.length - a.length)) await this.prune(client, dir, config.folder);
    if (failure) this.error = failure;
  }

  /**
   * A move found nothing at the file's path. If the file is in fact there (the 404 was about
   * something else), the next pass tries again; if it is already where it goes (moved before this
   * server's database was put back from a copy), it is taken there; if it is gone, the original on
   * this disk (still there in the first minutes) is sent again; with none, the file is marked lost,
   * never forgotten.
   */
  private async notWhereItWas(client: SeafileClient, id: string, row: Row, target: string, dirs: Set<string>): Promise<void> {
    dirs.clear();
    const siblings = await client.list(dirname(row.path));
    if (siblings?.some(entry => entry.name === basename(row.path))) throw new SeafileError(409, `${row.path}: the move failed`);
    const arrived = (await client.list(dirname(target)))?.find(entry => entry.type === 'file' && settled(`${dirname(target)}/${entry.name}`, target));
    if (arrived) {
      this.movePath.run(`${dirname(target)}/${arrived.name}`, id);
      return;
    }
    if (await this.options.blobs.localOriginal(id)) {
      this.drop.run(id);
      return;
    }
    this.setState.run('lost', this.now(), id);
    log.warn('drive: a file is gone from the drive, with no copy on the server', { path: row.path });
  }

  /** Removes `dir` and its parents while they are empty, never the managed folder itself. */
  private async prune(client: SeafileClient, dir: string, root: string): Promise<void> {
    for (let current = dir; current.startsWith(`${root}/`); current = dirname(current)) {
      try {
        const entries = await client.list(current);
        if (entries === null) continue;
        if (entries.length > 0) return;
        await client.deleteDir(current);
      } catch {
        return;
      }
    }
  }

  /** Turning off: every original comes back to this disk, then the drive is forgotten (unless it was set again meanwhile). */
  private async bringBack(client: SeafileClient, config: DriveConfig): Promise<void> {
    const { blobs, settings } = this.options;
    let failed = 0;
    let lost = 0;
    let problem: string | null = null;
    for (const row of this.rowsAll.all() as unknown as Row[]) {
      if (this.stopper.signal.aborted || !sameDrive(config, settings.drive())) return;
      try {
        if (row.state === 'stored' && blobs.get(row.blob_id) && !(await blobs.localOriginal(row.blob_id))) {
          const file = await client.download(row.path, this.stopper.signal);
          await blobs.restoreOriginal(row.blob_id, file.body, file.size >= 0 ? file.size : row.bytes);
        } else if (row.state === 'delete') {
          await client.delete(row.path);
        }
        this.drop.run(row.blob_id);
      } catch (error) {
        if (missing(error)) {
          // Gone from the drive: nothing left to bring back.
          lost += 1;
          this.drop.run(row.blob_id);
          log.warn('drive: a file to bring back is gone from the drive', { path: row.path });
          continue;
        }
        if (fatal(error)) throw error;
        failed += 1;
        problem ??= seafileProblem(error);
      }
    }
    this.waiting = failed;
    if (failed > 0) {
      this.error = `${plural(failed, 'fichier n’a', 'fichiers n’ont')} pas pu revenir : ${problem}`;
      return;
    }
    this.error = null;
    if (sameDrive(config, settings.drive())) settings.updateDrive(null);
    log.info('drive turned off: every file is back on the server', { lost });
  }
}
