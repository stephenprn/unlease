/**
 * A page's blocks as an outline, to reorder by dragging (the phone's « Réorganiser »): each block a
 * row, one under another in reading order, as deep as it nests, and where a row let go between two
 * others lands. It goes in the container of the row above, or of one that row sits in, or under the
 * row above when that one holds blocks: as deep as the hand asks, within what the two neighbours
 * allow, so a block moves with what it holds and can change its depth, as the web's drop does.
 */
import { canNest, type BlockKind } from '../models/blocks';
import type { BlockMap, ChildIndex } from './blocks';

/** Deeper than any real page: the walk stops here. */
const MAX_DEPTH = 200;

export interface OutlineRow {
  readonly id: string;
  readonly kind: BlockKind;
  /** How deep it is drawn: 0 for the page's own blocks. */
  readonly depth: number;
  /** Its container: the page, an item, a toggle, a callout, a column or a row of columns. */
  readonly parentId: string;
  /** Whether it can be picked up: a column stays in its row (its blocks move, or the whole row). */
  readonly movable: boolean;
  /** Whether a block can go under it here: never a sub-page, whose content is its own page (« Déplacer vers »). */
  readonly holds: boolean;
}

/** Where a row let go lands: in `parentId`, after `afterId` (first when null), `depth` deep. */
export interface OutlineDrop {
  readonly parentId: string;
  readonly afterId: string | null;
  readonly depth: number;
  /** False when that is where it already is. */
  readonly moves: boolean;
}

/**
 * The page's blocks in reading order, every one shown whatever its toggles show on the page (a
 * structure to rearrange); a sub-page's content and a table's rows are theirs, not listed, and a
 * sub-page in the bin is not drawn.
 */
export function pageOutline(blocks: BlockMap, children: ChildIndex, pageId: string): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const walk = (parentId: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    for (const id of children[parentId] ?? []) {
      const block = blocks[id];
      if (!block || block.deletedAt !== null || block.kind === 'row') continue;
      if (block.kind === 'page' && block.trashedAt !== null) continue;
      rows.push({ id, kind: block.kind, depth, parentId, movable: block.kind !== 'column', holds: canNest(block.kind) && block.kind !== 'page' });
      if (block.kind !== 'page' && block.kind !== 'table') walk(id, depth + 1);
    }
  };
  walk(pageId, 0);
  return rows;
}

/** Where the rows under `index` end: what it holds is every row after it that is deeper. */
function subtreeEnd(rows: readonly OutlineRow[], index: number): number {
  const depth = rows[index]!.depth;
  let end = index + 1;
  while (end < rows.length && rows[end]!.depth > depth) end += 1;
  return end;
}

/** How many rows a row takes with it when it is picked up. */
export function carriedRows(rows: readonly OutlineRow[], id: string): number {
  const index = rows.findIndex(row => row.id === id);
  return index < 0 ? 0 : subtreeEnd(rows, index) - index - 1;
}

/** The rows a picked-up row leaves in place: everything but it and what it holds. */
export function rowsLeft(rows: readonly OutlineRow[], id: string): OutlineRow[] {
  const index = rows.findIndex(row => row.id === id);
  if (index < 0) return [...rows];
  return [...rows.slice(0, index), ...rows.slice(subtreeEnd(rows, index))];
}

/**
 * Where `id` lands, let go in the gap before `rowsLeft(rows, id)[gap]` (after them all when `gap` is
 * their count), as near `wanted` deep as the gap allows: no deeper than under the row above (when it
 * holds blocks), no shallower than the row below. A row of columns holds only its columns, and a row
 * of columns never goes inside a column. Null when nothing can land there (between a row of columns and
 * its first column) or when `id` cannot be picked up.
 */
export function outlineDrop(rows: readonly OutlineRow[], pageId: string, id: string, gap: number, wanted: number): OutlineDrop | null {
  const index = rows.findIndex(row => row.id === id);
  const moving = rows[index];
  if (!moving || !moving.movable) return null;
  const others = rowsLeft(rows, id);
  const at = Math.max(0, Math.min(gap, others.length));
  const above = others[at - 1];
  const below = others[at];
  const shallowest = below ? below.depth : 0;
  const deepest = above ? above.depth + (above.holds ? 1 : 0) : 0;
  if (shallowest > deepest) return null;
  const byId = new Map(rows.map(row => [row.id, row]));
  const kindOf = (container: string): BlockKind | null => byId.get(container)?.kind ?? null;

  /** The place `depth` deep in this gap: under the row above, or after it or the row it sits in at that depth. */
  const placeAt = (depth: number): { readonly parentId: string; readonly afterId: string | null } | null => {
    if (!above) return depth === 0 ? { parentId: pageId, afterId: null } : null;
    if (depth === above.depth + 1) return above.holds ? { parentId: above.id, afterId: null } : null;
    let row: OutlineRow | undefined = above;
    while (row && row.depth > depth) row = byId.get(row.parentId);
    return row && row.depth === depth ? { parentId: row.parentId, afterId: row.id } : null;
  };
  /** Whether a container is a column or sits in one. */
  const inColumn = (container: string): boolean => {
    for (let row = byId.get(container); row; row = byId.get(row.parentId)) if (row.kind === 'column') return true;
    return false;
  };
  const fits = (parentId: string): boolean => kindOf(parentId) !== 'columns' && !(moving.kind === 'columns' && inColumn(parentId));

  let best: OutlineDrop | null = null;
  for (let depth = shallowest; depth <= deepest; depth += 1) {
    const place = placeAt(depth);
    if (!place || !fits(place.parentId)) continue;
    // The nearest to what the hand asks; between two as near, the deeper one.
    if (best && Math.abs(depth - wanted) > Math.abs(best.depth - wanted)) continue;
    best = { ...place, depth, moves: true };
  }
  if (!best) return null;
  // Where it already is: in its container, after the sibling it follows now.
  let before: string | null = null;
  for (let at = index - 1; at >= 0; at -= 1) {
    const row = rows[at]!;
    if (row.depth < moving.depth) break;
    if (row.parentId === moving.parentId && row.depth === moving.depth) {
      before = row.id;
      break;
    }
  }
  return best.parentId === moving.parentId && best.afterId === before ? { ...best, moves: false } : best;
}
