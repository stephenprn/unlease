/**
 * A synced record and the one merge every peer runs: field-wise last-writer-wins.
 * Commutative, associative and idempotent: sync order and re-sent pages never matter.
 */
import { hlcWall, isHlc, MAX_DRIFT_MS, type Hlc } from './hlc';
import { isRecordType, isValidField, isValidId } from './schema';

export type Fields = Record<string, unknown>;
export type Clocks = Record<string, Hlc>;

export interface SyncRecord {
  /** A type an app declared (`schema`): `note`, `block`… */
  readonly type: string;
  readonly id: string;
  readonly fields: Fields;
  readonly clocks: Clocks;
}

export interface MergeResult {
  readonly record: SyncRecord;
  /** True when anything was taken from `incoming`. */
  readonly changed: boolean;
}

export function mergeRecord(current: SyncRecord | undefined, incoming: SyncRecord): MergeResult {
  if (!current) return { record: incoming, changed: true };
  let fields: Fields | null = null;
  let clocks: Clocks | null = null;
  for (const [field, clock] of Object.entries(incoming.clocks)) {
    const mine = Object.hasOwn(current.clocks, field) ? current.clocks[field] : undefined;
    if (mine !== undefined && mine >= clock) continue;
    fields ??= { ...current.fields };
    clocks ??= { ...current.clocks };
    fields[field] = incoming.fields[field];
    clocks[field] = clock;
  }
  if (!fields || !clocks) return { record: current, changed: false };
  return { record: { type: current.type, id: current.id, fields, clocks }, changed: true };
}

/**
 * Fields this device stamped far in the future (its date was wrong) that came back from the
 * server holding the same value under a clock of its own (it replaced them): the server's clock
 * is taken, or the field would ignore everyone's later edits for days. `kept` is the merge of the
 * local record with `incoming`; returns it, or a copy with those clocks lowered.
 */
export function adoptReplacedClocks(kept: SyncRecord, incoming: SyncRecord, isOwn: (clock: Hlc) => boolean): SyncRecord {
  let clocks: Clocks | null = null;
  for (const [field, theirs] of Object.entries(incoming.clocks)) {
    const mine = Object.hasOwn(kept.clocks, field) ? kept.clocks[field] : undefined;
    if (mine === undefined || mine === theirs || !isOwn(mine) || isOwn(theirs)) continue;
    if (hlcWall(mine) <= hlcWall(theirs) + MAX_DRIFT_MS) continue;
    if (JSON.stringify(kept.fields[field]) !== JSON.stringify(incoming.fields[field])) continue;
    clocks ??= { ...kept.clocks };
    clocks[field] = theirs;
  }
  return clocks ? { type: kept.type, id: kept.id, fields: kept.fields, clocks } : kept;
}

/** The fields of `incoming` newer than `current`: what changed on the other side. */
export function newerFields(current: SyncRecord | undefined, incoming: SyncRecord): string[] {
  return Object.entries(incoming.clocks)
    .filter(([field, clock]) => {
      const mine = current && Object.hasOwn(current.clocks, field) ? current.clocks[field] : undefined;
      return mine === undefined || mine < clock;
    })
    .map(([field]) => field);
}

/** A local write: every field in `patch` gets the same fresh clock. */
export function writeFields(record: SyncRecord, patch: Fields, clock: Hlc): SyncRecord {
  const fields = { ...record.fields };
  const clocks = { ...record.clocks };
  for (const [field, value] of Object.entries(patch)) {
    fields[field] = value;
    clocks[field] = clock;
  }
  return { type: record.type, id: record.id, fields, clocks };
}

export function latestClock(record: SyncRecord): Hlc | null {
  let latest: Hlc | null = null;
  for (const clock of Object.values(record.clocks)) {
    if (latest === null || clock > latest) latest = clock;
  }
  return latest;
}

export function editedAt(record: SyncRecord): number {
  const latest = latestClock(record);
  return latest ? hlcWall(latest) : 0;
}

export interface SanitizeResult {
  readonly record: SyncRecord | null;
  /** Fields whose value or clock failed the schema. */
  readonly rejected: readonly string[];
}

/** Bad fields are dropped one by one; only an unusable type or id refuses the record. */
export function sanitizeRecord(raw: unknown): SanitizeResult {
  if (typeof raw !== 'object' || raw === null) return { record: null, rejected: [] };
  const candidate = raw as { type?: unknown; id?: unknown; fields?: unknown; clocks?: unknown };
  if (!isRecordType(candidate.type) || !isValidId(candidate.id)) return { record: null, rejected: [] };
  const inFields = (typeof candidate.fields === 'object' && candidate.fields) || {};
  const inClocks = (typeof candidate.clocks === 'object' && candidate.clocks) || {};
  const fields: Fields = {};
  const clocks: Clocks = {};
  const rejected: string[] = [];
  for (const [field, clock] of Object.entries(inClocks as Record<string, unknown>)) {
    const value = (inFields as Record<string, unknown>)[field];
    if (isHlc(clock) && isValidField(candidate.type, field, value)) {
      fields[field] = value;
      clocks[field] = clock;
    } else {
      rejected.push(field);
    }
  }
  return { record: { type: candidate.type, id: candidate.id, fields, clocks }, rejected };
}
