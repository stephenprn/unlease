/**
 * The library engine every phone app of the suite runs: every record in memory, written through to
 * SQLite, merged with the server's, each field under its clock. What the screens read is the app's
 * own projection of those records (Carnet's notes, checks and links; Pages' blocks and Carnet's),
 * decoded by `LibraryProjection.decode` into one zustand store.
 *
 * Load-bearing: a projection keeps an entity, child index or ordering's identity unless its own
 * content changed, so a subscriber re-renders only for its own record (each app's library test holds
 * it). Typed text edited here keeps its base until the server has it (`core/sync/bases`).
 *
 * One library per app (one process, one database): `createLibrary` makes it and the sync loop
 * (`sync/syncManager`) finds it with `activeLibrary`.
 */
import { create, type StoreApi, type UseBoundStore } from 'zustand';

import { appsShownBy, type AppId } from '@unlease/core/apps';
import { clockNote } from '@unlease/core/services/format';
import { baseAfterAck, baseAfterWrite, resolveTypedText } from '@unlease/core/sync/bases';
import { sameClocks } from '@unlease/core/sync/engine';
import { createClock, hlcNode, observe, randomNodeId, tick, type ClockState } from '@unlease/core/sync/hlc';
import { adoptReplacedClocks, mergeRecord, writeFields, type Fields, type SyncRecord } from '@unlease/core/sync/record';
import { appOfType, fitField, typesOfApps } from '@unlease/core/sync/schema';
import { mergeField } from '@unlease/core/sync/textMerge';
import {
  acknowledge as acknowledgeRows,
  loadAllRecords,
  markAllPending as markAllRowsPending,
  saveBases,
  saveLocal,
  saveMerged,
} from '@shared/data/repositories/recordRepository';
import { readSyncState, writeSyncState } from '@shared/data/repositories/stateRepository';

import { setSyncState, useSyncStore } from './syncStore';

/** What every projection's state carries: bumped by every change, a cheap invalidation for derived caches like search. */
export interface LibraryBase {
  readonly revision: number;
}

/** How an app reads the records: its maps, its indexes, its orderings. */
export interface LibraryProjection<S extends LibraryBase> {
  readonly empty: S;
  /**
   * `base` with `changed` decoded in: only the maps and entries they touch are replaced (a new top
   * object each time). A record of a type it does not show is left out. `revision` is the engine's.
   */
  decode(base: S, changed: readonly SyncRecord[]): S;
  /** Forgets the indexes it keeps outside the state (a reload, a test's reset). */
  clear(): void;
}

/** Two projections as one (Pages: its blocks and Carnet's records), each on its own keys of the state. */
export function combineProjections<A extends LibraryBase, B extends LibraryBase>(a: LibraryProjection<A>, b: LibraryProjection<B>): LibraryProjection<A & B> {
  return {
    empty: { ...a.empty, ...b.empty },
    decode: (base, changed) => b.decode(a.decode(base, changed) as A & B, changed) as A & B,
    clear: () => {
      a.clear();
      b.clear();
    },
  };
}

export interface LocalChange {
  readonly type: string;
  readonly id: string;
  readonly patch: Fields;
}

/** What the sync loop needs of a library, whatever its projection. */
export interface LibraryEngine {
  /** The app this library is, and so the record types it syncs (`syncedTypes`). */
  readonly app: AppId;
  deviceNode(): string;
  deviceTime(): number;
  onLocalWrite(listener: () => void): () => void;
  mergeRemote(incoming: readonly SyncRecord[], now?: number): SyncRecord[];
  acknowledge(sent: readonly SyncRecord[]): void;
  markAllPending(): void;
  basesFor(sent: readonly SyncRecord[]): SyncRecord[];
  observeServerTime(serverTime: number, localTime?: number): void;
}

export interface Library<S extends LibraryBase> extends LibraryEngine {
  readonly useStore: UseBoundStore<StoreApi<S>>;
  load(now?: number): void;
  getRecord(type: string, id: string): SyncRecord | undefined;
  /** One user action: every field of the batch shares one fresh clock. */
  writeLocal(changes: readonly LocalChange[], now?: number): void;
  /** Saves what an editor holds for a typed field, merged with an edit that landed meanwhile (`since`: what it last saved or showed). Returns the text now stored. */
  saveTypedField(type: string, id: string, field: string, since: string | null, typed: string): string;
  /** An import's records: merged like remote ones (own clocks), then marked pending. */
  writeImported(incoming: readonly SyncRecord[], now?: number): number;
  /** Test seam. */
  reset(): void;
}

/** A phone whose date is off by less than this is trusted: it is network latency, not a wrong clock. */
const TRUSTED_SKEW_MS = 60_000;

