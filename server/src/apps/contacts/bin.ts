/**
 * Contacts' bin on the server. Hourly, it empties itself: a contact trashed more than
 * TRASH_RETENTION_DAYS ago gets a `deletedAt` tombstone (records are never removed, or an offline
 * device would bring them back). Its photo goes with it, through the file collector.
 */
import type { StatementSync } from 'node:sqlite';
import { hlcWall } from '@unlease/core/sync/hlc';
import { TRASH_RETENTION_DAYS } from '@unlease/contacts/models/contacts';
import type { Database } from '../../db/database';
import type { ServerEdit, SyncService } from '../../sync/service';

const DAY = 86_400_000;

const statements = new WeakMap<Database, StatementSync>();

function expired(db: Database): StatementSync {
  let found = statements.get(db);
  if (!found) {
    found = db.prepare(
      `SELECT id, json_extract(clocks, '$.trashedAt') AS clock FROM records WHERE type = 'contact'
       AND json_extract(fields, '$.deletedAt') IS NULL
       AND json_type(fields, '$.trashedAt') IN ('integer', 'real')
       AND json_extract(fields, '$.trashedAt') < ?`,
    );
    statements.set(db, found);
  }
  return found;
}

/** Tombstones the contacts that stayed in the bin past their week. Returns how many records it changed. */
export function emptyContactsBin(db: Database, sync: SyncService, now: number): number {
  const cutoff = now - TRASH_RETENTION_DAYS * DAY;
  // A device with a slow clock writes an old `trashedAt`; its write's clock still says when it happened.
  const rows = (expired(db).all(cutoff) as { id: string; clock: string | null }[]).filter(row => !row.clock || hlcWall(row.clock) < cutoff);
  if (rows.length === 0) return 0;
  const tombstone: ServerEdit['patch'] = current => (typeof current.fields.deletedAt === 'number' ? null : { deletedAt: now });
  return sync.apply(rows.map(row => ({ type: 'contact', id: row.id, patch: tombstone }))).length;
}
