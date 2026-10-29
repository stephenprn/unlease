/**
 * The Administration's live side: what the server holds, how its backups and its drive are doing,
 * and restoring a backup. The settings themselves are `core/sync/settings.ts`.
 *
 * `GET  /api/admin`                      -> AdminStatus
 * `GET  /api/admin/backups`              -> BackupList (409 without S3, 502 when S3 fails)
 * `POST /api/admin/backups`              -> 202 AdminStatus: a backup starts now
 * `POST /api/admin/drive/sync`           -> 202 AdminStatus: a pass over the drive starts now
 * `POST /api/admin/restore?mode=`        -> 202 AdminStatus: JSON `{ snapshot }` restores one from
 *                                           S3; an archive as the body (or a multipart `file`) restores it
 * `POST /api/admin/downloads`            -> DownloadTicket for `{ snapshot }` or `{ full: true }`
 * `GET  /api/downloads/:ticket`          -> the archive, without the bearer token (the ticket is the key)
 *
 * Refusals are `{ error }` in French. Backups, passes and restores run on the server: the apps ask
 * `GET /api/admin` again while one runs.
 */

/**
 * `merge` brings back what the server lacks and keeps every later change (the backup's own
 * clocks); `rollback` makes the backup's values win everywhere (fresh clocks), keeping what was
 * created since. A server that holds nothing always merges.
 */
export const RESTORE_MODES = ['merge', 'rollback'] as const;
export type RestoreMode = (typeof RESTORE_MODES)[number];

export function isRestoreMode(value: unknown): value is RestoreMode {
  return typeof value === 'string' && (RESTORE_MODES as readonly string[]).includes(value);
}

/** The archive a backup is: `unlease-2026-10-26T03-00-00Z.tar.gz`, every app's records in one `unlease.json`. */
export const BACKUP_FORMAT = 'unlease-backup';
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupRun {
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly ok: boolean;
  /** Why it failed, in French. */
  readonly error: string | null;
  /** The snapshot's name on S3. */
  readonly snapshot: string | null;
  /** The snapshot's size. */
  readonly bytes: number;
  /** Files sent to S3 by this run (each file is sent once). */
  readonly filesSent: number;
  readonly trigger: 'schedule' | 'manual';
}

export interface BackupStatus {
  readonly running: boolean;
  readonly last: BackupRun | null;
  readonly lastSuccessAt: number | null;
  /** When the next scheduled backup is due; null when none is scheduled. */
  readonly nextAt: number | null;
}

export interface DriveStatus {
  readonly running: boolean;
  /** Files the drive holds for the server. */
  readonly files: number;
  readonly bytes: number;
  /** Files to send, move or delete; while leaving, files still to bring back. */
  readonly waiting: number;
  readonly lastPassAt: number | null;
  /** The last pass's failure, in French. */
  readonly error: string | null;
}

export interface RestoreReport {
  readonly mode: RestoreMode;
  /** The snapshot's name, or the uploaded file's. */
  readonly source: string;
  /** Records written. */
  readonly records: number;
  /** Files put back. */
  readonly files: number;
  /** Files the backup names that could not be found (not in the archive, the drive, nor on S3). */
  readonly missingFiles: number;
  /** Files the backup keeps in a drive (Seafile) this server is not linked to: they come back once it is, and the restore run again. */
  readonly needDrive: number;
}

export interface RestoreStatus {
  readonly running: boolean;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly error: string | null;
  readonly report: RestoreReport | null;
}

export interface AdminStatus {
  readonly server: {
    readonly version: string;
    readonly notes: number;
    readonly pages: number;
    /** Photos and files the server knows, wherever their bytes are. */
    readonly files: number;
    readonly fileBytes: number;
  };
  readonly backup: BackupStatus;
  readonly drive: DriveStatus;
  readonly restore: RestoreStatus;
}

export interface BackupSnapshot {
  readonly name: string;
  readonly at: number;
  readonly bytes: number;
}

export interface BackupList {
  /** Newest first. */
  readonly snapshots: readonly BackupSnapshot[];
}

export interface DownloadTicket {
  /** A path on the server (`/api/downloads/…`), valid a few minutes, opened without the token. */
  readonly url: string;
  readonly name: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const time = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const words = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

function parseRun(value: unknown): BackupRun | null {
  if (!isObject(value) || typeof value.startedAt !== 'number') return null;
  return {
    startedAt: value.startedAt,
    finishedAt: time(value.finishedAt),
    ok: value.ok === true,
    error: words(value.error),
    snapshot: words(value.snapshot),
    bytes: num(value.bytes),
    filesSent: num(value.filesSent),
    trigger: value.trigger === 'manual' ? 'manual' : 'schedule',
  };
}

function parseReport(value: unknown): RestoreReport | null {
  if (!isObject(value) || !isRestoreMode(value.mode)) return null;
  return { mode: value.mode, source: words(value.source) ?? '', records: num(value.records), files: num(value.files), missingFiles: num(value.missingFiles), needDrive: num(value.needDrive) };
}

export function parseAdminStatus(body: unknown): AdminStatus | null {
  if (!isObject(body) || !isObject(body.server)) return null;
  const server = body.server;
  const backup = isObject(body.backup) ? body.backup : {};
  const drive = isObject(body.drive) ? body.drive : {};
  const restore = isObject(body.restore) ? body.restore : {};
  return {
    server: { version: words(server.version) ?? '', notes: num(server.notes), pages: num(server.pages), files: num(server.files), fileBytes: num(server.fileBytes) },
    backup: { running: backup.running === true, last: parseRun(backup.last), lastSuccessAt: time(backup.lastSuccessAt), nextAt: time(backup.nextAt) },
    drive: {
      running: drive.running === true,
      files: num(drive.files),
      bytes: num(drive.bytes),
      waiting: num(drive.waiting),
      lastPassAt: time(drive.lastPassAt),
      error: words(drive.error),
    },
    restore: {
      running: restore.running === true,
      startedAt: time(restore.startedAt),
      finishedAt: time(restore.finishedAt),
      error: words(restore.error),
      report: parseReport(restore.report),
    },
  };
}

export function parseBackupList(body: unknown): BackupList | null {
  if (!isObject(body) || !Array.isArray(body.snapshots)) return null;
  const snapshots = body.snapshots.flatMap((entry): BackupSnapshot[] =>
    isObject(entry) && typeof entry.name === 'string' && entry.name ? [{ name: entry.name, at: num(entry.at), bytes: num(entry.bytes) }] : [],
  );
  return { snapshots };
}

export function parseDownloadTicket(body: unknown): DownloadTicket | null {
  if (!isObject(body) || typeof body.url !== 'string' || !body.url.startsWith('/api/downloads/')) return null;
  return { url: body.url, name: words(body.name) ?? 'carnet.tar.gz' };
}
