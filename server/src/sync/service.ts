/**
 * `POST /api/sync` semantics, and the one door through which the server itself
 * writes records. Both paths end in the same place: a merged record stored
 * under a fresh sequence, and every long-polling device woken up.
 */
import type { StatementSync } from 'node:sqlite';
import { formatHlc, hlcNode, hlcWall, MAX_DRIFT_MS, randomNodeId, type Hlc } from '@unlease/core/sync/hlc';
import type { RestoreMode } from '@unlease/core/sync/admin';
import { isEpoch, MAX_PULL, type SyncRequest, type SyncResponse } from '@unlease/core/sync/protocol';
import { mergeRecord, writeFields, type Fields, type SyncRecord } from '@unlease/core/sync/record';
import { isValidField, recordTypeSpec } from '@unlease/core/sync/schema';
import { isMergeable, mergeValues, sameMerged } from '@unlease/core/sync/textMerge';
import { readMeta, transaction, writeMeta, type Database } from '../db/database';
import { log } from '../log';
import type { ServerClock } from './clock';
import type { ChangeNotifier } from './notifier';
import type { RecordStore, StoredRecord } from './records';

export interface ServerEdit {
  readonly type: string;
  readonly id: string;
  /** The fields to write, or null to leave the record alone. Runs inside the write transaction. */
  readonly patch: (current: StoredRecord) => Fields | null;
  /** A record the server makes (Pages' copies): written even when it does not exist yet, `patch` given an empty one. */
  readonly create?: boolean;
}

/**
 * An app's rule for a record a push changed (Carnet's: a note restored after the bin emptied it comes
 * back with what the purge took). Runs inside the push's transaction; returns the records to store
 * instead, the merged one first, or nothing to leave it as it is.
 */
export type PushRule = (current: SyncRecord, incoming: SyncRecord, merged: SyncRecord, context: { readonly records: RecordStore; readonly clock: ServerClock }) => readonly SyncRecord[];

/** A record a push stored, as it now stands, and as it stood before (undefined: new). */
export interface PushedRecord {
  readonly record: SyncRecord;
  readonly before: SyncRecord | undefined;
}

/**
 * An app's look at a whole push once every record of it is merged (Pages' tree: a page moved into
 * one that another device moved into it): returns the records to store on top, each written with a
 * clock from `clock.stampOver`. Runs inside the push's transaction.
 */
export type PushRepair = (pushed: readonly PushedRecord[], context: { readonly records: RecordStore; readonly clock: ServerClock }) => readonly SyncRecord[];

export interface SyncServiceOptions {
  readonly db: Database;
  readonly records: RecordStore;
  readonly clock: ServerClock;
  readonly notifier: ChangeNotifier;
  /** The apps' push rules (`apps/<app>`), each tried in turn. */
  readonly rules?: readonly PushRule[];
  /** The apps' repairs, each run once a push is merged (`PushRepair`). */
  readonly repairs?: readonly PushRepair[];
  readonly now?: () => number;
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const keyOf = (record: { type: string; id: string }): string => `${record.type}:${record.id}`;

interface Version {
  readonly clock: Hlc;
  /** A text, or a merged set's list. */
  readonly value: unknown;
}

/** How much of the lineage's budget a version takes. */
const charsOf = (value: unknown): number => (typeof value === 'string' ? value.length : JSON.stringify(value ?? null).length);

/** Characters of text the lineage keeps at most: the oldest versions go first. */
const LINEAGE_CHARS = 4_000_000;
/** Versions the lineage keeps per field: each carries its whole ancestry in brief, so old ones can go. */
const LINEAGE_PER_FIELD = 8;
/** A device's clocks count by its first ten characters (a web tab's node extends its browser's). */
const deviceOf = (clock: Hlc): string => (hlcNode(clock) ?? '').slice(0, 10);

interface Lineage {
  /** The newest version each device wrote among this version's ancestors (its parents included). */
  readonly byDevice: ReadonlyMap<string, Version>;
  readonly chars: number;
}

/**
 * What the server's recent typed versions came from: its merges (two parents) and the writes that
 * said where they began (one). A device that never got the answer to a push still holds the base
 * its edit began from; its own version, found among the ancestors of what the server holds now, is
 * where its next edit really continues from. Kept in the database (`lineage`) as it is written, in
 * the push's transaction, so a restart between that push and the device's next one forgets
 * nothing: merging from the older base would write what that device typed a second time.
 */
export class MergeLineage {
  private readonly fields = new Map<string, Map<Hlc, Lineage>>();
  private chars = 0;
  private readonly insert: StatementSync | null = null;
  private readonly remove: StatementSync | null = null;

