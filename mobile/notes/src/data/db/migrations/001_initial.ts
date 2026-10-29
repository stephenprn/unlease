/**
 * Migration 001: the whole schema. `records` stores each synced entity as JSON fields + clocks
 * (docs/ARCHITECTURE.md says why). No foreign keys: sync may deliver a check before its note.
 */
import type { Migration } from './types';

export const migration001: Migration = {
  version: 1,
  name: 'initial schema',
  statements: [
    `CREATE TABLE records (
       type    TEXT    NOT NULL CHECK (type IN ('note', 'check', 'link', 'label', 'attachment')),
       id      TEXT    NOT NULL,
       fields  TEXT    NOT NULL,
       clocks  TEXT    NOT NULL,
       pending INTEGER NOT NULL DEFAULT 0 CHECK (pending IN (0, 1)),
       PRIMARY KEY (type, id)
     ) WITHOUT ROWID`,

    `CREATE INDEX idx_records_pending ON records (type, id) WHERE pending = 1`,

    // Sync bookkeeping: the cursor, this device's clock node id.
    `CREATE TABLE sync_state (
       key   TEXT NOT NULL PRIMARY KEY,
       value TEXT NOT NULL
     ) WITHOUT ROWID`,

    // Device-local settings (server address, token, theme, board view). JSON values.
    `CREATE TABLE preferences (
       key   TEXT NOT NULL PRIMARY KEY,
       value TEXT NOT NULL
     ) WITHOUT ROWID`,

    // Never synced: a path means nothing on another device.
    `CREATE TABLE local_files (
       id         TEXT    NOT NULL PRIMARY KEY,
       path       TEXT    NOT NULL,
       mime       TEXT    NOT NULL,
       uploaded   INTEGER NOT NULL DEFAULT 0 CHECK (uploaded IN (0, 1)),
       created_at INTEGER NOT NULL
     ) WITHOUT ROWID`,

    // What is armed on this phone, to compare with reminders synced from the web.
    `CREATE TABLE scheduled_reminders (
       note_id TEXT    NOT NULL PRIMARY KEY,
       at      INTEGER NOT NULL
     ) WITHOUT ROWID`,
  ],
};
