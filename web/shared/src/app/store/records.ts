/**
 * The records: every synced record of every app this build holds, in memory, written through to
 * IndexedDB. The shell's half of the web twin of the phone's `libraryStore`: each app keeps its own
 * render state (a projection: Carnet's notes and their indexes, Pages' blocks), folded from the
 * records it declares, and the doors stay here:
 *
 *  - `writeLocal`: the person did something. Every patched field of the batch
 *    gets one fresh clock, the record becomes pending, and the sync loop is
 *    nudged.
 *  - `mergeRemote`: the server sent records. They are merged field by field
 *    (`core/sync/record`), so a local edit the server has not seen survives,
 *    and only what actually changed is persisted and handed to the projections.
 *
 * Re-render discipline (load-bearing, keep it while "simplifying"): a projection is handed only the
 * records of its types that changed, and copies on write only what they touch (see each app's).
 *
 * Two web-only concerns:
 *  - storage is asynchronous, so writes are write-behind (`Persister`): memory
 *    is the truth while the page lives, IndexedDB is what the next load reads;
 *  - several tabs share one database. Each tab posts what it wrote on a
 *    BroadcastChannel and merges what the others wrote, pending marks
 *    included, so no tab can overwrite another's unsynced edit on disk. Each tab
 *    also ticks its own clock (the device node plus a tab suffix), so two tabs
 *    can never mint the same clock for two different writes.
 *
 * The sync cursor belongs to the list of types it pulled (`SyncRequest.types`): a new list (an app
 * turned on, a newer build) pulls again from 0.
 */
import { create } from 'zustand';

import { clockNote } from '@unlease/core/services/format';
import { baseAfterAck, baseAfterWrite, resolveTypedText } from '@unlease/core/sync/bases';
import { sameClocks } from '@unlease/core/sync/engine';
import { createClock, hlcNode, observe, randomNodeId, tick, type ClockState } from '@unlease/core/sync/hlc';
import { adoptReplacedClocks, mergeRecord, writeFields, type Fields, type SyncRecord } from '@unlease/core/sync/record';
import type { ServerMark } from '@unlease/core/sync/protocol';
import { fitField, isRecordType, schemaFingerprint } from '@unlease/core/sync/schema';

import { baseOf, Persister, readEverything, recordOf, rowFor, type StoredRow } from '../db/database';
import { setSyncState, useSyncStore } from './syncStatus';

/**
 * An app's render state, folded from the records of its types. `apply` gets only the records of
 * `types` that changed (all of them, from nothing, when `fresh`): it replaces only what they touch.
 */
export interface Projection {
  readonly types: readonly string[];
  apply(changed: readonly SyncRecord[], fresh: boolean): void;
  /** Back to nothing (a reload, a test). */
  clear(): void;
}

const projections: Projection[] = [];

/** An app's projection, from its module (`platform/modules`): fed from now on, and at once with what is held. */
export function registerProjection(projection: Projection): void {
  if (projections.includes(projection)) return;
  projections.push(projection);
  const held = [...records.values()].filter(record => projection.types.includes(record.type));
  projection.clear();
  if (held.length > 0) projection.apply(held, true);
}

/** Every record changed goes to the projection of its type; a type no app here declares is only kept. */
function project(changed: readonly SyncRecord[], fresh = false): void {
  if (fresh) for (const projection of projections) projection.clear();
  for (const projection of projections) {
    const mine = changed.filter(record => projection.types.includes(record.type));
    if (mine.length > 0 || fresh) projection.apply(mine, fresh);
  }
  revision += 1;
  useRevisionStore.setState({ revision });
}

/** Bumped by every change of any record; cheap invalidation for what reads several apps (the spotlight). */
let revision = 0;
const useRevisionStore = create<{ readonly revision: number }>(() => ({ revision: 0 }));

export function recordsRevision(): number {
  return revision;
}

/** The revision, re-rendering at every change of any app's records. */
export const useRecordsRevision = (): number => useRevisionStore(state => state.revision);

// ── internal state that is not render state ─────────────────────────────────