  /** `db`: where it is kept (read back whole here); none keeps it in memory only. */
  constructor(db?: Database) {
    if (!db) return;
    this.insert = db.prepare('INSERT OR IGNORE INTO lineage (key, clock, versions, chars) VALUES (?, ?, ?, ?)');
    this.remove = db.prepare('DELETE FROM lineage WHERE key = ? AND clock = ?');
    const rows = db.prepare('SELECT key, clock, versions FROM lineage ORDER BY id').all() as unknown as { key: string; clock: string; versions: string }[];
    for (const row of rows) {
      const byDevice = new Map<string, Version>();
      try {
        for (const [device, clock, value] of JSON.parse(row.versions) as [string, Hlc, unknown][]) byDevice.set(device, { clock, value });
      } catch {
        continue;
      }
      this.keepVersion(row.key, row.clock, byDevice, false);
    }
  }

  /** `written` (a merge, or a write that said where it began) came from `parents`. */
  record(key: string, written: Hlc, parents: readonly Version[]): void {
    const versions = this.fields.get(key);
    if (versions?.has(written)) return;
    const byDevice = new Map<string, Version>();
    const keep = (version: Version): void => {
      const device = deviceOf(version.clock);
      const known = byDevice.get(device);
      if (!known || version.clock > known.clock) byDevice.set(device, version);
    };
    for (const parent of parents) {
      keep(parent);
      for (const ancestor of versions?.get(parent.clock)?.byDevice.values() ?? []) keep(ancestor);
    }
    this.keepVersion(key, written, byDevice, true);
  }

  private keepVersion(key: string, written: Hlc, byDevice: ReadonlyMap<string, Version>, store: boolean): void {
    let versions = this.fields.get(key);
    if (versions?.has(written)) return;
    let chars = 0;
    for (const version of byDevice.values()) chars += charsOf(version.value);
    if (!versions) this.fields.set(key, (versions = new Map()));
    versions.set(written, { byDevice, chars });
    this.chars += chars;
    if (store) this.insert?.run(key, written, JSON.stringify([...byDevice].map(([device, version]) => [device, version.clock, version.value])), chars);
    while (versions.size > LINEAGE_PER_FIELD) this.drop(key, versions.keys().next().value!);
    // The oldest fields first, when the whole lineage is too large.
    for (const [field, kept] of this.fields) {
      if (this.chars <= LINEAGE_CHARS) break;
      while (kept.size > 0 && this.chars > LINEAGE_CHARS) this.drop(field, kept.keys().next().value!);
    }
  }

  private drop(key: string, clock: Hlc): void {
    const versions = this.fields.get(key);
    const lineage = versions?.get(clock);
    if (!versions || !lineage) return;
    versions.delete(clock);
    this.chars -= lineage.chars;
    if (versions.size === 0) this.fields.delete(key);
    this.remove?.run(key, clock);
  }