let active: LibraryEngine | null = null;

/** The library the app made (`createLibrary`). */
export function activeLibrary(): LibraryEngine {
  if (!active) throw new Error('no library: the app makes one with createLibrary');
  return active;
}

/** The app this process is, once its library is made. */
export function ownApp(): AppId {
  return activeLibrary().app;
}

/** The record types this app syncs: its own and those of the apps it reads (`appsShownBy`), sorted. */
export function syncedTypes(app: AppId = ownApp()): string[] {
  return typesOfApps(appsShownBy(app));
}

export function createLibrary<S extends LibraryBase>(app: AppId, projection: LibraryProjection<S>): Library<S> {
  const useStore = create<S>(() => projection.empty);
  /** The merge source of truth: every record, by `type:id`. */
  const records = new Map<string, SyncRecord>();
  /** Where unacknowledged typed text started from, by `type:id`. */
  const bases = new Map<string, SyncRecord>();
  /** Server time minus this phone's, when the phone's date is plainly wrong; 0 otherwise. */
  let clockOffset = 0;
  let clock: ClockState | null = null;
  const localWriteListeners = new Set<() => void>();

  const keyOf = (type: string, id: string): string => `${type}:${id}`;
  const basesOf = (record: { type: string; id: string }): SyncRecord | null => bases.get(keyOf(record.type, record.id)) ?? null;
  const decode = (base: S, changed: readonly SyncRecord[]): S => ({ ...projection.decode(base, changed), revision: base.revision + 1 });
  const ready = (): ClockState => {
    if (!clock) throw new Error('library not loaded');
    return clock;
  };

  function load(now: number = Date.now()): void {
    records.clear();
    bases.clear();
    projection.clear();
    let node = readSyncState('node');
    if (!node) {
      node = randomNodeId();
      writeSyncState('node', node);
    }
    clock = createClock(node);
    clockOffset = Number(readSyncState('clockOffset') ?? '0') || 0;
    const stored = loadAllRecords();
    for (const entry of stored) {
      const key = keyOf(entry.record.type, entry.record.id);
      records.set(key, entry.record);
      if (entry.bases) bases.set(key, entry.bases);
      // Never mint a clock behind one this device has already written or seen.
      for (const value of Object.values(entry.record.clocks)) observe(clock, value, now + clockOffset);
    }
    useStore.setState(decode(projection.empty, stored.map(entry => entry.record)), true);
  }

  function writeLocal(changes: readonly LocalChange[], now: number = Date.now()): void {
    if (changes.length === 0) return;
    const stamp = tick(ready(), now + clockOffset);
    const written: SyncRecord[] = [];
    for (const change of changes) {
      const key = keyOf(change.type, change.id);
      const before = records.get(key);
      const patch: Fields = {};
      for (const [field, value] of Object.entries(change.patch)) {
        const fitted = fitField(change.type, field, value);
        if (fitted !== undefined) patch[field] = fitted;
      }
      const base = baseAfterWrite(bases.get(key), before, patch);
      if (base) bases.set(key, base);
      const next = writeFields(before ?? { type: change.type, id: change.id, fields: {}, clocks: {} }, patch, stamp);
      records.set(key, next);
      written.push(next);
    }
    saveLocal(written, basesOf);
    useStore.setState(state => decode(state, written), true);
    for (const listener of localWriteListeners) listener();
  }

  /**
   * Returns the merged records that actually changed. A typed field someone else changed while it
   * was being edited here is merged with what was typed, as a fresh local write.
   */
  function mergeRemote(incoming: readonly SyncRecord[], now: number = Date.now()): SyncRecord[] {
    const own = ready().node;
    const isOwn = (value: string) => hlcNode(value) === own;
    const changed: SyncRecord[] = [];
    const movedBases: { type: string; id: string; base: SyncRecord | null }[] = [];
    const merges: LocalChange[] = [];
    // Memory as it was, put back if the disk refuses: the next pull then merges the same records again, instead of finding them already here.
    const undo: (() => void)[] = [];
    const remember = <T,>(map: Map<string, T>, key: string): void => {
      const before = map.get(key);
      undo.push(() => (before === undefined ? map.delete(key) : map.set(key, before)));
    };
    for (const record of incoming) {
      for (const value of Object.values(record.clocks)) observe(ready(), value, now + clockOffset);
      const key = keyOf(record.type, record.id);
      const local = records.get(key);
      const merged = mergeRecord(local, record);
      const healed = local ? adoptReplacedClocks(merged.record, record, isOwn) : merged.record;
      const result = { record: healed, changed: merged.changed || healed !== merged.record };
      const base = bases.get(key);
      if (local && base) {
        const typed = resolveTypedText(local, record, base, result.record, isOwn);
        if (typed.base !== base) {
          remember(bases, key);
          bases.set(key, typed.base);
          if (!result.changed) movedBases.push({ type: record.type, id: record.id, base: typed.base });
        }
        // Only a type a loaded app declares merges its text (its `merged` fields say how).
        if (typed.patch && appOfType(record.type) !== undefined) merges.push({ type: record.type, id: record.id, patch: typed.patch });
      }
      if (result.changed) {
        remember(records, key);
        records.set(key, result.record);
        changed.push(result.record);
      }
    }
    try {
      if (changed.length > 0) saveMerged(changed, basesOf);
      saveBases(movedBases);
    } catch (error) {
      for (const step of undo.reverse()) step();
      throw error;
    }
    if (changed.length > 0) useStore.setState(state => decode(state, changed), true);
    if (merges.length > 0) writeLocal(merges, now);
    return changed;
  }

  function acknowledge(sent: readonly SyncRecord[]): void {
    const after = new Map<string, SyncRecord | null>();
    for (const copy of sent) {
      const key = keyOf(copy.type, copy.id);
      const current = records.get(key);
      const base = bases.get(key);
      if (!current || !base) continue;
      const next = sameClocks(current, copy) ? null : baseAfterAck(base, current, copy);
      if (next) bases.set(key, next);
      else bases.delete(key);
      after.set(key, next);
    }
    acknowledgeRows(sent, record => {
      const key = keyOf(record.type, record.id);
      return after.has(key) ? after.get(key)! : undefined;
    });
  }

  function basesFor(sent: readonly SyncRecord[]): SyncRecord[] {
    const out: SyncRecord[] = [];
    for (const record of sent) {
      const base = bases.get(keyOf(record.type, record.id));
      if (base) out.push(base);
    }
    return out;
  }

  /**
   * The server's clock, read as an answer arrived. A device more than a minute behind it writes on
   * the server's time from then on, or its edits would sort before what it has just seen. Only
   * behind: the server's own date may be the wrong one (a box that boots before it has the time),
   * and a device that followed it backwards would undo its own order.
   */
  function observeServerTime(serverTime: number, localTime: number = Date.now()): void {
    const behind = serverTime - localTime;
    const note = clockNote(-behind);
    if (note !== useSyncStore.getState().clock) setSyncState({ clock: note });
    const offset = behind > TRUSTED_SKEW_MS ? behind : 0;
    if (Math.abs(offset - clockOffset) >= TRUSTED_SKEW_MS || (offset === 0 && clockOffset !== 0)) {
      clockOffset = offset;
      writeSyncState('clockOffset', String(offset));
    }
  }

  function saveTypedField(type: string, id: string, field: string, since: string | null, typed: string): string {
    const record = records.get(keyOf(type, id));
    if (!record) return typed;
    const value = record.fields[field];
    const stored = typeof value === 'string' ? value : '';
    const next = since === null || stored === since || stored === typed ? typed : mergeField(type, field, since, typed, stored, false);
    if (next !== stored) writeLocal([{ type, id, patch: { [field]: next } }]);
    return next;
  }

  function writeImported(incoming: readonly SyncRecord[], now: number = Date.now()): number {
    const written: SyncRecord[] = [];
    for (const record of incoming) {
      for (const value of Object.values(record.clocks)) observe(ready(), value, now + clockOffset);
      const key = keyOf(record.type, record.id);
      const result = mergeRecord(records.get(key), record);
      records.set(key, result.record);
      written.push(result.record);
    }
    if (written.length === 0) return 0;
    saveLocal(written, basesOf);
    useStore.setState(state => decode(state, written), true);
    for (const listener of localWriteListeners) listener();
    return written.length;
  }

  function reset(): void {
    records.clear();
    bases.clear();
    clockOffset = 0;
    projection.clear();
    clock = null;
    useStore.setState(projection.empty, true);
  }

  const library: Library<S> = {
    app,
    useStore,
    load,
    getRecord: (type, id) => records.get(keyOf(type, id)),
    writeLocal,
    saveTypedField,
    mergeRemote,
    acknowledge,
    markAllPending: () => markAllRowsPending(),
    basesFor,
    observeServerTime,
    deviceNode: () => ready().node,
    deviceTime: () => Date.now() + clockOffset,
    onLocalWrite: listener => {
      localWriteListeners.add(listener);
      return () => localWriteListeners.delete(listener);
    },
    writeImported,
    reset,
  };
  active = library;
  return library;
}
