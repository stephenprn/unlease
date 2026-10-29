/**
 * Migration 003: `records` takes every record type (pages' `block`s came after 001 listed five).
 * Until now a pulled page holding a block failed to save, and the records pulled with it were
 * skipped: the cursor is dropped so everything is read again once.
 */
import type { Migration } from './types';

export const migration003: Migration = {
  version: 3,
  name: 'records of every type',
  statements: [
    `CREATE TABLE records_new (
       type    TEXT    NOT NULL,
       id      TEXT    NOT NULL,
       fields  TEXT    NOT NULL,
       clocks  TEXT    NOT NULL,
       pending INTEGER NOT NULL DEFAULT 0 CHECK (pending IN (0, 1)),
       bases   TEXT,
       PRIMARY KEY (type, id)
     ) WITHOUT ROWID`,
    'INSERT INTO records_new (type, id, fields, clocks, pending, bases) SELECT type, id, fields, clocks, pending, bases FROM records',
    'DROP TABLE records',
    'ALTER TABLE records_new RENAME TO records',
    'CREATE INDEX idx_records_pending ON records (type, id) WHERE pending = 1',
    "DELETE FROM sync_state WHERE key = 'cursor'",
  ],
};
