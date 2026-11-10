/**
 * The server's own hybrid clock, for the fields it writes (analysis results,
 * bin purges). It observes every clock it is sent, so a server write always
 * sorts after the edit it answers, even when a device's wall clock runs ahead.
 */
import { createClock, formatHlc, MAX_COUNTER, observe, parseHlc, randomNodeId, tick, type ClockState, type Hlc } from '@unlease/core/sync/hlc';
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

  /**
   * The clock of a server write over fields that carry `over`: a fresh tick, and never at or below
   * any of them. The tick alone can be: a clock the server refused to follow (`observe` ignores one
   * a day past its own date, and this server's date may be the wrong one) would outrank the write on
   * every device that holds it, while the server keeps the write: they would never agree again.
   * `atLeast` (a time other devices vouch for) raises this one stamp, never the clock itself.
   */
  stampOver(over: Iterable<Hlc | undefined>, atLeast = 0): Hlc {
    let stamp = tick(this.state, this.now());
    const parsed = parseHlc(stamp)!;
    if (parsed.wall < atLeast) stamp = formatHlc(Math.floor(atLeast), 0, this.state.node);
    for (const clock of over) if (clock !== undefined && clock >= stamp) stamp = this.after(clock);
    return stamp;
  }

  /** The smallest clock of this server's after `clock`. */
  private after(clock: Hlc): Hlc {
    const parsed = parseHlc(clock);
    if (!parsed) return clock;
    return parsed.counter < MAX_COUNTER ? formatHlc(parsed.wall, parsed.counter + 1, this.state.node) : formatHlc(parsed.wall + 1, 0, this.state.node);
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
