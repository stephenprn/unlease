/**
 * Bases: for a typed field edited on this device and not yet acknowledged, the value and clock
 * it held when the editing began. They let a concurrent edit of the same text be merged
 * (`textMerge`) instead of one side overwriting the other: by the server when the push arrives,
 * and by the device when the other edit arrives first. A base is the shape of a record holding
 * only those fields; it lives beside the pending record and goes once the server has it.
 */
import { GENESIS_HLC, type Hlc } from './hlc';
import type { Fields, SyncRecord } from './record';
import { isMergedTextField, mergeField } from './textMerge';

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

/** After a local write of `patch` over `before`: typed fields edited for the first time since the last acknowledgement get a base. */
export function baseAfterWrite(base: SyncRecord | undefined, before: SyncRecord | undefined, patch: Fields): SyncRecord | undefined {
  // A record born here has nothing to merge against.
  if (!before) return base;
  let fields: Fields | null = null;
  let clocks: Record<string, Hlc> | null = null;
  for (const field of Object.keys(patch)) {
    if (!isMergedTextField(before.type, field) || (base && Object.hasOwn(base.clocks, field))) continue;
    fields ??= { ...base?.fields };
    clocks ??= { ...base?.clocks };
    fields[field] = asText(before.fields[field]);
    clocks[field] = Object.hasOwn(before.clocks, field) ? before.clocks[field]! : GENESIS_HLC;
  }
  if (!fields || !clocks) return base;
  return { type: before.type, id: before.id, fields, clocks };
}

/**
 * The server stored `sent`. A typed field it now holds needs no base, unless it was typed in
 * again meanwhile: then what the server holds is the new common ground.
 */
export function baseAfterAck(base: SyncRecord, current: SyncRecord, sent: SyncRecord): SyncRecord | null {
  const fields: Fields = { ...base.fields };
  const clocks: Record<string, Hlc> = { ...base.clocks };
  for (const field of Object.keys(base.clocks)) {
    const sentClock = sent.clocks[field];
    if (sentClock === undefined) continue;
    if (current.clocks[field] === sentClock) {
      delete fields[field];
      delete clocks[field];
    } else if (sentClock > clocks[field]!) {
      fields[field] = asText(sent.fields[field]);
      clocks[field] = sentClock;
    }
  }
  return Object.keys(clocks).length > 0 ? { type: base.type, id: base.id, fields, clocks } : null;
}

export interface TypedResolution {
  /** Merged text to write locally (a fresh clock makes it win everywhere), or null when last-writer-wins already kept the right text. */
  readonly patch: Fields | null;
  /** The base from now on: the other side's version is the new common ground. */
  readonly base: SyncRecord;
}

/**
 * `incoming` arrived for a record with unacknowledged typed edits (`base`); `kept` is what the
 * field-wise merge made of `local` and `incoming`. A typed field someone else changed since this
 * device's editing began is merged with the local text. `isOwn` tells this device's own clocks
 * (an echo of its own push is not someone else's edit).
 */
export function resolveTypedText(local: SyncRecord, incoming: SyncRecord, base: SyncRecord, kept: SyncRecord, isOwn: (clock: Hlc) => boolean): TypedResolution {
  let patch: Fields | null = null;
  let fields: Fields | null = null;
  let clocks: Record<string, Hlc> | null = null;
  for (const [field, baseClock] of Object.entries(base.clocks)) {
    const theirClock = incoming.clocks[field];
    if (theirClock === undefined || theirClock === local.clocks[field] || theirClock <= baseClock || isOwn(theirClock)) continue;
    const theirs = incoming.fields[field];
    const ours = local.fields[field];
    if (typeof theirs !== 'string' || typeof ours !== 'string') continue;
    fields ??= { ...base.fields };
    clocks ??= { ...base.clocks };
    fields[field] = theirs;
    clocks[field] = theirClock;
    if (theirs === ours) continue;
    const ourClock = local.clocks[field];
    const merged = mergeField(local.type, field, asText(base.fields[field]), ours, theirs, ourClock !== undefined && ourClock < theirClock);
    if (merged !== kept.fields[field]) (patch ??= {})[field] = merged;
  }
  return { patch, base: fields && clocks ? { type: base.type, id: base.id, fields, clocks } : base };
}
