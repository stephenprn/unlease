/**
 * The library: every record in memory, written through to SQLite.
 * Load-bearing: an entity, child index or ordering keeps its identity unless its own content
 * changed, so a subscriber re-renders only for its own record (held by libraryStore.test.ts).
 * Typed text edited here keeps its base until the server has it (`core/sync/bases`).
 */
import { create } from 'zustand';

import { parentKey } from '@unlease/notes/services/blocks';
import { comparePositions } from '@unlease/core/services/fractionalIndex';
import { clockNote } from '@unlease/core/services/format';
import { baseAfterAck, baseAfterWrite, resolveTypedText } from '@unlease/core/sync/bases';
import { sameClocks } from '@unlease/core/sync/engine';
import { createClock, hlcNode, observe, randomNodeId, tick, type ClockState } from '@unlease/core/sync/hlc';
import { adoptReplacedClocks, mergeRecord, writeFields, type Fields, type SyncRecord } from '@unlease/core/sync/record';
import { fitField } from '@unlease/core/sync/schema';
import {
  attachmentFromRecord,
  blockFromRecord,
  checkFromRecord,
  labelFromRecord,
  linkFromRecord,
  noteFromRecord,
} from '@unlease/notes/sync/entities';
import type { Block } from '@unlease/notes/models/blocks';
import type { Attachment, CheckItem, Label, LinkItem, Note } from '@unlease/notes/models/entities';
import {
  acknowledge as acknowledgeRows,
  loadAllRecords,
  markAllPending as markAllRowsPending,
  saveBases,
  saveLocal,
  saveMerged,
} from '@data/repositories/recordRepository';
import { readSyncState, writeSyncState } from '@data/repositories/stateRepository';

import { setSyncState, useSyncStore } from './syncStore';
import { isNotesType, type RecordType } from '@unlease/notes/sync/types';

export interface LibraryState {
  readonly notes: Readonly<Record<string, Note>>;
  readonly checks: Readonly<Record<string, CheckItem>>;
  readonly links: Readonly<Record<string, LinkItem>>;
  readonly labels: Readonly<Record<string, Label>>;
  readonly attachments: Readonly<Record<string, Attachment>>;
  /** Live child ids per note, in display order. A note with none holds no key. */
  readonly checksByNote: Readonly<Record<string, readonly string[]>>;
  readonly linksByNote: Readonly<Record<string, readonly string[]>>;
  readonly attachmentsByNote: Readonly<Record<string, readonly string[]>>;
  /** Pages and their blocks (`notes/models/blocks`). */
  readonly blocks: Readonly<Record<string, Block>>;
  /** Live blocks per container, in order; the top-level pages under `ROOT` (`notes/services/blocks`). A container with none holds no key. */
  readonly blocksByParent: Readonly<Record<string, readonly string[]>>;
  /** Every note not permanently deleted, in board order. */
  readonly noteOrder: readonly string[];
  readonly labelOrder: readonly string[];
  /** Bumped by every change; cheap invalidation for derived caches like search. */
  readonly revision: number;
}

const EMPTY: LibraryState = {
  notes: {},
  checks: {},
  links: {},
  labels: {},
  attachments: {},
  checksByNote: {},
  linksByNote: {},
  attachmentsByNote: {},
  blocks: {},
  blocksByParent: {},
  noteOrder: [],
  labelOrder: [],
  revision: 0,
};

export const useLibraryStore = create<LibraryState>(() => EMPTY);

/** The merge source of truth: every record, by `type:id`. */
const records = new Map<string, SyncRecord>();
/** Where unacknowledged typed text started from, by `type:id`. */
const bases = new Map<string, SyncRecord>();
/** Server time minus this phone's, when the phone's date is plainly wrong; 0 otherwise. */
let clockOffset = 0;
const children: Record<'check' | 'link' | 'attachment', Map<string, Set<string>>> = {
  check: new Map(),
  link: new Map(),
  attachment: new Map(),
};
const parentOf = new Map<string, string>();
/** Live blocks per container key, and the container each live block is filed under. */
const blockChildren = new Map<string, Set<string>>();
const blockParent = new Map<string, string>();
let clock: ClockState | null = null;
const localWriteListeners = new Set<() => void>();

const keyOf = (type: string, id: string): string => `${type}:${id}`;
const basesOf = (record: { type: string; id: string }): SyncRecord | null => bases.get(keyOf(record.type, record.id)) ?? null;
/** A phone whose date is off by less than this is trusted: it is network latency, not a wrong clock. */
const TRUSTED_SKEW_MS = 60_000;

/** This device's clock node id: minted once, kept forever. */
export function deviceNode(): string {
  if (!clock) throw new Error('library not loaded');
  return clock.node;
}

export function onLocalWrite(listener: () => void): () => void {
  localWriteListeners.add(listener);
  return () => localWriteListeners.delete(listener);
}