/** The merge source of truth: every record, by `type:id`. */
const records = new Map<string, SyncRecord>();
/** Keys of records with local changes the server has not acknowledged. */
const pending = new Set<string>();
/** Where unacknowledged typed text started from (`core/sync/bases`), by key. */
const bases = new Map<string, SyncRecord>();
/** Server time minus this browser's, when its date is plainly wrong; 0 otherwise. */
let clockOffset = 0;
/** The server dataset the cursor belongs to (`SyncResponse.epoch`). */
let epoch: string | null = null;
/** A browser whose date is off by less than this is trusted: it is latency, not a wrong clock. */
const TRUSTED_SKEW_MS = 60_000;
let clock: ClockState | null = null;
let device: string | null = null;
let cursor = 0;
/** The record types the cursor was pulled with (`SyncRequest.types`), sorted; null until a pull named them. */
let syncedTypes: readonly string[] | null = null;
/** What the build that pulled them knew of those types (`schemaFingerprint`); null until then. */
let syncedSchema: string | null = null;
/** The server's head and run from the last answer that named them (`ServerMark`). */
let mark: ServerMark | null = null;
/** When a sync last got through, kept with the records: « synchronisé il y a 3 h » holds offline, across reloads. */
let lastSync: number | null = null;
let persister: Persister | null = null;
let channel: BroadcastChannel | null = null;
const localWriteListeners = new Set<() => void>();
const pendingListeners = new Set<(count: number) => void>();
const storageErrorListeners = new Set<(error: unknown) => void>();

const keyOf = (type: string, id: string): string => `${type}:${id}`;

/** This browser's node id, which the sync requests carry. */
export function deviceNode(): string {
  if (!device) throw new Error('library not loaded');
  return device;
}

/** The clock node this tab writes with: the device node plus a tab suffix. */
export function clockNode(): string {
  if (!clock) throw new Error('library not loaded');
  return clock.node;
}

/** Subscribe to local writes (the sync loop uses this to push promptly). */
export function onLocalWrite(listener: () => void): () => void {
  localWriteListeners.add(listener);
  return () => localWriteListeners.delete(listener);
}

/** Subscribe to the count of unacknowledged changes. */
export function onPendingChange(listener: (count: number) => void): () => void {
  pendingListeners.add(listener);
  return () => pendingListeners.delete(listener);
}

/** Subscribe to failures to write to disk (quota, private mode). */
export function onStorageError(listener: (error: unknown) => void): () => void {
  storageErrorListeners.add(listener);
  return () => storageErrorListeners.delete(listener);
}

export function getRecord(type: string, id: string): SyncRecord | undefined {
  return records.get(keyOf(type, id));
}

function notifyPending(): void {
  for (const listener of pendingListeners) listener(pending.size);
}

function persist(key: string): void {
  persister?.mark(key);
}

function snapshot(key: string): StoredRow | null {
  const record = records.get(key);
  return record ? rowFor(record, pending.has(key), bases.get(key)) : null;
}

// ── between tabs ─────────────────────────────────────────────────────────────

interface TabMessage {
  /** Records the sender wrote or merged, as they now stand there. */
  readonly records: readonly SyncRecord[];
  /** Keys the sender holds as pending: a receiver keeps them pending too. */
  readonly pending: readonly string[];
  /** Copies the server acknowledged to the sender. */
  readonly acked: readonly SyncRecord[];
  /** Bases of the sender's typed text for the records it wrote (absent from older tabs). */
  readonly bases?: readonly SyncRecord[];
}

function broadcast(message: TabMessage): void {
  if (!channel) return;
  try {
    channel.postMessage(message);
  } catch {
    // A tab that cannot post (a closing page) only loses the shortcut; IndexedDB still has it.
  }
}

function receive(message: TabMessage, now: number = Date.now()): void {
  if (!clock) return;
  const changed: SyncRecord[] = [];
  for (const record of message.records) {
    for (const value of Object.values(record.clocks)) observe(clock, value, now + clockOffset);
    const key = keyOf(record.type, record.id);
    const result = mergeRecord(records.get(key), record);
    if (result.changed) {
      records.set(key, result.record);
      changed.push(result.record);
    }
  }
  let pendingChanged = false;
  for (const key of message.pending) {
    if (records.has(key) && !pending.has(key)) {
      pending.add(key);
      persist(key);
      pendingChanged = true;
    }
  }
  // Field by field, the later common ground wins (a tab that has had an acknowledgement since).
  for (const base of message.bases ?? []) {
    const key = keyOf(base.type, base.id);
    if (!records.has(key)) continue;
    const mine = bases.get(key);
    const fields: Fields = { ...mine?.fields };
    const clocks: Record<string, string> = { ...mine?.clocks };
    let moved = false;
    for (const [field, value] of Object.entries(base.clocks)) {
      if (clocks[field] !== undefined && clocks[field]! >= value) continue;
      fields[field] = base.fields[field];
      clocks[field] = value;
      moved = true;
    }
    if (!moved) continue;
    bases.set(key, { type: base.type, id: base.id, fields, clocks });
    persist(key);
  }
  // What the server acknowledged to the sender, partly or wholly: the same rule as `acknowledge`.
  for (const copy of message.acked) {
    const key = keyOf(copy.type, copy.id);
    const current = records.get(key);
    if (!current) continue;
    if (pending.has(key) && sameClocks(current, copy)) {
      pending.delete(key);
      bases.delete(key);
      persist(key);
      pendingChanged = true;
      continue;
    }
    const base = bases.get(key);
    if (!base) continue;
    const next = baseAfterAck(base, current, copy);
    if (next) bases.set(key, next);
    else bases.delete(key);
    persist(key);
  }
  for (const record of changed) persist(keyOf(record.type, record.id));
  if (changed.length > 0) project(changed);
  if (pendingChanged || changed.length > 0) notifyPending();
}

