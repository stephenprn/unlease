/**
 * The pages changed last, as Pages' home shows them under « Récentes », and « Déplacer vers »'s
 * places on both clients: every page a move may go into, by where it sits, with the recent ones
 * first while nothing is typed. Read from the blocks and their children index (`services/blocks`).
 */
import type { Block } from '../models/blocks';
import { ancestorPages, isInBin, type BlockMap, type ChildIndex } from './blocks';
import { foldText } from '@unlease/core/services/search';

/** Deeper than any real page: a walk down stops here. */
const MAX_DEPTH = 200;

/** When a page last changed: its title, its icon or a block of its content (a sub-page's content counts for the sub-page). */
export function pageEditedAt(blocks: BlockMap, children: ChildIndex, pageId: string): number {
  let latest = blocks[pageId]?.editedAt ?? 0;
  const walk = (parent: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    for (const id of children[parent] ?? []) {
      const block = blocks[id];
      if (!block || block.kind === 'page') continue;
      latest = Math.max(latest, block.editedAt);
      walk(id, depth + 1);
    }
  };
  walk(pageId, 0);
  return latest;
}

/** A page out of the bin, at any depth. */
export const isLivePage = (blocks: BlockMap, block: Block): boolean => block.kind === 'page' && block.deletedAt === null && !isInBin(blocks, block.id);

/** The pages changed last, at any depth, the latest first; `keep` leaves some out before counting. */
export function recentPages(blocks: BlockMap, children: ChildIndex, count: number, keep: (id: string) => boolean = () => true): string[] {
  return Object.values(blocks)
    .filter(block => isLivePage(blocks, block) && keep(block.id))
    .map(block => ({ id: block.id, edited: pageEditedAt(blocks, children, block.id) }))
    .sort((a, b) => b.edited - a.edited || (a.id < b.id ? -1 : 1))
    .slice(0, count)
    .map(entry => entry.id);
}

/** A page offered by « Déplacer vers »: it, and the pages above it as one line (« Recettes / Pain au levain »). */
export interface MovePlace {
  readonly page: Block;
  readonly path: string;
}

export interface MovePlaces {
  /** With nothing typed and enough places to need them: the pages changed last, the one it is in left out. */
  readonly recent: readonly MovePlace[];
  /** Every place (or those matching what is typed), sorted by where they sit; the recent ones too. */
  readonly all: readonly MovePlace[];
}

/** At most this many places are listed; the field finds the others. */
export const MOVE_PLACES_SHOWN = 60;
/** At most this many under « Récentes ». */
export const MOVE_RECENT = 5;
/** Fewer places than this, and the list shows them at a glance: no « Récentes » to repeat them. */
export const MOVE_RECENT_FROM = 8;

export interface MovePlacesOptions {
  /** What is typed in the field. */
  readonly query: string;
  /** A page the moved blocks (or the page moved) would land inside: never offered. */
  readonly exclude: (id: string) => boolean;
  /** Where they are now (listed, ticked, but never among the recent ones); null for the top level. */
  readonly current: string | null;
  /** An untitled page's name (`UNTITLED_PAGE`, translated). */
  readonly untitled: string;
}

/**
 * « Déplacer vers »'s pages: every page out of the bin it may go into, by its title under the pages
 * above it, sorted by where it sits; what is typed keeps those whose title holds it. With nothing
 * typed and a long list, the pages changed last come first (`recentPages`, the home's « Récentes »).
 */
export function movePlaces(blocks: BlockMap, children: ChildIndex, { query, exclude, current, untitled }: MovePlacesOptions): MovePlaces {
  const wanted = foldText(query.trim());
  const title = (page: Block): string => page.text.trim() || untitled;
  const trails = new Map<string, string[]>();
  const trail = (page: Block): string[] => {
    let found = trails.get(page.id);
    if (!found) trails.set(page.id, (found = [...ancestorPages(blocks, page.id).map(title), title(page)]));
    return found;
  };
  const placed = (page: Block): MovePlace => ({ page, path: trail(page).slice(0, -1).join(' / ') });
  // By place: a page right after the one above it, then its sub-pages, siblings by title.
  const byPlace = (a: Block, b: Block): number => {
    const [left, right] = [trail(a), trail(b)];
    for (let at = 0; at < Math.min(left.length, right.length); at += 1) {
      const order = left[at]!.localeCompare(right[at]!, 'fr');
      if (order !== 0) return order;
    }
    return left.length - right.length || (a.id < b.id ? -1 : 1);
  };
  const open = Object.values(blocks).filter(block => isLivePage(blocks, block) && !exclude(block.id));
  const all = open
    .filter(page => !wanted || foldText(page.text).includes(wanted))
    .sort(byPlace)
    .map(placed);
  if (wanted || open.length < MOVE_RECENT_FROM) return { recent: [], all: all.slice(0, MOVE_PLACES_SHOWN) };
  const offered = new Set(open.map(page => page.id));
  const recent = recentPages(blocks, children, MOVE_RECENT, id => offered.has(id) && id !== current).map(id => placed(blocks[id]!));
  return { recent, all: all.slice(0, MOVE_PLACES_SHOWN) };
}