export function getRecord(type: RecordType, id: string): SyncRecord | undefined {
  return records.get(keyOf(type, id));
}

type Draft = {
  -readonly [K in keyof LibraryState]: LibraryState[K];
};

function sortByPosition<T extends { position: string; id: string }>(
  ids: Iterable<string>,
  map: Readonly<Record<string, T>>,
): string[] {
  return [...ids]
    .map(id => map[id])
    .filter((entity): entity is T => entity !== undefined)
    .sort(comparePositions)
    .map(entity => entity.id);
}

function sameIds(a: readonly string[] | undefined, b: readonly string[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Only touched maps and entries are replaced. */
function decodeInto(base: LibraryState, changed: readonly SyncRecord[]): LibraryState {
  const draft: Draft = { ...base };
  const touchedNotes = new Set<string>();
  const touched = { check: new Set<string>(), link: new Set<string>(), attachment: new Set<string>() };
  const touchedContainers = new Set<string>();
  let notesChanged = false;
  let labelsChanged = false;
  let blocksChanged = false;

  for (const record of changed) {
    switch (record.type) {
      case 'note': {
        if (!notesChanged) draft.notes = { ...draft.notes };
        notesChanged = true;
        const note = noteFromRecord(record);
        (draft.notes as Record<string, Note>)[note.id] = note;
        break;
      }
      case 'label': {
        if (!labelsChanged) draft.labels = { ...draft.labels };
        labelsChanged = true;
        const label = labelFromRecord(record);
        (draft.labels as Record<string, Label>)[label.id] = label;
        break;
      }
      case 'block': {
        if (!blocksChanged) draft.blocks = { ...draft.blocks };
        blocksChanged = true;
        const block = blockFromRecord(record);
        (draft.blocks as Record<string, Block>)[block.id] = block;
        const before = blockParent.get(block.id);
        const after = block.deletedAt === null ? parentKey(block.parentId) : undefined;
        if (before !== after) {
          if (before !== undefined) blockChildren.get(before)?.delete(block.id);
          if (after !== undefined) {
            let set = blockChildren.get(after);
            if (!set) blockChildren.set(after, (set = new Set()));
            set.add(block.id);
            blockParent.set(block.id, after);
          } else {
            blockParent.delete(block.id);
          }
        }
        if (before !== undefined) touchedContainers.add(before);
        if (after !== undefined) touchedContainers.add(after);
        break;
      }
      case 'check':
      case 'link':
      case 'attachment': {
        const entity =
          record.type === 'check'
            ? checkFromRecord(record)
            : record.type === 'link'
              ? linkFromRecord(record)
              : attachmentFromRecord(record);
        const mapName = record.type === 'check' ? 'checks' : record.type === 'link' ? 'links' : 'attachments';
        if (draft[mapName] === base[mapName]) {
          (draft as Record<string, unknown>)[mapName] = { ...base[mapName] };
        }
        (draft[mapName] as Record<string, unknown>)[entity.id] = entity;

        const key = keyOf(record.type, entity.id);
        const before = parentOf.get(key);
        const after = entity.deletedAt === null && entity.noteId ? entity.noteId : undefined;
        if (before !== after) {
          if (before) children[record.type].get(before)?.delete(entity.id);
          if (after) {
            let set = children[record.type].get(after);
            if (!set) children[record.type].set(after, (set = new Set()));
            set.add(entity.id);
            parentOf.set(key, after);
          } else {
            parentOf.delete(key);
          }
        }
        if (before) touched[record.type].add(before);
        if (after) touched[record.type].add(after);
        break;
      }
    }
  }

  const indexNames = { check: 'checksByNote', link: 'linksByNote', attachment: 'attachmentsByNote' } as const;
  const entityNames = { check: 'checks', link: 'links', attachment: 'attachments' } as const;
  for (const type of ['check', 'link', 'attachment'] as const) {
    if (touched[type].size === 0) continue;
    const index = { ...draft[indexNames[type]] } as Record<string, readonly string[]>;
    let indexChanged = false;
    for (const noteId of touched[type]) {
      const ids = children[type].get(noteId);
      const sorted = ids && ids.size > 0 ? sortByPosition(ids, draft[entityNames[type]] as Record<string, { position: string; id: string }>) : [];
      if (sorted.length === 0) {
        if (noteId in index) {
          delete index[noteId];
          indexChanged = true;
        }
      } else if (!sameIds(index[noteId], sorted)) {
        index[noteId] = sorted;
        indexChanged = true;
      }
      touchedNotes.add(noteId);
    }
    if (indexChanged) (draft as Record<string, unknown>)[indexNames[type]] = index;
  }

  if (touchedContainers.size > 0) {
    const index = { ...draft.blocksByParent } as Record<string, readonly string[]>;
    let indexChanged = false;
    for (const key of touchedContainers) {
      const ids = blockChildren.get(key);
      const sorted = ids && ids.size > 0 ? sortByPosition(ids, draft.blocks) : [];
      if (sorted.length === 0) {
        if (key in index) {
          delete index[key];
          indexChanged = true;
        }
      } else if (!sameIds(index[key], sorted)) {
        index[key] = sorted;
        indexChanged = true;
      }
    }
    if (indexChanged) draft.blocksByParent = index;
  }

  if (notesChanged) {
    const order = sortByPosition(
      Object.values(draft.notes)
        .filter(note => note.deletedAt === null)
        .map(note => note.id),
      draft.notes,
    );
    if (!sameIds(base.noteOrder, order)) draft.noteOrder = order;
  }
  if (labelsChanged) {
    const order = sortByPosition(
      Object.values(draft.labels)
        .filter(label => label.deletedAt === null)
        .map(label => label.id),
      draft.labels,
    );
    if (!sameIds(base.labelOrder, order)) draft.labelOrder = order;
  }

  draft.revision = base.revision + 1;
  return draft;
}

export function loadLibrary(now: number = Date.now()): void {
  records.clear();
  bases.clear();
  for (const map of Object.values(children)) map.clear();
  parentOf.clear();
  blockChildren.clear();
  blockParent.clear();

  let node = readSyncState('node');
  if (!node) {
    node = randomNodeId();
    writeSyncState('node', node);
  }
  clock = createClock(node);
  clockOffset = Number(readSyncState('clockOffset') ?? '0') || 0;

  const stored = loadAllRecords();
  const all = stored.map(entry => entry.record);
  for (const entry of stored) {
    const key = keyOf(entry.record.type, entry.record.id);
    records.set(key, entry.record);
    if (entry.bases) bases.set(key, entry.bases);
    // Never mint a clock behind one this device has already written or seen.
    for (const value of Object.values(entry.record.clocks)) observe(clock, value, now + clockOffset);
  }
  useLibraryStore.setState(decodeInto(EMPTY, all), true);
}

export interface LocalChange {
  readonly type: RecordType;
  readonly id: string;
  readonly patch: Fields;
}

/** One user action: every field of the batch shares one fresh clock. */
export function writeLocal(changes: readonly LocalChange[], now: number = Date.now()): void {
  if (changes.length === 0) return;
  if (!clock) throw new Error('library not loaded');
  const stamp = tick(clock, now + clockOffset);
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
  useLibraryStore.setState(state => decodeInto(state, written), true);
  for (const listener of localWriteListeners) listener();
}

/**
 * Returns the merged records that actually changed. A typed field someone else changed while
 * it was being edited here is merged with what was typed, as a fresh local write.
 */
export function mergeRemote(incoming: readonly SyncRecord[], now: number = Date.now()): SyncRecord[] {
  if (!clock) throw new Error('library not loaded');
  const own = clock.node;
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
    for (const value of Object.values(record.clocks)) observe(clock, value, now + clockOffset);
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
      if (typed.patch && isNotesType(record.type)) merges.push({ type: record.type, id: record.id, patch: typed.patch });
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
  if (changed.length > 0) useLibraryStore.setState(state => decodeInto(state, changed), true);
  if (merges.length > 0) writeLocal(merges, now);
  return changed;
}

/** The server stored these copies: their pending marks go, and with them the bases of the typed text it now holds. */
export function acknowledge(sent: readonly SyncRecord[]): void {
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

/** The server lost or replaced its data: every record goes to it again. */
export function markAllPending(): void {
  markAllRowsPending();
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
    writeSyncState('clockOffset', String(offset));
  }
}

/** This device's time, as sent with each request: the server weighs other devices' clocks against it. */
export function deviceTime(): number {
  return Date.now() + clockOffset;
}

/** A Keep import's records: merged like remote ones (own clocks), then marked pending. */
export function writeImported(incoming: readonly SyncRecord[], now: number = Date.now()): number {
  if (!clock) throw new Error('library not loaded');
  const written: SyncRecord[] = [];
  for (const record of incoming) {
    for (const value of Object.values(record.clocks)) observe(clock, value, now + clockOffset);
    const key = keyOf(record.type, record.id);
    const result = mergeRecord(records.get(key), record);
    records.set(key, result.record);
    written.push(result.record);
  }
  if (written.length === 0) return 0;
  saveLocal(written, basesOf);
  useLibraryStore.setState(state => decodeInto(state, written), true);
  for (const listener of localWriteListeners) listener();
  return written.length;
}

/** Test seam. */
export function resetLibrary(): void {
  records.clear();
  bases.clear();
  clockOffset = 0;
  for (const map of Object.values(children)) map.clear();
  parentOf.clear();
  blockChildren.clear();
  blockParent.clear();
  clock = null;
  useLibraryStore.setState(EMPTY, true);
}
