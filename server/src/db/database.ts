/**
 * The one SQLite file. `node:sqlite` is synchronous, and every caller runs a
 * transaction start to finish without awaiting, so a single connection is
 * enough and no two requests ever interleave inside one.
 */
import { DatabaseSync } from 'node:sqlite';

export type Database = DatabaseSync;

/** Append-only: each entry upgrades `PRAGMA user_version` by one. */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value ANY NOT NULL
  ) STRICT;
  INSERT INTO meta (key, value) VALUES ('seq', 0);

  CREATE TABLE records (
    type TEXT NOT NULL,
    id TEXT NOT NULL,
    fields TEXT NOT NULL,
    clocks TEXT NOT NULL,
    seq INTEGER NOT NULL UNIQUE,
    PRIMARY KEY (type, id)
  ) STRICT;

  CREATE TABLE blobs (
    id TEXT PRIMARY KEY,
    mime TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    bytes INTEGER NOT NULL,
    display_mime TEXT NOT NULL,
    display_bytes INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('upload', 'link')),
    created_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE analyses (
    id INTEGER PRIMARY KEY,
    link_id TEXT NOT NULL,
    url TEXT NOT NULL,
    model TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    ok INTEGER NOT NULL,
    cached INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    duration_ms INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    result TEXT
  ) STRICT;
  CREATE INDEX analyses_by_url ON analyses (url, created_at);
  CREATE INDEX analyses_by_time ON analyses (created_at);
  `,
  // Link-reading settings set from the apps: the Claude key, the model, the monthly budget.
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value ANY NOT NULL
  ) STRICT;
  `,
  // Claude sorting saved links: billed to the month like a reading, but no link is read.
  `
  ALTER TABLE analyses ADD COLUMN task TEXT NOT NULL DEFAULT 'read' CHECK (task IN ('read', 'sort'));
  `,
  // Backups to S3 (each run, and each file already sent), and the files a drive holds for the server.
  `
  CREATE TABLE backup_runs (
    id INTEGER PRIMARY KEY,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    ok INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    snapshot TEXT,
    bytes INTEGER NOT NULL DEFAULT 0,
    files_sent INTEGER NOT NULL DEFAULT 0,
    trigger TEXT NOT NULL CHECK (trigger IN ('schedule', 'manual'))
  ) STRICT;

  CREATE TABLE backup_files (
    blob_id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE drive_files (
    blob_id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('stored', 'delete', 'lost')),
    updated_at INTEGER NOT NULL
  ) STRICT;
  `,
  // The snapshots this server made: only those are ever deleted from S3 (never another server's).
  // And when the collector first found a blob unused: its grace counts from then, not from the upload.
  `
  CREATE TABLE backup_snapshots (
    name TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  ) STRICT;
  ALTER TABLE blobs ADD COLUMN unused_since INTEGER;
  `,
  // Claude looking for a link's promo codes: billed to the month, its answer kept a few hours. SQLite widens a CHECK only by copying the table.
  `
  CREATE TABLE analyses_next (
    id INTEGER PRIMARY KEY,
    link_id TEXT NOT NULL,
    url TEXT NOT NULL,
    model TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    ok INTEGER NOT NULL,
    cached INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    duration_ms INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    result TEXT,
    task TEXT NOT NULL DEFAULT 'read' CHECK (task IN ('read', 'sort', 'coupons'))
  ) STRICT;
  INSERT INTO analyses_next (id, link_id, url, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, ok, cached, error, duration_ms, created_at, result, task)
    SELECT id, link_id, url, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, ok, cached, error, duration_ms, created_at, result, task FROM analyses;
  DROP TABLE analyses;
  ALTER TABLE analyses_next RENAME TO analyses;
  CREATE INDEX analyses_by_url ON analyses (url, created_at);
  CREATE INDEX analyses_by_time ON analyses (created_at);
  `,
  // The link modules (other shops, second-hand, ingredients): the code names the tasks now, so a new module needs no copy of the table.
  `
  CREATE TABLE analyses_next (
    id INTEGER PRIMARY KEY,
    link_id TEXT NOT NULL,
    url TEXT NOT NULL,
    model TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    ok INTEGER NOT NULL,
    cached INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    duration_ms INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    result TEXT,
    task TEXT NOT NULL DEFAULT 'read'
  ) STRICT;
  INSERT INTO analyses_next (id, link_id, url, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, ok, cached, error, duration_ms, created_at, result, task)
    SELECT id, link_id, url, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, ok, cached, error, duration_ms, created_at, result, task FROM analyses;
  DROP TABLE analyses;
  ALTER TABLE analyses_next RENAME TO analyses;
  CREATE INDEX analyses_by_url ON analyses (url, created_at);
  CREATE INDEX analyses_by_time ON analyses (created_at);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function openDatabase(file: string): Database {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  // FULL: a commit is on disk before the device is told it is stored and stops resending it.
  db.exec('PRAGMA synchronous = FULL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

/** Runs `fn` in one write transaction. `fn` must be synchronous: nothing may await inside. */
export function transaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // SQLite already rolled back (a constraint or I/O error ends the transaction itself).
    }
    throw error;
  }
}

function migrate(db: Database): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const current = row.user_version;
  if (current > MIGRATIONS.length) {
    throw new Error(`database schema ${current} is newer than this server knows (${MIGRATIONS.length}); upgrade the server`);
  }
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export function readMeta(db: Database, key: string): unknown {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: unknown } | undefined;
  return row?.value;
}

export function writeMeta(db: Database, key: string, value: string | number): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value);
}
