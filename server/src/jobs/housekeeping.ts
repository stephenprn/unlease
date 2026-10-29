/**
 * Hourly chores, each safe to run any number of times:
 *  - each app's own (`ServerApp.chores`: Carnet empties its bin);
 *  - blob files no app's record points at any more are deleted once a week old (a photo
 *    uploaded before its record syncs) and unused for UNUSED_GRACE_DAYS (a file block cut
 *    and pasted later, an undo); those of a record the server itself tombstoned lately
 *    stay PURGED_BLOB_DAYS, in case a device restores it (Carnet's emptied bin);
 *  - once a day, a consistent copy of the database in `backups/` (the last
 *    SNAPSHOTS_KEPT days): what a file backup should copy, since a copy of the
 *    live file taken mid-write may not open.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SUITE_SLUG } from '@unlease/core/apps';
import { hlcNode, randomNodeId } from '@unlease/core/sync/hlc';
import { filesInUse } from '../apps/hooks';
import type { ServerApp } from '../apps/types';
import type { BlobStore } from '../blobs/store';
import type { Database } from '../db/database';
import { log } from '../log';
import type { RecordStore, StoredRecord } from '../sync/records';
import type { SyncService } from '../sync/service';

const DAY = 86_400_000;
const BLOB_GRACE_DAYS = 7;
/** How long a blob stays once nothing points at it any more, counted from when the collector first saw it so. */
export const UNUSED_GRACE_DAYS = 2;
/** How long the files of a record the server tombstoned are kept, for a device that restores it later (Carnet's emptied bin). */
export const PURGED_BLOB_DAYS = 30;
export const SNAPSHOTS_KEPT = 7;
const SNAPSHOT = new RegExp(`^${SUITE_SLUG}-\\d{4}-\\d{2}-\\d{2}\\.sqlite$`);

export interface HousekeepingOptions {
  readonly db: Database;
  readonly sync: SyncService;
  readonly records: RecordStore;
  readonly blobs: BlobStore;
  /** The apps whose chores run and whose files stay. */
  readonly apps: readonly ServerApp[];
  /** Where `backups/` goes; without it, no snapshots. */
  readonly dataDir?: string;
  readonly now?: () => number;
}

export interface HousekeepingReport {
  readonly tombstoned: number;
  readonly blobsRemoved: number;
  /** The snapshot written by this pass, if one was due. */
  readonly snapshot: string | null;
}

export class Housekeeping {
  private readonly now: () => number;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<HousekeepingReport> | null = null;

  constructor(private readonly options: HousekeepingOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Concurrent calls share one pass. */
  run(): Promise<HousekeepingReport> {
    this.running ??= this.pass().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  start(intervalMs = 3_600_000): void {
    const tick = () => {
      this.run().catch(error => log.error('housekeeping failed', { error }));
    };
    setTimeout(tick, 10_000).unref();
    this.timer = setInterval(tick, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async pass(): Promise<HousekeepingReport> {
    const now = this.now();
    const tombstoned = this.options.apps.reduce((sum, app) => sum + (app.chores?.(now) ?? 0), 0);
    const blobsRemoved = await this.collectBlobs();
    const snapshot = this.snapshot();
    if (tombstoned > 0 || blobsRemoved > 0 || snapshot) log.info('housekeeping', { tombstoned, blobsRemoved, snapshot });
    return { tombstoned, blobsRemoved, snapshot };
  }

  /** Today's copy of the database, if there is none yet, and the oldest beyond SNAPSHOTS_KEPT removed. */
  private snapshot(): string | null {
    if (!this.options.dataDir) return null;
    const dir = join(this.options.dataDir, 'backups');
    const file = join(dir, `${SUITE_SLUG}-${new Date(this.now()).toISOString().slice(0, 10)}.sqlite`);
    if (existsSync(file)) return null;
    mkdirSync(dir, { recursive: true });
    const temporary = `${file}.tmp`;
    rmSync(temporary, { force: true });
    try {
      this.options.db.exec(`VACUUM INTO '${temporary.replaceAll("'", "''")}'`);
      // A dataset of its own: restored, every device sends back what it wrote since.
      const copy = new DatabaseSync(temporary);
      try {
        copy.prepare("INSERT INTO meta (key, value) VALUES ('epoch', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(randomNodeId());
      } finally {
        copy.close();
      }
      renameSync(temporary, file);
    } catch (error) {
      rmSync(temporary, { force: true });
      log.error('database snapshot failed', { error });
      return null;
    }
    const snapshots = readdirSync(dir).filter(name => SNAPSHOT.test(name)).sort();
    for (const name of snapshots.slice(0, Math.max(0, snapshots.length - SNAPSHOTS_KEPT))) rmSync(join(dir, name), { force: true });
    return file;
  }

  private async collectBlobs(): Promise<number> {
    const { blobs } = this.options;
    const old = blobs.idsCreatedBefore(this.now() - BLOB_GRACE_DAYS * DAY);
    if (old.length === 0) return 0;
    // Live records keep their files, and so do those the server tombstoned lately (a restore brings them back).
    const purgeCutoff = this.now() - PURGED_BLOB_DAYS * DAY;
    const server = this.options.sync.node;
    const keep = (record: StoredRecord): boolean => {
      const deletedAt = record.fields.deletedAt;
      const clock = record.clocks.deletedAt;
      return typeof deletedAt === 'number' && deletedAt > purgeCutoff && typeof clock === 'string' && hlcNode(clock) === server;
    };
    const referenced = filesInUse(this.options.apps, this.options.records.all(), keep);
    let removed = 0;
    const now = this.now();
    for (const id of old) {
      const since = blobs.unusedSince(id);
      if (referenced.has(id)) {
        if (since !== null) blobs.markUnused(id, null);
        continue;
      }
      if (since === null) {
        blobs.markUnused(id, now);
        continue;
      }
      if (since > now - UNUSED_GRACE_DAYS * DAY) continue;
      await blobs.remove(id);
      removed += 1;
    }
    return removed;
  }
}
