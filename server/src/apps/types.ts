/**
 * An app's part of the server. The platform (sync, files, backups, the drive, the Administration)
 * runs the same for every app and asks each one only this; Carnet's is `notes/`, Pages' `pages/`.
 * Every app the registry (`registry.ts`) makes is loaded, and the records of every type their
 * packages declare are stored, synced and backed up whatever is on; the Administration turns apps on
 * and off (`ServerSettings.apps`): an app that is off answers none of its routes (404), hears of no
 * push, runs no chore and no background work (`runner.ts`).
 */
import type { HttpBindings } from '@hono/node-server';
import type { Hono } from 'hono';
import type { AppId } from '@unlease/core/apps';
import type { AdminStatus } from '@unlease/core/sync/admin';
import type { SyncRecord } from '@unlease/core/sync/record';
import type { MarkdownFile } from '../backup/markdown';
import type { StoredRecord } from '../sync/records';

export type Env = { Bindings: HttpBindings };

export interface FilesOptions {
  /** The pictures the server kept itself (a link's): an archive has them, the drive holds only what people added. */
  readonly kept: boolean;
  /** The type of a blob's stored file, when it is known. */
  readonly mimeOf?: (id: string) => string | undefined;
}

/** What the Administration counts of what the server holds, each app its own. */
export type AppCounts = Partial<Pick<AdminStatus['server'], 'notes' | 'pages' | 'contacts' | 'events'>>;

export interface ServerApp {
  readonly id: AppId;
  /** Records the app seeds on every device ("Non classé"): a server holding nothing else holds nothing. */
  readonly seeded?: readonly { readonly type: string; readonly id: string }[];
  /** A line for the archive's `LISEZMOI.md`: what the app's folder holds. */
  readonly readme?: string;
  /** Its routes under `/api`, behind the token like the platform's own, and answered only while it is on (no middleware on `*`). */
  routes?(app: Hono<Env>): void;
  /** Routes served without the token, outside `/api`, while it is on: each carries its own secret (Agenda's published calendar, `/ical/<secret>.ics`). */
  publicRoutes?(app: Hono<Env>): void;
  /** Records a push or a restore just stored: its background work hears of them (Carnet reads new links). */
  stored?(records: readonly SyncRecord[]): void;
  /** Starts its background work, once the server listens, and again each time it is turned back on. */
  start?(): void;
  /** Stops it (turned off, or the server stopping: the platform waits for it before closing the database). A later `start` must work. */
  stop?(): Promise<void> | void;
  /** Hourly while it is on, before the file collector: its own tidying (its bin). Returns how many records it changed. */
  chores?(now: number): number;
  /** Every file its records point at, on or off; `keep` says whether a tombstoned record still keeps its files (the server's own purge, lately). */
  filesInUse?(records: readonly StoredRecord[], keep: (record: StoredRecord) => boolean): Iterable<string>;
  /** Where its live records' files go in the drive and in an archive: blob id -> path, under a folder named after the app. */
  files?(records: readonly StoredRecord[], options: FilesOptions): ReadonlyMap<string, string>;
  /** Its readable copy in an archive: Markdown files under its folder, linking to `Fichiers/` as `files` lays them out. */
  markdown?(records: readonly StoredRecord[], options: FilesOptions): readonly MarkdownFile[];
  /** What the Administration shows of what it holds (Carnet's notes, Pages' pages). */
  counts?(): AppCounts;
}
