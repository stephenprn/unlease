/**
 * An app's part of the server. The platform (sync, files, backups, the drive, the Administration)
 * runs the same for every app and asks each one only this; Carnet's is `notes/`. A server runs the
 * apps `main.ts` lists, and stores the records of every type their packages declare.
 */
import type { HttpBindings } from '@hono/node-server';
import type { Hono } from 'hono';
import type { AppId } from '@unlease/core/apps';
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

export interface ServerApp {
  readonly id: AppId;
  /** Records the app seeds on every device ("Non classé"): a server holding nothing else holds nothing. */
  readonly seeded?: readonly { readonly type: string; readonly id: string }[];
  /** A line for the archive's `LISEZMOI.md`: what the app's folder holds. */
  readonly readme?: string;
  /** Its routes under `/api`, behind the token like the platform's own. */
  routes?(app: Hono<Env>): void;
  /** Records a push or a restore just stored: its background work hears of them (Carnet reads new links). */
  stored?(records: readonly SyncRecord[]): void;
  /** Starts its background work, once the server listens. */
  start?(): void;
  /** Stops it: the platform waits for it before closing the database. */
  stop?(): Promise<void> | void;
  /** Hourly, before the file collector: its own tidying (Carnet empties its bin). Returns how many records it changed. */
  chores?(now: number): number;
  /** Every file its records point at; `keep` says whether a tombstoned record still keeps its files (the server's own purge, lately). */
  filesInUse?(records: readonly StoredRecord[], keep: (record: StoredRecord) => boolean): Iterable<string>;
  /** Where its live records' files go in the drive and in an archive: blob id -> path, under a folder named after the app. */
  files?(records: readonly StoredRecord[], options: FilesOptions): ReadonlyMap<string, string>;
  /** Its readable copy in an archive: Markdown files under its folder, linking to `Fichiers/` as `files` lays them out. */
  markdown?(records: readonly StoredRecord[], options: FilesOptions): readonly MarkdownFile[];
}
