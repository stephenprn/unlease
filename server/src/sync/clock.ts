/**
 * The server's own hybrid clock, for the fields it writes (analysis results,
 * bin purges). It observes every clock it is sent, so a server write always
 * sorts after the edit it answers, even when a device's wall clock runs ahead.
 */
import { createClock, observe, randomNodeId, tick, type ClockState, type Hlc } from '@unlease/core/sync/hlc';
import type { SyncRecord } from '@unlease/core/sync/record';
import { readMeta, writeMeta, type Database } from '../db/database';

export class ServerClock {
  private readonly state: ClockState;

  constructor(
    node: string,
    private readonly now: () => number = Date.now,
  ) {
    this.state = createClock(node);
  }

  get node(): string {
    return this.state.node;
  }

  observe(remote: Hlc): void {
    observe(this.state, remote, this.now());
  }

  observeRecord(record: SyncRecord): void {
    for (const clock of Object.values(record.clocks)) this.observe(clock);
  }

  tick(): Hlc {
    return tick(this.state, this.now());
  }
}

/** The node id is kept across restarts; the "srv" prefix makes server writes easy to spot in clocks. */
export function serverNodeId(db: Database): string {
  const stored = readMeta(db, 'node');
  if (typeof stored === 'string') return stored;
  const node = `srv${randomNodeId().slice(0, 7)}`;
  writeMeta(db, 'node', node);
  return node;
}

/** The newest clock stored anywhere, so a restarted server never writes behind it. */
export function newestStoredClock(db: Database): Hlc | null {
  const row = db.prepare('SELECT max(j.value) AS clock FROM records, json_each(records.clocks) AS j').get() as
    | { clock: string | null }
    | undefined;
  return row?.clock ?? null;
}
