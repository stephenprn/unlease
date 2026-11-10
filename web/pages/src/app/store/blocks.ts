/**
 * Pages' library: every page and block, in memory, folded from the shell's records
 * (`platform/app/store/records`, which writes them through to IndexedDB and syncs them). Carnet's
 * notes, collections and links, which pages show and point at, are Carnet's own library
 * (`@notes/app/store/library`).
 *
 * Contacts' people, which pages mention, are Contacts' own library (`@contacts/app/store/library`):
 * only its `contacts` join Pages' view of the libraries (its labels would collide with Carnet's).
 *
 * Re-render discipline (load-bearing, keep it while "simplifying"): the block map is copied on
 * write and a block object is replaced only when its own record changed; a container's index is
 * replaced only when its children changed, and a container without children holds no key.
 */
import { useMemo, useRef, useSyncExternalStore } from 'react';
import { create } from 'zustand';

import type { SyncRecord } from '@unlease/core/sync/record';
import { loopsToRefile, parentKey, shownParent } from '@unlease/pages/services/blocks';
import type { Block } from '@unlease/pages/models/blocks';
import { blockFromRecord } from '@unlease/pages/sync/entities';
import { PAGES_TYPES } from '@unlease/pages/sync/types';

import type { Projection } from '@shared/app/store/records';
import { sameIds, sortByPosition, useLibraryStore, type LibraryState } from '@notes/app/store/library';
import { useContactsStore, type ContactsState } from '@contacts/app/store/library';
import { useEventsStore, type EventsState } from '@notes/app/events/store';

export interface BlocksState {
  /** Pages and their blocks (`pages/models/blocks`). */
  readonly blocks: Readonly<Record<string, Block>>;
  /** Live blocks per container, in order; the top-level pages under `ROOT` (`pages/services/blocks`). A container with none holds no key. */
  readonly blocksByParent: Readonly<Record<string, readonly string[]>>;
  /** Bumped by every change; cheap invalidation for derived caches like search. */
  readonly revision: number;
}

const EMPTY: BlocksState = { blocks: {}, blocksByParent: {}, revision: 0 };

export const useBlocksStore = create<BlocksState>(() => EMPTY);

/** Live blocks per container key, and the container each live block is filed under (its shown parent: `shownParent`). */
const blockChildren = new Map<string, Set<string>>();
const blockParent = new Map<string, string>();
/** Blocks filed at the top level for breaking a loop two devices' moves made (`loopsToRefile`). */
const stranded = new Set<string>();

function decodeInto(base: BlocksState, changed: readonly SyncRecord[]): BlocksState {
  let blocks = base.blocks;
  let blocksByParent = base.blocksByParent;
  const touched = new Set<string>();
  const file = (id: string, after: string | undefined): void => {
    const before = blockParent.get(id);
    if (before !== after) {
      if (before !== undefined) blockChildren.get(before)?.delete(id);
      if (after !== undefined) {
        let set = blockChildren.get(after);
        if (!set) blockChildren.set(after, (set = new Set()));
        set.add(id);
        blockParent.set(id, after);
      } else {
        blockParent.delete(id);
      }
    }
    if (before !== undefined) touched.add(before);
    if (after !== undefined) touched.add(after);
  };
  const live: string[] = [];
  for (const record of changed) {
    if (record.type !== 'block') continue;
    if (blocks === base.blocks) blocks = { ...base.blocks };
    const block = blockFromRecord(record);
    (blocks as Record<string, Block>)[block.id] = block;
    file(block.id, block.deletedAt === null ? parentKey(block.parentId) : undefined);
    if (block.deletedAt === null) live.push(block.id);
  }
  // A loop two devices' moves made is shown broken, so nothing it holds disappears.
  for (const id of loopsToRefile(blocks, live, stranded)) {
    const block = blocks[id];
    file(id, block && block.deletedAt === null ? parentKey(shownParent(blocks, id)) : undefined);
  }
  if (touched.size > 0) {
    const index = { ...blocksByParent } as Record<string, readonly string[]>;
    let indexChanged = false;
    for (const key of touched) {
      const ids = blockChildren.get(key);
      const sorted = ids && ids.size > 0 ? sortByPosition(ids, blocks) : [];
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
    if (indexChanged) blocksByParent = index;
  }
  return { blocks, blocksByParent, revision: base.revision + 1 };
}

/** What the shell feeds: the blocks, and only those. */
export const pagesProjection: Projection = {
  types: PAGES_TYPES,
  apply(changed, fresh) {
    useBlocksStore.setState(state => decodeInto(fresh ? EMPTY : state, changed), true);
  },
  clear() {
    blockChildren.clear();
    blockParent.clear();
    stranded.clear();
    useBlocksStore.setState(EMPTY, true);
  },
};

// ── with Carnet's library ───────────────────────────────────────────────────

/** What a page shows: its blocks, Carnet's notes, collections and links it embeds and mentions, and the contacts and Agenda's events it mentions. */
export type PagesLibrary = Omit<LibraryState, 'revision'> & BlocksState & { readonly contacts: ContactsState['contacts']; readonly events: EventsState['events'] };

/** The libraries as they are now. */
export function pagesLibrary(): PagesLibrary {
  return { ...useLibraryStore.getState(), ...useBlocksStore.getState(), contacts: useContactsStore.getState().contacts, events: useEventsStore.getState().events };
}

function subscribeBoth(listener: () => void): () => void {
  const blocks = useBlocksStore.subscribe(listener);
  const notes = useLibraryStore.subscribe(listener);
  const contacts = useContactsStore.subscribe(listener);
  const events = useEventsStore.subscribe(listener);
  return () => {
    blocks();
    notes();
    contacts();
    events();
  };
}

/** The libraries whole, re-rendering at any change of one (a search over all of it). */
export function useWholePagesLibrary(): PagesLibrary {
  const notes = useLibraryStore();
  const blocks = useBlocksStore();
  const contacts = useContactsStore(s => s.contacts);
  const events = useEventsStore(s => s.events);
  return useMemo(() => ({ ...notes, ...blocks, contacts, events }), [notes, blocks, contacts, events]);
}

/**
 * A selection over both libraries, re-rendering when it changes (as `Object.is`, or `equal`): for what
 * reads a page's blocks and the Carnet records they point at. Select a value or an entity, not a
 * fresh object.
 */
export function usePagesLibrary<T>(selector: (library: PagesLibrary) => T, equal: (a: T, b: T) => boolean = Object.is): T {
  const last = useRef<{ value: T } | null>(null);
  const read = (): T => {
    const value = selector(pagesLibrary());
    if (last.current && equal(last.current.value, value)) return last.current.value;
    last.current = { value };
    return value;
  };
  return useSyncExternalStore(subscribeBoth, read, read);
}
