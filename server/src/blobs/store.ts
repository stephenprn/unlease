/**
 * Blob bytes on disk under `blobs/<shard>/<id>` (display) and `<id>.orig`
 * (original), with one `blobs` row each. Files are written (and flushed to the
 * disk) before the row and renamed into place, so a row always has its files,
 * a power cut cannot leave one empty, and a reader never sees half a file. With a drive (Seafile), an upload's original lives there once
 * sent, and only the display copy stays on disk.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { StatementSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Database } from '../db/database';

export type BlobSource = 'upload' | 'link';
export type BlobVariant = 'display' | 'original';

export interface BlobInfo {
  readonly id: string;
  /** The original's type. */
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly displayMime: string;
  readonly displayBytes: number;
  readonly source: BlobSource;
  readonly createdAt: number;
}

interface Row {
  id: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  display_mime: string;
  display_bytes: number;
  source: BlobSource;
  created_at: number;
}

const fromRow = (row: Row): BlobInfo => ({
  id: row.id,
  mime: row.mime,
  width: row.width,
  height: row.height,
  bytes: row.bytes,
  displayMime: row.display_mime,
  displayBytes: row.display_bytes,
  source: row.source,
  createdAt: row.created_at,
});

export interface BlobFile {
  /** On this disk, or null when the drive holds it. */
  readonly path: string | null;
  readonly mime: string;
  readonly size: number;
  /** Which file is served: a link image has no original, a HEIC upload no display copy. */
  readonly variant: BlobVariant;
  /** The bytes, once, with their size as they come (a file changed in the drive may differ from `size`). */
  readonly read: (signal?: AbortSignal) => Promise<BlobBytes>;
}

export interface BlobBytes {
  readonly body: ReadableStream<Uint8Array>;
  readonly size: number;
}

/** Where originals go once a drive holds them (`drive/sync.ts`). */
export interface RemoteFiles {
  /** The drive's copy of a blob's original (no request until it is read). */
  find(id: string): { readonly size: number; readonly read: (signal?: AbortSignal) => Promise<BlobBytes> } | null;
  /** The blob is gone: so goes its copy in the drive. */
  forget(id: string): void;
}

