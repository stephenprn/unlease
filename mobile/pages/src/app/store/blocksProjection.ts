/**
 * Pages' records as its screens read them: every block (`@unlease/pages/models/blocks`) and the live
 * blocks of each container in order, the top-level pages under `ROOT`. A projection of the shared
 * library (`@shared/app/store/library`), taken out of Carnet's store when Pages left Carnet: only
 * the touched containers' lists are replaced, so a subscriber re-renders only for its own blocks.
 *
 * Pages shows Carnet's collections too: its library combines this with Carnet's projection
 * (`combineProjections(notesProjection(), blocksProjection())`, Carnet's from
 * `mobile/notes/src/app/store/notesProjection.ts`), and syncs both apps' types (`syncedTypes('pages')`).
 */
import { comparePositions } from '@unlease/core/services/fractionalIndex';
import type { SyncRecord } from '@unlease/core/sync/record';
import type { Block } from '@unlease/pages/models/blocks';
import { loopsToRefile, parentKey, shownParent } from '@unlease/pages/services/blocks';
import { blockFromRecord } from '@unlease/pages/sync/entities';
import type { LibraryBase, LibraryProjection } from '@shared/app/store/library';

export interface BlocksState extends LibraryBase {
  /** Pages and their blocks (`pages/models/blocks`). */
  readonly blocks: Readonly<Record<string, Block>>;
  /** Live blocks per container, in order; the top-level pages under `ROOT` (`pages/services/blocks`). A container with none holds no key. */
  readonly blocksByParent: Readonly<Record<string, readonly string[]>>;
}

const EMPTY: BlocksState = { blocks: {}, blocksByParent: {}, revision: 0 };

function sortByPosition(ids: Iterable<string>, map: Readonly<Record<string, Block>>): string[] {
  return [...ids]
    .map(id => map[id])
    .filter((block): block is Block => block !== undefined)
    .sort(comparePositions)
    .map(block => block.id);
}

function sameIds(a: readonly string[] | undefined, b: readonly string[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export function blocksProjection(): LibraryProjection<BlocksState> {
  /** Live blocks per container key, and the container each live block is filed under (its shown parent: `shownParent`). */
  const blockChildren = new Map<string, Set<string>>();
  const blockParent = new Map<string, string>();
  /** Blocks filed at the top level for breaking a loop two devices' moves made (`loopsToRefile`). */
  const stranded = new Set<string>();

  function decode(base: BlocksState, changed: readonly SyncRecord[]): BlocksState {
    // Every key of `base` is kept, those of a projection combined with this one too.
    const draft: { -readonly [K in keyof BlocksState]: BlocksState[K] } = { ...base };
    const touchedContainers = new Set<string>();
    let blocksChanged = false;
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
      if (before !== undefined) touchedContainers.add(before);
      if (after !== undefined) touchedContainers.add(after);
    };
    const live: string[] = [];
    for (const record of changed) {
      if (record.type !== 'block') continue;
      if (!blocksChanged) draft.blocks = { ...draft.blocks };
      blocksChanged = true;
      const block = blockFromRecord(record);
      (draft.blocks as Record<string, Block>)[block.id] = block;
      file(block.id, block.deletedAt === null ? parentKey(block.parentId) : undefined);
      if (block.deletedAt === null) live.push(block.id);
    }
    // A loop two devices' moves made is shown broken, so nothing it holds disappears.
    for (const id of loopsToRefile(draft.blocks, live, stranded)) {
      const block = draft.blocks[id];
      file(id, block && block.deletedAt === null ? parentKey(shownParent(draft.blocks, id)) : undefined);
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
    return draft;
  }

  return {
    empty: EMPTY,
    decode,
    clear: () => {
      blockChildren.clear();
      blockParent.clear();
      stranded.clear();
    },
  };
}