  /** The newest version `device` wrote among the ancestors of the version at `clock`. */
  own(key: string, clock: Hlc, device: string): Version | null {
    return this.fields.get(key)?.get(clock)?.byDevice.get(device) ?? null;
  }
}

interface TypedMerge {
  readonly patch: Fields | null;
  /** For each merged field, the two versions it was made of. */
  readonly parents: Readonly<Record<string, readonly Version[]>>;
}

/**
 * The typed fields a device and someone else both changed since that device's edit began
 * (its base): both versions merged, where last-writer-wins would have dropped one. `node`
 * names the pushing device (a web tab's clocks extend it).
 */
function mergeTypedText(current: SyncRecord, incoming: SyncRecord, base: SyncRecord, kept: SyncRecord, node: string, lineage: MergeLineage): TypedMerge {
  const isOwn = (clock: Hlc): boolean => hlcNode(clock)?.startsWith(node) ?? false;
  let patch: Fields | null = null;
  const parents: Record<string, readonly Version[]> = {};
  for (const [field, baseClock] of Object.entries(base.clocks)) {
    const inClock = incoming.clocks[field];
    const currentClock = current.clocks[field];
    const ours = incoming.fields[field];
    const theirs = current.fields[field];
    const baseValue = base.fields[field];
    if (inClock === undefined || currentClock === undefined) continue;
    if (!isMergeable(current.type, field, ours) || !isMergeable(current.type, field, theirs) || !isMergeable(current.type, field, baseValue)) continue;
    // This device's own newer write (the answer to it was lost, another of its tabs): not a concurrent edit.
    if (isOwn(currentClock)) continue;
    // A version this device sent, among the ancestors of what the server holds: that is the common ground.
    const own = lineage.own(`${current.type}:${current.id}:${field}`, currentClock, node.slice(0, 10));
    const from = own && own.clock > baseClock ? own : { clock: baseClock, value: baseValue };
    // Nobody else wrote it since, or they wrote the same thing.
    if (currentClock === inClock || currentClock <= from.clock || sameMerged(theirs, ours)) continue;
    const merged = mergeValues(current.type, field, from.value, ours, theirs, inClock < currentClock);
    if (sameMerged(merged, kept.fields[field])) continue;
    (patch ??= {})[field] = merged;
    parents[field] = [
      { clock: inClock, value: ours },
      { clock: currentClock, value: theirs },
    ];
  }
  return { patch, parents };
}

/**
 * Typed text stored as a device sent it, beside the base it said it began from: a device whose
 * answer was lost, and whose version someone else then built on, finds its own version here.
 */
function recordBasedWrites(lineage: MergeLineage, stored: SyncRecord, incoming: SyncRecord, base: SyncRecord): void {
  for (const [field, baseClock] of Object.entries(base.clocks)) {
    const clock = incoming.clocks[field];
    const from = base.fields[field];
    if (clock === undefined || stored.clocks[field] !== clock || !isMergeable(stored.type, field, from)) continue;
    lineage.record(`${stored.type}:${stored.id}:${field}`, clock, [{ clock: baseClock, value: from }]);
  }
}

/** The server's runs, oldest first: each start's id and the first sequence it hands out. */
function parseRuns(value: unknown): [string, number][] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((run): run is [string, number] => Array.isArray(run) && run.length === 2 && isEpoch(run[0]) && Number.isSafeInteger(run[1])) : [];
  } catch {
    return [];
  }
}

export class SyncService {
  private readonly now: () => number;
  private readonly storedListeners = new Set<(records: readonly SyncRecord[]) => void>();
  private epochName: string;
  private readonly lineage: MergeLineage;
  /** Each start of this server (a run) with the first sequence it hands out, oldest first (`meta.runs`). */
  private readonly runs: [string, number][];

  constructor(private readonly options: SyncServiceOptions) {
    this.now = options.now ?? Date.now;
    const stored = readMeta(options.db, 'epoch');
    this.epochName = typeof stored === 'string' && stored ? stored : this.rotateEpoch();
    this.runs = parseRuns(readMeta(options.db, 'runs'));
    this.lineage = new MergeLineage(options.db);
    for (const row of options.db.prepare('SELECT type, id, clocks FROM records').all() as unknown as { type: string; id: string; clocks: string }[]) {
      this.noteStored({ type: row.type, id: row.id, fields: {}, clocks: JSON.parse(row.clocks) as Record<string, Hlc> });
    }
  }