function openChannel(name: string): void {
  if (typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(`${name}-library`);
  channel.onmessage = event => receive(event.data as TabMessage);
  // Node (tests) keeps the event loop alive for an open channel; browsers have no unref.
  (channel as unknown as { unref?: () => void }).unref?.();
}

// ── loading ────────────────────────────────────────────────────────────────

export interface LoadOptions {
  /** The open database, or null to run from memory only (no IndexedDB). */
  readonly db: IDBDatabase | null;
  /** Names the BroadcastChannel; tabs of one database share it. */
  readonly name: string;
  readonly now?: number;
}

function clearMemory(): void {
  records.clear();
  pending.clear();
  bases.clear();
  clockOffset = 0;
  epoch = null;
  clock = null;
  device = null;
  cursor = 0;
  syncedTypes = null;
  syncedSchema = null;
  mark = null;
  lastSync = null;
  persister = null;
  channel?.close();
  channel = null;
}

function tabSuffix(): string {
  let suffix = '';
  for (let i = 0; i < 4; i += 1) suffix += Math.floor(Math.random() * 36).toString(36);
  return suffix;
}

/** Read every record into memory. */
export async function loadLibrary({ db, name, now = Date.now() }: LoadOptions): Promise<void> {
  clearMemory();
  const stored = db ? await readEverything(db) : { rows: [], meta: new Map<string, string>() };
  persister = db
    ? new Persister(db, snapshot, error => {
        for (const listener of storageErrorListeners) listener(error);
      })
    : null;

  const storedNode = stored.meta.get('node');
  device = storedNode && /^[a-z0-9]{4,12}$/.test(storedNode) ? storedNode : randomNodeId();
  if (device !== storedNode) persister?.setMeta('node', device);
  clock = createClock(`${device}${tabSuffix()}`);
  cursor = Number(stored.meta.get('cursor') ?? '0') || 0;
  syncedTypes = parseTypes(stored.meta.get('types') ?? null);
  syncedSchema = stored.meta.get('schema') ?? null;
  mark = parseMark(stored.meta.get('mark') ?? null);
  clockOffset = Number(stored.meta.get('clockOffset') ?? '0') || 0;
  epoch = stored.meta.get('epoch') ?? null;
  lastSync = Number(stored.meta.get('lastSyncAt') ?? '0') || null;

  const all: SyncRecord[] = [];
  for (const row of stored.rows) {
    const record = recordOf(row);
    records.set(row.key, record);
    if (row.pending === 1) pending.add(row.key);
    const base = baseOf(row);
    if (base) bases.set(row.key, base);
    all.push(record);
    // Never mint a clock behind one this browser has already written or seen.
    for (const value of Object.values(record.clocks)) observe(clock, value, now + clockOffset);
  }
  project(all, true);
  openChannel(name);
  notifyPending();
}

// ── the two doors ─────────────────────────────────────────────────────────

export interface LocalChange {
  readonly type: string;
  readonly id: string;
  readonly patch: Fields;
}

/** A change the person made. All fields of the batch share one fresh clock. */
export function writeLocal(changes: readonly LocalChange[], now: number = Date.now()): void {
  if (changes.length === 0) return;
  if (!clock) throw new Error('library not loaded');
  const stamp = tick(clock, now + clockOffset);
  const written: SyncRecord[] = [];
  const writtenBases: SyncRecord[] = [];
  for (const change of changes) {
    const key = keyOf(change.type, change.id);
    const before = records.get(key);
    const patch: Fields = {};
    for (const [field, value] of Object.entries(change.patch)) {
      const fitted = fitField(change.type, field, value);
      if (fitted !== undefined) patch[field] = fitted;
    }
    const base = baseAfterWrite(bases.get(key), before, patch);
    if (base) {
      bases.set(key, base);
      writtenBases.push(base);
    }
    const next = writeFields(before ?? { type: change.type, id: change.id, fields: {}, clocks: {} }, patch, stamp);
    records.set(key, next);
    pending.add(key);
    persist(key);
    written.push(next);
  }
  project(written);
  broadcast({ records: written, pending: written.map(r => keyOf(r.type, r.id)), acked: [], bases: writtenBases });
  notifyPending();
  for (const listener of localWriteListeners) listener();
}

/**
 * Records from the server. Returns the merged records that actually changed. A typed field
 * someone else changed while it was being edited here is merged with what was typed, as a
 * fresh local write.
 */
export function mergeRemote(incoming: readonly SyncRecord[], now: number = Date.now()): SyncRecord[] {
  if (!clock) throw new Error('library not loaded');
  const own = clock.node;
  const isOwn = (value: string): boolean => hlcNode(value) === own;
  const browser = device;
  const isThisBrowser = (value: string): boolean => browser !== null && (hlcNode(value)?.startsWith(browser) ?? false);
  const changed: SyncRecord[] = [];
  const merges: LocalChange[] = [];
  for (const record of incoming) {
    for (const value of Object.values(record.clocks)) observe(clock, value, now + clockOffset);
    const key = keyOf(record.type, record.id);
    const local = records.get(key);
    const merged = mergeRecord(local, record);
    // Any tab of this browser stamped it: a reopened tab heals what an earlier one wrote.
    const healed = local ? adoptReplacedClocks(merged.record, record, isThisBrowser) : merged.record;
    const result = { record: healed, changed: merged.changed || healed !== merged.record };
    const base = bases.get(key);
    if (local && base) {
      const typed = resolveTypedText(local, record, base, result.record, isOwn);
      if (typed.base !== base) {
        bases.set(key, typed.base);
        persist(key);
      }
      if (typed.patch && isRecordType(record.type)) merges.push({ type: record.type, id: record.id, patch: typed.patch });
    }
    if (result.changed) {
      records.set(key, result.record);
      persist(key);
      changed.push(result.record);
    }
  }
  if (changed.length > 0) {
    project(changed);
    broadcast({ records: changed, pending: [], acked: [] });
  }
  if (merges.length > 0) writeLocal(merges, now);
  return changed;
}

/**
 * Records built elsewhere with their own clocks (a Keep import): merged like a
 * remote change, then marked pending like a local one, because the server has
 * never seen them.
 */
export function writeImported(incoming: readonly SyncRecord[], now: number = Date.now()): number {
  if (!clock) throw new Error('library not loaded');
  const written: SyncRecord[] = [];
  for (const record of incoming) {
    for (const value of Object.values(record.clocks)) observe(clock, value, now + clockOffset);
    const key = keyOf(record.type, record.id);
    const result = mergeRecord(records.get(key), record);
    records.set(key, result.record);
    pending.add(key);
    persist(key);
    written.push(result.record);
  }
  if (written.length === 0) return 0;
  project(written);
  broadcast({ records: written, pending: written.map(r => keyOf(r.type, r.id)), acked: [] });
  notifyPending();
  for (const listener of localWriteListeners) listener();
  return written.length;
}

// ── what the sync engine needs (`core/sync/engine` SyncStore) ───────────────

export function pendingRecords(limit: number): SyncRecord[] {
  const out: SyncRecord[] = [];
  for (const key of pending) {
    if (out.length >= limit) break;
    const record = records.get(key);
    if (record) out.push(record);
  }
  return out;
}

export function countPending(): number {
  return pending.size;
}

/**
 * The server stored these copies. A record whose clocks still match the copy
 * that was sent is clean; one edited since stays pending for the next pass.
 */
export function acknowledge(sent: readonly SyncRecord[]): void {
  let cleared = false;
  // What the other tabs can act on: copies acknowledged whole, and those whose bases moved.
  const told: SyncRecord[] = [];
  for (const copy of sent) {
    const key = keyOf(copy.type, copy.id);
    const current = records.get(key);
    if (current && pending.has(key) && sameClocks(current, copy)) {
      pending.delete(key);
      bases.delete(key);
      persist(key);
      cleared = true;
      told.push(copy);
      continue;
    }
    // Typed in again meanwhile: what the server now holds is the base for what follows.
    const base = bases.get(key);
    if (current && base) {
      const next = baseAfterAck(base, current, copy);
      if (next) bases.set(key, next);
      else bases.delete(key);
      persist(key);
      told.push(copy);
    }
  }
  if (told.length > 0) broadcast({ records: [], pending: [], acked: told });
  if (cleared) notifyPending();
}

/** For a push: where the unacknowledged typed text of these records started from. */
export function basesFor(sent: readonly SyncRecord[]): SyncRecord[] {
  const out: SyncRecord[] = [];
  for (const record of sent) {
    const base = bases.get(keyOf(record.type, record.id));
    if (base) out.push(base);
  }
  return out;
}

/** The server lost or replaced its data: every record goes to it again. */
export function markAllPending(): void {
  const keys = [...records.keys()].filter(key => !pending.has(key));
  for (const key of keys) {
    pending.add(key);
    persist(key);
  }
  if (keys.length > 0) {
    broadcast({ records: [], pending: keys, acked: [] });
    notifyPending();
  }
}

export function readEpoch(): string | null {
  return epoch;
}

export function writeEpoch(next: string): void {
  epoch = next;
  persister?.setMeta('epoch', next);
}

/**
 * The server's clock, read as an answer arrived. A device more than a minute behind it writes on
 * the server's time from then on, or its edits would sort before what it has just seen. Only
 * behind: the server's own date may be the wrong one (a box that boots before it has the time),
 * and a device that followed it backwards would undo its own order.
 */
export function observeServerTime(serverTime: number, localTime: number = Date.now()): void {
  const behind = serverTime - localTime;
  const note = clockNote(-behind);
  if (note !== useSyncStore.getState().clock) setSyncState({ clock: note });
  const offset = behind > TRUSTED_SKEW_MS ? behind : 0;
  if (Math.abs(offset - clockOffset) >= TRUSTED_SKEW_MS || (offset === 0 && clockOffset !== 0)) {
    clockOffset = offset;
    persister?.setMeta('clockOffset', String(offset));
  }
}

/** This device's time, as sent with each request: the server weighs other devices' clocks against it. */
export function deviceTime(): number {
  return Date.now() + clockOffset;
}

export function readCursor(): number {
  return cursor;
}

export function writeCursor(next: number): void {
  cursor = next;
  persister?.setMeta('cursor', String(next));
}

/** The types the next pull names, sorted. */
export function readSyncedTypes(): readonly string[] | null {
  return syncedTypes;
}

/**
 * The types this browser pulls from now on (the apps the server runs that this build has, and those
 * they read). Another list than the cursor's starts the cursor again from 0, so what a new type held
 * already comes down too; so does a build that knows more of those types (`schemaFingerprint`: a
 * field or a value an older build dropped from what it pulled). Returns whether it changed.
 */
export function pullTypes(types: readonly string[]): boolean {
  const next = [...new Set(types)].sort();
  const schema = schemaFingerprint(next);
  if (syncedTypes && syncedSchema === schema && syncedTypes.length === next.length && syncedTypes.every((type, at) => type === next[at])) return false;
  const had = syncedTypes !== null;
  syncedTypes = next;
  syncedSchema = schema;
  persister?.setMeta('types', next.join(','));
  persister?.setMeta('schema', schema);
  // A browser of an older build kept a cursor for every type: it pulls again too.
  if (had || cursor > 0) writeCursor(0);
  return true;
}

function parseTypes(value: string | null): readonly string[] | null {
  if (value === null) return null;
  const types = value.split(',').filter(type => /^[a-z][a-z0-9-]{0,31}$/.test(type));
  return [...new Set(types)].sort();
}

export function readLastSync(): number | null {
  return lastSync;
}

export function writeLastSync(at: number): void {
  lastSync = at;
  persister?.setMeta('lastSyncAt', String(at));
}

export function readMark(): ServerMark | null {
  return mark;
}

/** One value, written at once: the head and its run never go apart (a tab of an older build writes neither). */
export function writeMark(next: ServerMark): void {
  mark = next;
  persister?.setMeta('mark', `${next.run}:${next.head}`);
}

function parseMark(value: string | null): ServerMark | null {
  const match = value ? /^([a-z0-9]{4,32}):(\d+)$/.exec(value) : null;
  return match ? { run: match[1]!, head: Number(match[2]) } : null;
}

/** Resolves once everything written so far is on disk. */
export function flushLibrary(): Promise<void> {
  return persister?.flush() ?? Promise.resolve();
}

/** Test seam. */
export function resetLibrary(): void {
  clearMemory();
  localWriteListeners.clear();
  pendingListeners.clear();
  storageErrorListeners.clear();
  for (const projection of projections) projection.clear();
  revision += 1;
  useRevisionStore.setState({ revision });
}

/** Test seam: what another tab would post. */
export function receiveFromTab(message: TabMessage): void {
  receive(message);
}
