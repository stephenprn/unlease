/**
 * The one connection. op-sqlite is JSI, so reads are synchronous: there is no loading state.
 * Multi-row writes go through `transaction` so they land whole or not at all.
 */
import { open, type DB, type Scalar } from '@op-engineering/op-sqlite';

import { LATEST_VERSION, migrate } from './migrations';

/** Frozen once a device holds data: renaming orphans it. */
const DATABASE_NAME = 'carnet.sqlite';

let connection: DB | null = null;

/** `synchronous = FULL` under WAL: an edit shown as saved survives a phone that dies or reboots, not only an app crash. */
const PRAGMAS: readonly string[] = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = FULL',
  'PRAGMA temp_store = MEMORY',
];

export interface OpenDatabaseOptions {
  readonly location?: string;
  readonly name?: string;
  /** Where to copy the database before a migration. */
  readonly snapshotDirectory?: string;
}

export function openDatabase(options: OpenDatabaseOptions = {}): DB {
  if (connection) return connection;
  const db = open({
    name: options.name ?? DATABASE_NAME,
    ...(options.location !== undefined ? { location: options.location } : {}),
  });
  for (const pragma of PRAGMAS) db.executeSync(pragma);
  if (options.snapshotDirectory) snapshotBeforeMigrating(db, options.snapshotDirectory);
  migrate(db);
  connection = db;
  return db;
}

/** Guards unsynced offline changes; a failed snapshot must never stop the app opening. */
function snapshotBeforeMigrating(db: DB, directory: string): void {
  try {
    const rows = db.executeSync('PRAGMA user_version').rows;
    const from = rows[0] ? Number(Object.values(rows[0])[0] ?? 0) : 0;
    if (from === 0 || from >= LATEST_VERSION) return;
    db.executeSync(`VACUUM INTO '${directory}/${DATABASE_NAME}.before-v${from}'`);
  } catch {
  }
}

function getDatabase(): DB {
  if (!connection) throw new Error('Database not opened. Call openDatabase() during bootstrap.');
  return connection;
}

export function closeDatabase(): void {
  connection?.close();
  connection = null;
}

/** Test seam: forget the handle without touching the file. */
export function resetDatabaseHandle(): void {
  connection = null;
}

export type Row = Record<string, Scalar>;

export function selectAll<T extends Row = Row>(sql: string, params?: Scalar[]): T[] {
  return getDatabase().executeSync(sql, params).rows as T[];
}

export function selectOne<T extends Row = Row>(sql: string, params?: Scalar[]): T | null {
  return (getDatabase().executeSync(sql, params).rows[0] as T | undefined) ?? null;
}

export function run(sql: string, params?: Scalar[]): void {
  getDatabase().executeSync(sql, params);
}

let depth = 0;

/** Re-entrant, so repository calls compose. */
export function transaction<T>(work: () => T): T {
  const db = getDatabase();
  if (depth > 0) {
    depth += 1;
    try {
      return work();
    } finally {
      depth -= 1;
    }
  }
  db.executeSync('BEGIN');
  depth = 1;
  try {
    const result = work();
    db.executeSync('COMMIT');
    return result;
  } catch (error) {
    db.executeSync('ROLLBACK');
    throw error;
  } finally {
    depth = 0;
  }
}
