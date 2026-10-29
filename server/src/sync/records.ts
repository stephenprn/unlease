/**
 * The `records` table: one row per synced record, fields and clocks as JSON,
 * and the server sequence of its last change. `seq` comes from one counter in
 * `meta`, so "everything after N" is an index range whatever the record type.
 */
import type { StatementSync } from 'node:sqlite';
import type { Clocks, Fields, SyncRecord } from '@unlease/core/sync/record';
import { seededRecords } from '@unlease/core/sync/schema';
import type { Database } from '../db/database';

export interface StoredRecord extends SyncRecord {
  readonly seq: number;
}

interface Row {
  type: string;
  id: string;
  fields: string;
  clocks: string;
  seq: number;
}

function fromRow(row: Row): StoredRecord {
  return {
    type: row.type,
    id: row.id,
    fields: JSON.parse(row.fields) as Fields,
    clocks: JSON.parse(row.clocks) as Clocks,
    seq: row.seq,
  };
}

export class RecordStore {
  private readonly getOne: StatementSync;
  private readonly upsert: StatementSync;
  private readonly bump: StatementSync;
  private readonly current: StatementSync;
  private readonly after: StatementSync;
  private readonly byType: StatementSync;
  private readonly everything: StatementSync;
  private readonly someLive: StatementSync;

  constructor(readonly db: Database) {
    this.getOne = db.prepare('SELECT type, id, fields, clocks, seq FROM records WHERE type = ? AND id = ?');
    this.upsert = db.prepare(
      `INSERT INTO records (type, id, fields, clocks, seq) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (type, id) DO UPDATE SET fields = excluded.fields, clocks = excluded.clocks, seq = excluded.seq`,
    );
    this.bump = db.prepare("UPDATE meta SET value = value + 1 WHERE key = 'seq' RETURNING value");
    this.current = db.prepare("SELECT value FROM meta WHERE key = 'seq'");
    this.after = db.prepare('SELECT type, id, fields, clocks, seq FROM records WHERE seq > ? ORDER BY seq LIMIT ?');
    this.byType = db.prepare('SELECT type, id, fields, clocks, seq FROM records WHERE type = ?');
    this.everything = db.prepare('SELECT type, id, fields, clocks, seq FROM records ORDER BY seq');
    this.someLive = db.prepare(`SELECT type, id FROM records WHERE json_extract(fields, '$.deletedAt') IS NULL LIMIT ?`);
  }

  get(type: string, id: string): StoredRecord | undefined {
    const row = this.getOne.get(type, id) as Row | undefined;
    return row ? fromRow(row) : undefined;
  }

  /** The last sequence handed out; 0 for an empty server. */
  maxSeq(): number {
    return Number((this.current.get() as { value: number }).value);
  }

  /** Stores `record` under the next sequence. Call inside a transaction. */
  put(record: SyncRecord): number {
    const seq = Number((this.bump.get() as { value: number }).value);
    this.upsert.run(record.type, record.id, JSON.stringify(record.fields), JSON.stringify(record.clocks), seq);
    return seq;
  }

  since(since: number, limit: number): StoredRecord[] {
    return (this.after.all(since, limit) as unknown as Row[]).map(fromRow);
  }

  ofType(type: string): StoredRecord[] {
    return (this.byType.all(type) as unknown as Row[]).map(fromRow);
  }

  /** Every record, in the order they were stored: one synchronous read, so no write lands in between. */
  all(): StoredRecord[] {
    return (this.everything.all() as unknown as Row[]).map(fromRow);
  }

  /** Nothing but what every device seeds (Carnet's « Non classé »): a new server, or one about to be restored. */
  holdsNothing(): boolean {
    const seeded = new Set(seededRecords().map(record => `${record.type}:${record.id}`));
    const live = this.someLive.all(seeded.size + 1) as unknown as { type: string; id: string }[];
    return live.every(record => seeded.has(`${record.type}:${record.id}`));
  }
}