/** Makes a rename into `dir` survive a power cut (not every file system can: then it is skipped). */
async function syncDir(dir: string): Promise<void> {
  try {
    const handle = await open(dir, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Not supported here.
  }
}

export class BlobStore {
  private readonly getOne: StatementSync;
  private readonly insert: StatementSync;
  private readonly deleteOne: StatementSync;
  private readonly olderThan: StatementSync;
  private readonly every: StatementSync;
  private readonly sums: StatementSync;
  private readonly unusedOf: StatementSync;
  private readonly setUnused: StatementSync;
  private remote: RemoteFiles | null = null;

  constructor(
    db: Database,
    readonly root: string,
    private readonly now: () => number = Date.now,
  ) {
    this.getOne = db.prepare('SELECT * FROM blobs WHERE id = ?');
    this.insert = db.prepare(
      `INSERT OR IGNORE INTO blobs (id, mime, width, height, bytes, display_mime, display_bytes, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.deleteOne = db.prepare('DELETE FROM blobs WHERE id = ?');
    this.olderThan = db.prepare('SELECT id FROM blobs WHERE created_at < ?');
    this.every = db.prepare('SELECT * FROM blobs ORDER BY created_at, id');
    this.sums = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(bytes), 0) AS bytes FROM blobs');
    this.unusedOf = db.prepare('SELECT unused_since FROM blobs WHERE id = ?');
    this.setUnused = db.prepare('UPDATE blobs SET unused_since = ? WHERE id = ?');
  }

  /** The drive that holds originals, once one is set. */
  useRemote(remote: RemoteFiles | null): void {
    this.remote = remote;
  }

  all(): BlobInfo[] {
    return (this.every.all() as unknown as Row[]).map(fromRow);
  }

  totals(): { readonly count: number; readonly bytes: number } {
    const row = this.sums.get() as { count: number; bytes: number };
    return { count: Number(row.count), bytes: Number(row.bytes) };
  }

  get(id: string): BlobInfo | undefined {
    const row = this.getOne.get(id) as Row | undefined;
    return row ? fromRow(row) : undefined;
  }

  path(id: string, variant: BlobVariant): string {
    // Ids start with a timestamp, so shard on a hash rather than their first characters.
    const shard = createHash('sha1').update(id).digest('hex').slice(0, 2);
    return join(this.root, shard, variant === 'display' ? id : `${id}.orig`);
  }

  async save(
    info: Omit<BlobInfo, 'createdAt'>,
    files: { readonly display: Buffer | null; readonly original: Buffer | null },
  ): Promise<BlobInfo> {
    if (files.display) await this.writeAtomic(this.path(info.id, 'display'), files.display);
    if (files.original) await this.writeAtomic(this.path(info.id, 'original'), files.original);
    this.insert.run(
      info.id,
      info.mime,
      info.width,
      info.height,
      info.bytes,
      info.displayMime,
      info.displayBytes,
      info.source,
      this.now(),
    );
    // Two uploads of one id can race; the first row wins and both wrote the same bytes.
    return this.get(info.id)!;
  }

  /** The file to serve: the variant asked for, else the other; an original in the drive comes before a display copy. */
  async open(id: string, wanted: BlobVariant): Promise<BlobFile | null> {
    const info = this.get(id);
    if (!info) return null;
    const order: (BlobVariant | 'remote')[] = wanted === 'display' ? ['display', 'original', 'remote'] : ['original', 'remote', 'display'];
    for (const variant of order) {
      if (variant === 'remote') {
        const copy = this.remote?.find(id);
        if (copy) return { path: null, size: copy.size, variant: 'original', mime: info.mime, read: copy.read };
        continue;
      }
      const path = this.path(id, variant);
      try {
        const stats = await stat(path);
        return {
          path,
          size: stats.size,
          variant,
          mime: variant === 'display' ? info.displayMime : info.mime,
          read: async () => ({ body: Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>, size: stats.size }),
        };
      } catch {
        // Not stored in this variant: try the other one.
      }
    }
    return null;
  }

  /**
   * The file a backup keeps, and nothing else: an upload's original (here or in the drive), a
   * link picture's display copy. Never the other variant, so a display copy is never kept as an
   * original.
   */
  async openKept(id: string): Promise<BlobFile | null> {
    const info = this.get(id);
    if (!info) return null;
    const file = await this.open(id, info.source === 'link' ? 'display' : 'original');
    return file && (info.source === 'link' || file.variant === 'original') ? file : null;
  }

  /** Whether the file a backup keeps (`openKept`) is here or in the drive, not empty, without reading it. */
  async holdsKept(id: string): Promise<boolean> {
    const info = this.get(id);
    if (!info) return false;
    if (info.source === 'upload' && this.remote?.find(id)) return true;
    try {
      return (await stat(this.path(id, info.source === 'link' ? 'display' : 'original'))).size > 0;
    } catch {
      return false;
    }
  }

  /** The original on this disk, if it is still here. */
  async localOriginal(id: string): Promise<{ readonly path: string; readonly size: number } | null> {
    const path = this.path(id, 'original');
    try {
      return { path, size: (await stat(path)).size };
    } catch {
      return null;
    }
  }

  /** Puts an original back on this disk (from the drive), whole or not at all. */
  async restoreOriginal(id: string, body: ReadableStream<Uint8Array>, size: number): Promise<void> {
    const path = this.path(id, 'original');
    await mkdir(join(path, '..'), { recursive: true });
    const temporary = `${path}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      await pipeline(Readable.fromWeb(body), createWriteStream(temporary, { flush: true }));
      const written = (await stat(temporary)).size;
      if (written !== size) throw new Error(`${id}: ${written} bytes instead of ${size}`);
      await rename(temporary, path);
      await syncDir(dirname(path));
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await rm(this.path(id, 'display'), { force: true });
    await rm(this.path(id, 'original'), { force: true });
    this.deleteOne.run(id);
    this.remote?.forget(id);
  }

  /** When the collector first found the blob unused, or null while something points at it. */
  unusedSince(id: string): number | null {
    const row = this.unusedOf.get(id) as { unused_since: number | null } | undefined;
    return row?.unused_since ?? null;
  }

  markUnused(id: string, since: number | null): void {
    this.setUnused.run(since, id);
  }

  idsCreatedBefore(cutoff: number): string[] {
    return (this.olderThan.all(cutoff) as unknown as { id: string }[]).map(row => row.id);
  }

  private async writeAtomic(path: string, data: Buffer): Promise<void> {
    await mkdir(join(path, '..'), { recursive: true });
    const temporary = `${path}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(temporary, data, { flush: true });
    await rename(temporary, path);
    await syncDir(dirname(path));
  }
}