  /** Names this dataset; devices compare it with the one their cursor belongs to. */
  get epoch(): string {
    return this.epochName;
  }

  /** The server's own clock node: its writes (merges, the bin's tombstones) carry it. */
  get node(): string {
    return this.options.clock.node;
  }

  /**
   * A new run of the server (at start): every cursor it hands out names it. A device whose cursor
   * names a run this dataset never had, or lies outside its run, has seen data this server no
   * longer holds (a copy of its data put back), whoever syncs first and whatever the dates say.
   */
  startRun(): void {
    const last = this.options.records.maxSeq();
    // What was there before runs were counted is a run of its own.
    if (this.runs.length === 0 && last > 0) this.runs.push([randomNodeId(), 1]);
    this.runs.push([randomNodeId(), last + 1]);
    writeMeta(this.options.db, 'runs', JSON.stringify(this.runs));
  }

  /** The run that handed out `seq`: the last one started at or before it. */
  private runOf(seq: number): string | undefined {
    if (seq <= 0) return undefined;
    for (let i = this.runs.length - 1; i >= 0; i -= 1) if (this.runs[i]![1] <= seq) return this.runs[i]![0];
    return undefined;
  }

  /**
   * What a device has seen is all here: its cursor at most the last sequence, and the head it
   * vouches for (the last answer's) inside the run it names. A device that names none (an older
   * one) is checked by its cursor alone.
   */
  private holdsAllSeen(request: SyncRequest): boolean {
    const last = this.options.records.maxSeq();
    if (request.since > last) return false;
    if (request.head === undefined || request.run === undefined || request.head === 0) return true;
    const index = this.runs.findIndex(([id]) => id === request.run);
    if (index < 0) return false;
    const next = this.runs[index + 1];
    return request.head >= this.runs[index]![1] && request.head < (next ? next[1] : last + 1);
  }

  private rotateEpoch(): string {
    this.epochName = randomNodeId();
    writeMeta(this.options.db, 'epoch', this.epochName);
    return this.epochName;
  }

  /** Records a push or a restore just went through, as stored: an app's background work hears of them (Carnet reads new links). */
  onStored(listener: (records: readonly SyncRecord[]) => void): () => void {
    this.storedListeners.add(listener);
    return () => this.storedListeners.delete(listener);
  }

  private tellStored(stored: ReadonlyMap<string, SyncRecord>): void {
    if (stored.size === 0) return;
    const list = [...stored.values()];
    for (const listener of this.storedListeners) listener(list);
  }

  /** The time each device last said it was (or its newest pushed clock), by device, with when (monotonic), since this server started. */
  private readonly witnesses = new Map<string, { wall: number; at: number }>();
  /** The newest clock stored from each device, the server's own writes aside. */
  private readonly storedWalls = new Map<string, number>();

  /** Notes the time on a device: as it says (every request of a current client), or as its newest pushed clock shows. */
  private witness(node: string, wall: number): void {
    if (!(wall > 0)) return;
    this.witnesses.set(node.slice(0, 10), { wall, at: performance.now() });
  }

  private witnessRecord(node: string, record: SyncRecord): void {
    const device = node.slice(0, 10);
    let wall = 0;
    for (const clock of Object.values(record.clocks)) if (hlcNode(clock)?.startsWith(device)) wall = Math.max(wall, hlcWall(clock));
    const known = this.witnesses.get(device);
    if (wall > (known?.wall ?? 0)) this.witness(node, wall);
  }

