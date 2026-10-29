/**
 * The sync wire format: one `POST /api/sync` pushes changed records and pulls everything
 * above the device's cursor. `seq` is the server's own counter, never a record clock.
 */
import { sanitizeRecord, type SyncRecord } from './record';
import { isMergedTextField } from './textMerge';

export const API_VERSION = 1;
export const MAX_PUSH = 400;
/** UTF-8 bytes, well under the server's 4 MB body limit: a refused page would be refused on every retry. */
export const MAX_PUSH_BYTES = 600_000;
export const MAX_PULL = 1000;
/** The longest empty answer held open; under Cloudflare's 100 s cap. */
export const MAX_WAIT_MS = 25_000;

export interface SyncRequest {
  /** The device's clock node id (a web tab's clocks extend it): its own earlier writes are not someone else's edits to merge. */
  readonly node: string;
  readonly since: number;
  readonly records: readonly SyncRecord[];
  /** Ms to hold an empty answer open; 0 answers at once. */
  readonly wait?: number;
  /**
   * For pushed records with typed text edited here and not yet acknowledged: the value and
   * clock each such field had when the editing started, so the server can merge a concurrent edit.
   */
  readonly bases?: readonly SyncRecord[];
  /** The server dataset this device's cursor and acknowledgements belong to, once known. */
  readonly epoch?: string;
  /** The `head` and `run` of the last answer: a run the server never had, or a head outside it, is data it lost. */
  readonly head?: number;
  readonly run?: string;
  /** This device's time as it sends (corrected when it knows itself behind): a witness the server weighs other devices' clocks against. */
  readonly time?: number;
}

export interface SyncResponse {
  readonly records: readonly SyncRecord[];
  /** The sequence to send as `since` next time. */
  readonly cursor: number;
  /** True when the server stopped at `MAX_PULL` and has more. */
  readonly more: boolean;
  /** The server's wall clock, so a device can tell the owner its clock is off. */
  readonly serverTime: number;
  /**
   * Names the server's dataset. A new one means the server lost or replaced data (a restored
   * backup, a new server): the device sends everything it holds again. Absent from older servers.
   */
  readonly epoch?: string;
  /** The server's last sequence when it answered: at or past everything this device pushed or pulled. */
  readonly head?: number;
  /** The server run that handed out `head` (each start of the server is a run); absent for an empty server and from older servers. */
  readonly run?: string;
}

/** What a device keeps of the last answer to vouch for later: the server's head and its run. */
export interface ServerMark {
  readonly head: number;
  readonly run: string;
}

const isSequence = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function isEpoch(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]{4,32}$/.test(value);
}

export interface ParsedRequest {
  readonly request: SyncRequest | null;
  readonly error: string | null;
  /** Fields dropped by the schema, across all records. */
  readonly rejectedFields: number;
}

export function parseSyncRequest(body: unknown): ParsedRequest {
  if (typeof body !== 'object' || body === null) {
    return { request: null, error: 'body must be a JSON object', rejectedFields: 0 };
  }
  const raw = body as { node?: unknown; since?: unknown; records?: unknown; wait?: unknown; bases?: unknown; epoch?: unknown; head?: unknown; run?: unknown; time?: unknown };
  if (typeof raw.node !== 'string' || !/^[a-z0-9]{4,16}$/.test(raw.node)) {
    return { request: null, error: 'node is missing or malformed', rejectedFields: 0 };
  }
  const since = typeof raw.since === 'number' && Number.isInteger(raw.since) && raw.since >= 0 ? raw.since : 0;
  if (raw.records !== undefined && !Array.isArray(raw.records)) {
    return { request: null, error: 'records must be an array', rejectedFields: 0 };
  }
  const list = (raw.records as unknown[] | undefined) ?? [];
  if (list.length > MAX_PUSH) {
    return { request: null, error: `at most ${MAX_PUSH} records per request`, rejectedFields: 0 };
  }
  const records: SyncRecord[] = [];
  let rejectedFields = 0;
  for (const entry of list) {
    const { record, rejected } = sanitizeRecord(entry);
    rejectedFields += rejected.length;
    if (record && Object.keys(record.clocks).length > 0) records.push(record);
  }
  const wait =
    typeof raw.wait === 'number' && Number.isFinite(raw.wait)
      ? Math.max(0, Math.min(MAX_WAIT_MS, Math.floor(raw.wait)))
      : 0;
  const bases = parseBases(raw.bases, records);
  const epoch = isEpoch(raw.epoch) ? raw.epoch : undefined;
  const mark = isEpoch(raw.run) && isSequence(raw.head) ? { head: raw.head, run: raw.run } : undefined;
  const time = typeof raw.time === 'number' && Number.isFinite(raw.time) && raw.time > 0 ? raw.time : undefined;
  return {
    request: {
      node: raw.node,
      since,
      records,
      wait,
      ...(bases.length > 0 ? { bases } : {}),
      ...(epoch ? { epoch } : {}),
      ...(mark ?? {}),
      ...(time !== undefined ? { time } : {}),
    },
    error: null,
    rejectedFields,
  };
}

/** Bases for typed text fields of records in this push; anything else is ignored. */
function parseBases(value: unknown, records: readonly SyncRecord[]): SyncRecord[] {
  if (!Array.isArray(value)) return [];
  const pushed = new Set(records.map(record => `${record.type}:${record.id}`));
  const out: SyncRecord[] = [];
  for (const entry of value.slice(0, MAX_PUSH)) {
    const { record } = sanitizeRecord(entry);
    if (!record || !pushed.has(`${record.type}:${record.id}`)) continue;
    const fields: Record<string, unknown> = {};
    const clocks: Record<string, string> = {};
    for (const [field, clock] of Object.entries(record.clocks)) {
      if (!isMergedTextField(record.type, field) || typeof record.fields[field] !== 'string') continue;
      fields[field] = record.fields[field];
      clocks[field] = clock;
    }
    if (Object.keys(clocks).length > 0) out.push({ type: record.type, id: record.id, fields, clocks });
  }
  return out;
}

export function parseSyncResponse(body: unknown): SyncResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { records?: unknown; cursor?: unknown; more?: unknown; serverTime?: unknown; epoch?: unknown; head?: unknown; run?: unknown };
  if (!Array.isArray(raw.records) || typeof raw.cursor !== 'number') return null;
  const records: SyncRecord[] = [];
  for (const entry of raw.records) {
    const { record } = sanitizeRecord(entry);
    if (record) records.push(record);
  }
  return {
    records,
    cursor: raw.cursor,
    more: raw.more === true,
    serverTime: typeof raw.serverTime === 'number' ? raw.serverTime : Date.now(),
    ...(isEpoch(raw.epoch) ? { epoch: raw.epoch } : {}),
    ...(isEpoch(raw.run) && isSequence(raw.head) ? { head: raw.head, run: raw.run } : {}),
  };
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
