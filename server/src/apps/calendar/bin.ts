/**
 * Agenda's bin on the server. Hourly, it empties itself: an event trashed more than
 * TRASH_RETENTION_DAYS ago gets a `deletedAt` tombstone (records are never removed, or an offline
 * device would bring them back), with the exceptions of a series that went with it. Its files go
 * with it, through the file collector.
 */
import type { StatementSync } from 'node:sqlite';
import { TRASH_RETENTION_DAYS } from '@unlease/calendar/models/events';
import { hlcWall } from '@unlease/core/sync/hlc';
import type { Database } from '../../db/database';
import type { SyncRecord } from '@unlease/core/sync/record';
import type { RecordStore, StoredRecord } from '../../sync/records';
import type { ServerEdit, SyncService } from '../../sync/service';

const DAY = 86_400_000;

const statements = new WeakMap<Database, { readonly expired: StatementSync; readonly exceptions: StatementSync }>();

function prepared(db: Database) {
  let found = statements.get(db);
  if (!found) {
    found = {
      expired: db.prepare(
        `SELECT id, json_extract(clocks, '$.trashedAt') AS clock FROM records WHERE type = 'calendarEvent'
         AND json_extract(fields, '$.deletedAt') IS NULL
         AND json_type(fields, '$.trashedAt') IN ('integer', 'real')
         AND json_extract(fields, '$.trashedAt') < ?`,
      ),
      exceptions: db.prepare(
        `SELECT id, json_extract(fields, '$.recurringId') AS series FROM records WHERE type = 'calendarEvent'
         AND json_extract(fields, '$.deletedAt') IS NULL AND json_type(fields, '$.recurringId') = 'text'`,
      ),
    };
    statements.set(db, found);
  }
  return found;
}

/** Tombstones the events that stayed in the bin past their week. Returns how many records it changed. */
export function emptyCalendarBin(db: Database, sync: SyncService, now: number): number {
  const cutoff = now - TRASH_RETENTION_DAYS * DAY;
  const { expired, exceptions } = prepared(db);
  // A device with a slow clock writes an old `trashedAt`; its write's clock still says when it happened.
  const rows = (expired.all(cutoff) as { id: string; clock: string | null }[]).filter(row => !row.clock || hlcWall(row.clock) < cutoff);
  if (rows.length === 0) return 0;
  const gone = new Set(rows.map(row => row.id));
  const followers = (exceptions.all() as { id: string; series: string }[]).filter(row => gone.has(row.series) && !gone.has(row.id)).map(row => row.id);
  const tombstone: ServerEdit['patch'] = current => (typeof current.fields.deletedAt === 'number' ? null : { deletedAt: now });
  return sync.apply([...gone, ...followers].map(id => ({ type: 'calendarEvent', id, patch: tombstone }))).length;
}

/** The exceptions of a series, tombstoned ones included: what its purge took with it (`reviveRule`). */
export function exceptionsOf(records: RecordStore, series: SyncRecord): StoredRecord[] {
  let statement = byseries.get(records.db);
  if (!statement) {
    statement = records.db.prepare(`SELECT type, id, fields, clocks, seq FROM records WHERE type = 'calendarEvent' AND json_extract(fields, '$.recurringId') = ?`);
    byseries.set(records.db, statement);
  }
  return (statement.all(series.id) as unknown as { type: string; id: string; fields: string; clocks: string; seq: number }[]).map(row => ({
    type: row.type,
    id: row.id,
    fields: JSON.parse(row.fields) as Record<string, unknown>,
    clocks: JSON.parse(row.clocks) as Record<string, string>,
    seq: row.seq,
  }));
}

const byseries = new WeakMap<Database, StatementSync>();