  /** Notes the clocks a stored record carries, for `timeBesides`. */
  private noteStored(record: SyncRecord): void {
    const server = deviceOf(formatHlc(0, 0, this.options.clock.node));
    for (const clock of Object.values(record.clocks)) {
      const device = deviceOf(clock);
      if (device === server) continue;
      const wall = hlcWall(clock);
      if (wall > (this.storedWalls.get(device) ?? 0)) this.storedWalls.set(device, wall);
    }
  }

  /**
   * The time a pushed clock is weighed against: the latest of what the other devices last said
   * (moved on by the time since), the newest clocks they stored, and the server's own date. Each
   * can only raise it, so neither a device behind nor a server behind (a box without a
   * battery-backed clock boots days behind until it gets the time) gets the right clocks replaced.
   * Until another device has spoken since the start, the newest clocks the others stored stand in
   * for their word, so a phone with the wrong date that is first to sync after a restart is caught
   * too. Null, nothing replaced: no other device ever wrote here. `witnessed` is the time the others
   * vouch for, which a replaced clock is stamped at.
   */
  private timeBesides(device: string): { readonly reference: number; readonly witnessed: number } | null {
    const now = performance.now();
    let witness = 0;
    for (const [other, seen] of this.witnesses) if (other !== device) witness = Math.max(witness, seen.wall + (now - seen.at));
    let stored = 0;
    for (const [other, wall] of this.storedWalls) if (other !== device) stored = Math.max(stored, wall);
    if (witness === 0 && stored === 0) return null;
    return { reference: Math.max(witness, stored, this.now()), witnessed: witness > 0 ? witness : stored };
  }

  /**
   * A clock from absurdly far ahead (a device whose date is wrong) would outrank every real edit
   * for days: it is replaced by one of the server's own, at the time the other devices vouch for and
   * after what the server holds of that field (that device wrote it last, and shows it: anything
   * else, and the two would never agree). Far ahead of what the other devices say the time is, not
   * of the server's own date alone, which may be the wrong one.
   */
  private tame(node: string, record: SyncRecord, current: SyncRecord | undefined): SyncRecord {
    const time = this.timeBesides(node.slice(0, 10));
    if (time === null) return record;
    const limit = time.reference + MAX_DRIFT_MS;
    const ahead = Object.keys(record.clocks).filter(field => hlcWall(record.clocks[field]!) > limit);
    if (ahead.length === 0) return record;
    const stamp = this.options.clock.stampOver(
      ahead.map(field => current?.clocks[field]),
      time.witnessed,
    );
    const clocks = { ...record.clocks };
    for (const field of ahead) clocks[field] = stamp;
    log.warn('sync: clocks from the future replaced (a device has the wrong date)', { type: record.type, id: record.id, node });
    return { ...record, clocks };
  }

