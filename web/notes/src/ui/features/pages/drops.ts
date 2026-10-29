/**
 * Where a drag lands, as a page action: blocks moved within or between pages (beside a block,
 * columns), a page moved in the tree, or dropped from the tree into a page's content (where it
 * becomes a sub-page, as any block would).
 */
import { containingPage } from '@unlease/notes/services/blocks';

import { useLibraryStore } from '../../../app/store/library';
import { moveBlocks, movePage } from '../../../app/store/pages';
import { setExpanded } from '../../../app/store/pagesUi';
import type { DropTarget } from './dragDrop';

export interface Dragged {
  readonly kind: 'blocks' | 'page';
  readonly ids: readonly string[];
  /** The page the blocks were taken from, whose undo records the move; null for a page from the tree. */
  readonly page: string | null;
  /** The source page's blocks in reading order, so several dragged blocks keep their order. */
  readonly outline: readonly string[];
}

/** The last block of a container that is not being moved. */
function lastChild(parentId: string, moving: readonly string[]): string | null {
  const ids = (useLibraryStore.getState().blocksByParent[parentId] ?? []).filter(id => !moving.includes(id));
  return ids[ids.length - 1] ?? null;
}

export function applyDrop(dragged: Dragged, target: DropTarget): boolean {
  const { blocks, blocksByParent } = useLibraryStore.getState();
  const { ids, outline } = dragged;
  if (target.type === 'tree') {
    const moved =
      dragged.kind === 'page'
        ? movePage(ids[0]!, target.zone === 'inside' ? { into: target.id } : { beside: target.id, after: target.zone === 'after' })
        : moveBlocks(dragged.page ?? target.id, ids, { parentId: target.id, afterId: lastChild(target.id, ids) }, outline);
    // Dropped in a page of the tree: it opens, so what landed there shows.
    if (moved && target.zone === 'inside') setExpanded(target.id, true);
    return moved;
  }
  const history = dragged.page ?? (target.type === 'tail' ? target.id : (containingPage(blocks, target.id) ?? target.id));
  if (target.type === 'tail') return moveBlocks(history, ids, { parentId: target.id, afterId: lastChild(target.id, ids) }, outline);
  const block = blocks[target.id];
  if (!block || block.parentId === null) return false;
  if (target.zone === 'left' || target.zone === 'right') return moveBlocks(history, ids, { beside: target.id, side: target.zone }, outline);
  const siblings = (blocksByParent[block.parentId] ?? []).filter(id => !ids.includes(id));
  const index = siblings.indexOf(target.id);
  const afterId = target.zone === 'after' ? target.id : (siblings[index - 1] ?? null);
  return moveBlocks(history, ids, { parentId: block.parentId, afterId }, outline);
}
