/**
 * One sync pass, shared by the phone and the web app; storage and HTTP are injected.
 * Acknowledge only what the server answered; move the cursor only after the merge.
 */
import { MAX_PUSH, MAX_PUSH_BYTES, type ServerMark, type SyncRequest, type SyncResponse } from './protocol';
import type { SyncRecord } from './record';

export interface SyncStore {
  pendingRecords(limit: number): readonly SyncRecord[];
  /** Must also `observe` every incoming clock, or the next local write can sort before it. */
  applyRemote(records: readonly SyncRecord[]): void;
  /** The server stored these copies; clear each one's pending mark unless it changed since. */
  acknowledge(records: readonly SyncRecord[]): void;
  readCursor(): number;
  writeCursor(cursor: number): void;
  /** The server's head and run from the last answer that named them (`ServerMark`), kept as one value. */
  readMark?(): ServerMark | null;
  writeMark?(mark: ServerMark): void;
  /** Where the typed text of these records started from, for the fields edited here since the last acknowledgement. */
  basesFor?(records: readonly SyncRecord[]): readonly SyncRecord[];
  /** The server dataset the cursor belongs to; null until the server has named it. */
  readEpoch?(): string | null;
  writeEpoch?(epoch: string): void;
  /** The server lost or replaced data: mark every record pending, so all of it is sent again. */
  markAllPending?(): void;
  /** The server's clock against this device's, at the moment the answer arrived. */
  observeServerTime?(serverTime: number, localTime: number): void;
  /** This device's time, corrected when it knows itself behind: sent with every request. */
  deviceTime?(): number;
}

export interface SyncTransport {
  sync(request: SyncRequest, signal?: AbortSignal): Promise<SyncResponse>;
}

export interface SyncOutcome {
  readonly pushed: number;
  readonly pulled: number;
  readonly cursor: number;
  readonly serverTime: number | null;
  /** The server's dataset changed: everything here was queued to be sent again. */
  readonly resent: boolean;
}

export interface SyncOptions {
  readonly node: string;
  /** Long-poll for this long when there is nothing to send. */
  readonly waitMs?: number;
  readonly signal?: AbortSignal;
  /** Safety valve against a server that keeps answering `more`. */
  readonly maxRounds?: number;
  readonly now?: () => number;
}

export async function syncOnce(
  store: SyncStore,
  transport: SyncTransport,
  options: SyncOptions,
): Promise<SyncOutcome> {
  const maxRounds = options.maxRounds ?? 50;
  const now = options.now ?? Date.now;
  let pushed = 0;
  let pulled = 0;
  let serverTime: number | null = null;
  let resent = false;

  for (let round = 0; round < maxRounds; round += 1) {
    const pending = store.pendingRecords(MAX_PUSH);
    const bases = pending.length > 0 && store.basesFor ? store.basesFor(pending) : [];
    const { outgoing, outgoingBases } = capBySize(pending, bases);
    const truncated = outgoing.length > 0 && store.pendingRecords(outgoing.length + 1).length > outgoing.length;
    const since = store.readCursor();
    const mark = store.readMark?.() ?? null;
    const epoch = store.readEpoch?.() ?? null;
    // Only an exchange with nothing to send may wait: a push must be answered at once.
    const wait = outgoing.length === 0 && round === 0 ? options.waitMs ?? 0 : 0;
    const request: SyncRequest = {
      node: options.node,
      since,
      records: outgoing,
      wait,
      ...(outgoingBases.length > 0 ? { bases: outgoingBases } : {}),
      ...(epoch ? { epoch } : {}),
      ...(mark ? { head: mark.head, run: mark.run } : {}),
      ...(store.deviceTime ? { time: store.deviceTime() } : {}),
    };
    const response = await transport.sync(request, options.signal);
    serverTime = response.serverTime;
    store.observeServerTime?.(response.serverTime, now());

    // Acknowledged first: a typed field the server now holds is no longer a base for a merge.
    if (outgoing.length > 0) {
      store.acknowledge(outgoing);
      pushed += outgoing.length;
    }
    store.applyRemote(response.records);
    pulled += response.records.length;
    // Follow the cursor even downwards: a server restored from nothing answers from zero.
    if (response.cursor !== since) store.writeCursor(response.cursor);
    if (response.run && response.head !== undefined && (response.head !== mark?.head || response.run !== mark.run)) store.writeMark?.({ head: response.head, run: response.run });

    let epochChanged = false;
    if (response.epoch && store.writeEpoch && response.epoch !== epoch) {
      // A device that knew another dataset re-sends everything; one meeting its first just learns the name.
      if (epoch !== null) {
        store.markAllPending?.();
        epochChanged = true;
        resent = true;
      }
      store.writeEpoch(response.epoch);
    }

    // Edits made during the request are left to the caller's next pass:
    // chasing them here would loop for as long as someone types.
    if (response.more || epochChanged) continue;
    if (truncated && store.pendingRecords(1).length > 0) continue;
    break;
  }

  return { pushed, pulled, cursor: store.readCursor(), serverTime, resent };
}

/** UTF-8 bytes of a string, without an encoder (Hermes may lack one). */
export function utf8Length(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/** The longest prefix whose JSON, bases included, fits in one push; always at least one record. */
function capBySize(records: readonly SyncRecord[], bases: readonly SyncRecord[]): { outgoing: readonly SyncRecord[]; outgoingBases: readonly SyncRecord[] } {
  const baseOf = new Map(bases.map(base => [`${base.type}:${base.id}`, base]));
  let bytes = 0;
  let count = records.length;
  for (let i = 0; i < records.length; i += 1) {
    const base = baseOf.get(`${records[i]!.type}:${records[i]!.id}`);
    bytes += utf8Length(JSON.stringify(records[i])) + 1 + (base ? utf8Length(JSON.stringify(base)) + 1 : 0);
    if (bytes > MAX_PUSH_BYTES && i > 0) {
      count = i;
      break;
    }
  }
  const outgoing = count === records.length ? records : records.slice(0, count);
  const sent = new Set(outgoing.map(record => `${record.type}:${record.id}`));
  return { outgoing, outgoingBases: bases.filter(base => sent.has(`${base.type}:${base.id}`)) };
}

export function sameClocks(a: SyncRecord, b: SyncRecord): boolean {
  const aKeys = Object.keys(a.clocks);
  if (aKeys.length !== Object.keys(b.clocks).length) return false;
  return aKeys.every(key => a.clocks[key] === b.clocks[key]);
}