  /** Merges what a device sent, in one transaction. Returns how many records changed. `node` names the device. */
  push(incoming: readonly SyncRecord[], bases: readonly SyncRecord[] = [], node = '\u0000'): number {
    const { db, records, clock } = this.options;
    const baseOf = new Map(bases.map(base => [keyOf(base), base]));
    const stored = new Map<string, SyncRecord>();
    const changed = transaction(db, () => {
      let count = 0;
      const pushed: PushedRecord[] = [];
      for (const raw of incoming) {
        const current = records.get(raw.type, raw.id);
        const record = this.tame(node, raw, current);
        this.witnessRecord(node, record);
        clock.observeRecord(record);
        const merged = mergeRecord(current, record);
        let next = merged.record;
        let isChanged = merged.changed;
        const base = baseOf.get(keyOf(record));
        // A record deleted for good keeps no text worth merging.
        if (current && base && typeof next.fields.deletedAt !== 'number') {
          const typed = mergeTypedText(current, record, base, next, node, this.lineage);
          if (typed.patch) {
            const stamp = clock.stampOver(Object.keys(typed.patch).map(field => next.clocks[field]));
            next = writeFields(next, typed.patch, stamp);
            isChanged = true;
            for (const [field, parents] of Object.entries(typed.parents)) this.lineage.record(`${record.type}:${record.id}:${field}`, stamp, parents);
            log.info('sync: merged two edits of the same text', { type: record.type, id: record.id, fields: Object.keys(typed.patch) });
          }
        }
        if (base && isChanged) recordBasedWrites(this.lineage, next, record, base);
        const revived = current && isChanged ? this.applyRules(current, record, next) : [];
        if (revived.length > 0) {
          next = revived[0]!;
          for (const child of revived.slice(1)) {
            records.put(child);
            stored.set(keyOf(child), child);
          }
          count += revived.length - 1;
        }
        if (isChanged) {
          records.put(next);
          this.noteStored(next);
          count += 1;
        }
        stored.set(keyOf(next), next);
        pushed.push({ record: next, before: current });
      }
      for (const repair of this.options.repairs ?? []) {
        for (const fixed of repair(pushed, { records, clock })) {
          records.put(fixed);
          this.noteStored(fixed);
          stored.set(keyOf(fixed), fixed);
          count += 1;
        }
      }
      return count;
    });
    if (changed > 0) this.options.notifier.notify();
    this.tellStored(stored);
    return changed;
  }

  /** The first app rule with something to say about this record (`PushRule`). */
  private applyRules(current: SyncRecord, incoming: SyncRecord, merged: SyncRecord): readonly SyncRecord[] {
    for (const rule of this.options.rules ?? []) {
      const out = rule(current, incoming, merged, { records: this.options.records, clock: this.options.clock });
      if (out.length > 0) return out;
    }
    return [];
  }

  /**
   * What a device lacks after `since`: every record, or only those of `types` (the apps it shows and
   * those they read). A device pulling some types still moves past the others: once it has every
   * record of its types, its cursor is the server's head (read in the same synchronous step, so no
   * write lands between), so it never walks them again.
   */
  pull(since: number, types?: readonly string[]): SyncResponse {
    const head = this.options.records.maxSeq();
    const rows = this.options.records.since(since, MAX_PULL + 1, types);
    const more = rows.length > MAX_PULL;
    const page = more ? rows.slice(0, MAX_PULL) : rows;
    const cursor = more ? page[page.length - 1]!.seq : types ? Math.max(since, head) : page.length > 0 ? page[page.length - 1]!.seq : since;
    const run = this.runOf(head);
    return {
      records: page.map(({ type, id, fields, clocks }) => ({ type, id, fields, clocks })),
      cursor,
      more,
      serverTime: this.now(),
      epoch: this.epochName,
      ...(run ? { head, run } : {}),
    };
  }

  async exchange(request: SyncRequest, signal?: AbortSignal): Promise<SyncResponse> {
    if (request.time !== undefined) this.witness(request.node, request.time);
    let since = request.since;
    if (request.epoch !== undefined && request.epoch !== this.epochName) {
      // The device's cursor counts another dataset's sequence: start over.
      since = 0;
    } else if (!this.holdsAllSeen(request)) {
      // The device has seen more than this server holds: its data was reset or restored from a
      // backup, and lost what that device had seen. When the device vouches for this dataset, it is renamed,
      // so every device sends back everything it holds.
      if (request.epoch === this.epochName) {
        this.rotateEpoch();
        log.warn('sync: a device has seen more than this server holds (restored backup?): every device will send its records again', { node: request.node, since });
      }
      since = 0;
    }
    const changed = request.records.length > 0 ? this.push(request.records, request.bases, request.node) : 0;
    const types = request.types;
    let response = this.pull(since, types);
    const wait = request.wait ?? 0;
    if (request.records.length === 0 && response.records.length === 0 && wait > 0) {
      const { notifier } = this.options;
      const until = performance.now() + wait;
      // Woken by any change: a device that pulls some types waits on while none of them came.
      for (;;) {
        await notifier.wait(Math.max(0, until - performance.now()), signal);
        response = this.pull(response.cursor, types);
        if (!types || response.records.length > 0 || notifier.isClosed || signal?.aborted || performance.now() >= until) break;
      }
    }
    log.debug('sync', {
      node: request.node,
      since: request.since,
      pushed: request.records.length,
      changed,
      pulled: response.records.length,
      cursor: response.cursor,
    });
    return response;
  }

