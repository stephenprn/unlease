/** Links waiting for their reading: what the analysis queue takes, at the start and as they arrive. */
import type { SyncRecord } from '@unlease/core/sync/record';
import type { Database } from '../../../db/database';

export const isPendingLink = (record: SyncRecord): boolean =>
  record.type === 'link' && record.fields.status === 'pending' && typeof record.fields.deletedAt !== 'number';

/** Every link still to read, oldest first. */
export function pendingLinkIds(db: Database): string[] {
  return (
    db.prepare(
      `SELECT id FROM records WHERE type = 'link'
       AND json_extract(fields, '$.status') = 'pending' AND json_extract(fields, '$.deletedAt') IS NULL
       ORDER BY seq`,
    ).all() as unknown as { id: string }[]
  ).map(row => row.id);
}

/** The pending links among records just stored. */
export function pendingIn(records: readonly SyncRecord[]): string[] {
  return records.filter(isPendingLink).map(record => record.id);
}
