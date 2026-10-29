/**
 * Every synced record, as stored on the phone. `saveLocal` marks a row pending;
 * `saveMerged` leaves the mark as it was, so an unacknowledged local change stays pending.
 * A row also keeps the base of its unacknowledged typed text (`core/sync/bases`).
 */
import { sameClocks } from '@unlease/core/sync/engine';
import type { Clocks, Fields, SyncRecord } from '@unlease/core/sync/record';

import { run, selectAll, selectOne, transaction } from '../db/database';

interface RecordRow {
  [key: string]: string | number | null;
  type: string;
  id: string;
  fields: string;
  clocks: string;
  pending: number;
  bases: string | null;
}

function decode(row: RecordRow): SyncRecord {
  return {
    type: row.type,
    id: row.id,
    fields: JSON.parse(row.fields) as Fields,
    clocks: JSON.parse(row.clocks) as Clocks,
  };
}

function decodeBases(row: RecordRow): SyncRecord | null {
  if (!row.bases) return null;
  try {
    const parsed = JSON.parse(row.bases) as { fields?: Fields; clocks?: Clocks };
    if (!parsed.fields || !parsed.clocks) return null;
    return { type: row.type, id: row.id, fields: parsed.fields, clocks: parsed.clocks };
  } catch {
    return null;
  }
}

const encodeBases = (base: SyncRecord | null | undefined): string | null =>
  base ? JSON.stringify({ fields: base.fields, clocks: base.clocks }) : null;

/** The base each record should be stored with; undefined leaves a row's base as it is. */
export type BasesOf = (record: { type: string; id: string }) => SyncRecord | null | undefined;

export interface StoredRecord {
  readonly record: SyncRecord;
  readonly pending: boolean;
  readonly bases: SyncRecord | null;
}

export function loadAllRecords(): StoredRecord[] {
  return selectAll<RecordRow>('SELECT type, id, fields, clocks, pending, bases FROM records').map(row => ({
    record: decode(row),
    pending: row.pending === 1,
    bases: decodeBases(row),
  }));
}

export function saveLocal(records: readonly SyncRecord[], basesOf: BasesOf = () => null): void {
  transaction(() => {
    for (const record of records) {
      run(
        `INSERT INTO records (type, id, fields, clocks, pending, bases) VALUES (?, ?, ?, ?, 1, ?)
         ON CONFLICT (type, id) DO UPDATE SET fields = excluded.fields, clocks = excluded.clocks, pending = 1, bases = excluded.bases`,
        [record.type, record.id, JSON.stringify(record.fields), JSON.stringify(record.clocks), encodeBases(basesOf(record))],
      );
    }
  });
}

export function saveMerged(records: readonly SyncRecord[], basesOf: BasesOf = () => undefined): void {
  transaction(() => {
    for (const record of records) {
      const base = basesOf(record);
      if (base === undefined) {
        run(
          `INSERT INTO records (type, id, fields, clocks, pending) VALUES (?, ?, ?, ?, 0)
           ON CONFLICT (type, id) DO UPDATE SET fields = excluded.fields, clocks = excluded.clocks`,
          [record.type, record.id, JSON.stringify(record.fields), JSON.stringify(record.clocks)],
        );
      } else {
        run(
          `INSERT INTO records (type, id, fields, clocks, pending, bases) VALUES (?, ?, ?, ?, 0, ?)
           ON CONFLICT (type, id) DO UPDATE SET fields = excluded.fields, clocks = excluded.clocks, bases = excluded.bases`,
          [record.type, record.id, JSON.stringify(record.fields), JSON.stringify(record.clocks), encodeBases(base)],
        );
      }
    }
  });
}

/** Only the bases of existing rows, for a merge that moved a base without changing its record. */
export function saveBases(entries: readonly { type: string; id: string; base: SyncRecord | null }[]): void {
  if (entries.length === 0) return;
  transaction(() => {
    for (const entry of entries) run('UPDATE records SET bases = ? WHERE type = ? AND id = ?', [encodeBases(entry.base), entry.type, entry.id]);
  });
}

export function pendingRecords(limit: number): SyncRecord[] {
  return selectAll<RecordRow>(
    'SELECT type, id, fields, clocks, pending, bases FROM records WHERE pending = 1 LIMIT ?',
    [limit],
  ).map(decode);
}

export function countPending(): number {
  const row = selectOne<{ n: number }>('SELECT COUNT(*) AS n FROM records WHERE pending = 1');
  return row ? Number(row.n) : 0;
}

/** A row edited since the copy was sent stays pending for the next pass (with the base `basesOf` gives). */
export function acknowledge(sent: readonly SyncRecord[], basesOf: BasesOf = () => undefined): void {
  transaction(() => {
    for (const copy of sent) {
      const row = selectOne<RecordRow>(
        'SELECT type, id, fields, clocks, pending, bases FROM records WHERE type = ? AND id = ?',
        [copy.type, copy.id],
      );
      if (!row) continue;
      if (sameClocks(decode(row), copy)) {
        run('UPDATE records SET pending = 0, bases = NULL WHERE type = ? AND id = ?', [copy.type, copy.id]);
        continue;
      }
      const base = basesOf(copy);
      if (base !== undefined) run('UPDATE records SET bases = ? WHERE type = ? AND id = ?', [encodeBases(base), copy.type, copy.id]);
    }
  });
}

/** The server lost data: everything goes again. */
export function markAllPending(): void {
  run('UPDATE records SET pending = 1');
}

/** Forget everything: the "disconnect and erase this phone" action. */
export function eraseRecords(): void {
  transaction(() => {
    run('DELETE FROM records');
    run('DELETE FROM sync_state');
    run('DELETE FROM scheduled_reminders');
  });
}