  /**
   * A backup's records, in one transaction. `merge` merges them as a device's push would (their
   * own clocks: only what the server lacks or holds older comes back); `rollback` writes every
   * value that differs under a fresh server clock, so the backup's state wins on every device.
   * Records the backup does not have are left as they are. Returns how many records changed.
   */
  restore(incoming: readonly SyncRecord[], mode: RestoreMode): number {
    const { db, records, clock } = this.options;
    const stored = new Map<string, SyncRecord>();
    const changed = transaction(db, () => {
      let count = 0;
      for (const record of incoming) {
        const current = records.get(record.type, record.id);
        let next: SyncRecord | null = null;
        if (mode === 'merge') {
          clock.observeRecord(record);
          const merged = mergeRecord(current, record);
          if (merged.changed) next = merged.record;
        } else {
          const changes: Fields = {};
          for (const [field, value] of Object.entries(record.fields)) if (!current || !sameValue(current.fields[field], value)) changes[field] = value;
          // A field written only once used (a block's, a note's paper): one the backup never had goes back to its default.
          const defaults = recordTypeSpec(record.type)?.defaults;
          if (current && defaults) {
            for (const field of Object.keys(current.fields)) {
              if (!Object.hasOwn(record.fields, field) && Object.hasOwn(defaults, field) && !sameValue(current.fields[field], defaults[field])) changes[field] = defaults[field];
            }
          }
          if (Object.keys(changes).length > 0) {
            if (current) clock.observeRecord(current);
            next = writeFields(current ?? { type: record.type, id: record.id, fields: {}, clocks: {} }, changes, clock.stampOver(Object.keys(changes).map(field => current?.clocks[field])));
          }
        }
        if (!next) continue;
        records.put(next);
        this.noteStored(next);
        count += 1;
        stored.set(keyOf(next), next);
      }
      return count;
    });
    if (changed > 0) this.options.notifier.notify();
    this.tellStored(stored);
    return changed;
  }

  /**
   * Server-side writes, all in one transaction. Only fields whose value
   * changes are written, each record with one fresh clock that sorts after
   * every clock the fields it writes carry (`ServerClock.stampOver`).
   */
  apply(edits: readonly ServerEdit[]): StoredRecord[] {
    const { db, records, clock } = this.options;
    const written = transaction(db, () => {
      const out: StoredRecord[] = [];
      for (const edit of edits) {
        const current = records.get(edit.type, edit.id) ?? (edit.create ? { type: edit.type, id: edit.id, fields: {}, clocks: {}, seq: 0 } : undefined);
        if (!current) continue;
        const patch = edit.patch(current);
        if (!patch) continue;
        const changes: Fields = {};
        for (const [field, value] of Object.entries(patch)) {
          if (!isValidField(edit.type, field, value)) {
            log.warn('dropped an invalid server write', { type: edit.type, id: edit.id, field });
            continue;
          }
          if (!sameValue(current.fields[field], value)) changes[field] = value;
        }
        if (Object.keys(changes).length === 0) continue;
        if (current.seq > 0) clock.observeRecord(current);
        // After every clock it overwrites, even one this server's date refused to follow.
        const next = writeFields(current, changes, clock.stampOver(Object.keys(changes).map(field => current.clocks[field])));
        out.push({ ...next, seq: records.put(next) });
      }
      return out;
    });
    if (written.length > 0) this.options.notifier.notify();
    return written;
  }
}
