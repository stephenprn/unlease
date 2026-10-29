/**
 * The Administration's services in one place for the routes: backups, the drive, restores, what
 * the server holds, and download tickets (a browser or a phone's browser downloads an archive
 * without the bearer token: the ticket, random and short-lived, is the key).
 */
import { randomBytes } from 'node:crypto';
import type { StatementSync } from 'node:sqlite';
import type { AdminStatus } from '@unlease/core/sync/admin';
import type { BackupService } from './backup/service';
import type { RestoreService } from './backup/restore';
import type { BlobStore } from './blobs/store';
import type { Database } from './db/database';
import type { DriveSync } from './drive/sync';

const TICKET_MS = 10 * 60_000;

export type DownloadTarget = { readonly kind: 'snapshot'; readonly name: string } | { readonly kind: 'full'; readonly name: string };

export interface AdministrationOptions {
  readonly db: Database;
  readonly blobs: BlobStore;
  readonly backups: BackupService;
  readonly drive: DriveSync;
  readonly restore: RestoreService;
  /** Where uploaded archives wait for their restore. */
  readonly tmpDir: string;
  readonly version: string;
  readonly now?: () => number;
}

export class Administration {
  readonly backups: BackupService;
  readonly drive: DriveSync;
  readonly restore: RestoreService;
  readonly tmpDir: string;
  private readonly now: () => number;
  private readonly counts: StatementSync;
  private readonly tickets = new Map<string, { readonly target: DownloadTarget; readonly until: number }>();

  constructor(private readonly options: AdministrationOptions) {
    this.backups = options.backups;
    this.drive = options.drive;
    this.restore = options.restore;
    this.tmpDir = options.tmpDir;
    this.now = options.now ?? Date.now;
    this.counts = options.db.prepare(
      `SELECT
         SUM(type = 'note' AND COALESCE(json_extract(fields, '$.kind'), 'text') != 'links') AS notes,
         SUM(type = 'block' AND json_extract(fields, '$.kind') = 'page') AS pages
       FROM records WHERE type IN ('note', 'block') AND json_extract(fields, '$.deletedAt') IS NULL`,
    );
  }

  status(): AdminStatus {
    const counts = this.counts.get() as { notes: number | null; pages: number | null };
    const files = this.options.blobs.totals();
    return {
      server: { version: this.options.version, notes: Number(counts.notes ?? 0), pages: Number(counts.pages ?? 0), files: files.count, fileBytes: files.bytes },
      backup: this.backups.status(),
      drive: this.drive.status(),
      restore: this.restore.status(),
    };
  }

  issueTicket(target: DownloadTarget): string {
    const now = this.now();
    for (const [key, ticket] of this.tickets) if (ticket.until < now) this.tickets.delete(key);
    const key = randomBytes(24).toString('base64url');
    this.tickets.set(key, { target, until: now + TICKET_MS });
    return key;
  }

  /** What a ticket downloads, while it is valid (a resumed download may ask again). */
  ticket(key: string): DownloadTarget | null {
    const ticket = this.tickets.get(key);
    if (!ticket || ticket.until < this.now()) return null;
    return ticket.target;
  }
}
