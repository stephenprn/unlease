/**
 * The page tree, read from the blocks and their children index (live children by parent, in
 * order; `ROOT` for the top-level pages): breadcrumbs, sub-pages, the bin, list numbering.
 */
import { HEADING_KINDS, RICH_KINDS, type Block, type BlockKind, type BlockTarget } from '../models/blocks';
import { parseRich, type MentionRun } from '@unlease/core/services/richText';

export type BlockMap = Readonly<Record<string, Block>>;
export type ChildIndex = Readonly<Record<string, readonly string[]>>;

/** The children index's key for the top-level pages. */
export const ROOT = '';

/** Deeper than any real tree: a cycle a merge could make (two devices moving two pages into each other) stops here. */
const MAX_DEPTH = 256;

export const parentKey = (parentId: string | null): string => parentId ?? ROOT;

/** The page that holds a block (the nearest page above it), or null for a top-level page or a broken chain. */
export function containingPage(blocks: BlockMap, id: string): string | null {
  let current = blocks[id];
  for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
    const parent = current.parentId === null ? undefined : blocks[current.parentId];
    if (!parent) return null;
    if (parent.kind === 'page') return parent.id;
    current = parent;
  }
  return null;
}

/** The pages above a page, the top-level one first: its breadcrumb. */
export function ancestorPages(blocks: BlockMap, pageId: string): Block[] {
  const out: Block[] = [];
  let current = containingPage(blocks, pageId);
  while (current !== null && out.length < MAX_DEPTH && !out.some(page => page.id === current)) {
    const page = blocks[current];
    if (!page) break;
    out.unshift(page);
    current = containingPage(blocks, current);
  }
  return out;
}

/** Everything under a block, depth first, in order. */
export function descendants(children: ChildIndex, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  const walk = (parent: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    for (const child of children[parent] ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      out.push(child);
      walk(child, depth + 1);
    }
  };
  walk(id, 0);
  return out;
}

/** The pages a page holds, wherever they sit in its content (in a column, under a toggle), in reading order. */
export function subPages(blocks: BlockMap, children: ChildIndex, pageId: string): string[] {
  const out: string[] = [];
  const walk = (parent: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    for (const child of children[parent] ?? []) {
      const block = blocks[child];
      if (!block) continue;
      if (block.kind === 'page') out.push(child);
      else walk(child, depth + 1);
    }
  };
  walk(pageId, 0);
  return out;
}

/** In the bin: the block's own page, or a page above it, was put there (a deleted one counts too). */
export function isInBin(blocks: BlockMap, id: string): boolean {
  let current = blocks[id];
  for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
    if (current.trashedAt !== null || current.deletedAt !== null) return true;
    if (current.parentId === null) return false;
    current = blocks[current.parentId];
  }
  // A parent that is not here (yet) or a chain too deep: not shown.
  return true;
}

/** `ancestor` is `id` itself or above it: moving it into `id` would make a loop. */
export function isWithin(blocks: BlockMap, id: string, ancestor: string): boolean {
  let current: string | null = id;
  for (let depth = 0; current !== null && depth < MAX_DEPTH; depth += 1) {
    if (current === ancestor) return true;
    current = blocks[current]?.parentId ?? null;
  }
  return false;
}

/** A numbered item's number: one more than the numbered item right before it among its siblings. */
export function listNumber(blocks: BlockMap, siblings: readonly string[], index: number): number {
  let number = 1;
  for (let at = index - 1; at >= 0 && blocks[siblings[at]!]?.kind === 'numbered'; at -= 1) number += 1;
  return number;
}

/** How many items of the same list kind a list item is nested under: its marker changes with it. */
export function listDepth(blocks: BlockMap, id: string, kind: BlockKind): number {
  let depth = 0;
  let current = blocks[id]?.parentId ?? null;
  for (let guard = 0; current !== null && guard < MAX_DEPTH; guard += 1) {
    const parent = blocks[current];
    if (!parent || parent.kind === 'page' || parent.kind === 'column') break;
    if (parent.kind === kind) depth += 1;
    current = parent.parentId;
  }
  return depth;
}

const ROMAN: readonly [number, string][] = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

function roman(value: number): string {
  let rest = value;
  let out = '';
  for (const [amount, letters] of ROMAN) {
    while (rest >= amount) {
      out += letters;
      rest -= amount;
    }
  }
  return out;
}

function letters(value: number): string {
  let rest = value;
  let out = '';
  while (rest > 0) {
    rest -= 1;
    out = String.fromCharCode(97 + (rest % 26)) + out;
    rest = Math.floor(rest / 26);
  }
  return out;
}

/** « 1. », then « a. » one level in, « i. » the next, and round again. */
export function numberLabel(value: number, depth: number): string {
  const style = depth % 3;
  return `${style === 0 ? value : style === 1 ? letters(value) : roman(value)}.`;
}

/** A bullet's mark by depth: a disc, a circle, a square, and round again. */
export function bulletMark(depth: number): string {
  return ['•', '◦', '▪'][depth % 3]!;
}

/** How a block shows what it points at: its mention alone in a text, a bookmark, or embedded whole. */
export type TargetDisplay = 'mention' | 'bookmark' | 'embed';

/** What a bookmark, an embed, or a text holding one mention and nothing else points at, and how it shows it; null for any other block. */
export function shownTarget(block: Block): { readonly target: BlockTarget; readonly display: TargetDisplay } | null {
  if (block.kind === 'bookmark' || block.kind === 'embed') return block.target ? { target: block.target, display: block.kind } : null;
  if (!RICH_KINDS.has(block.kind) || !block.text.includes('{@')) return null;
  const runs = parseRich(block.text);
  const mentions = runs.filter((run): run is MentionRun => run.kind === 'mention');
  // A date beside the mention is words of its own: shown another way it would be lost.
  if (mentions.length !== 1 || runs.some(run => run.kind === 'date' || (run.kind === 'text' && run.text.trim() !== ''))) return null;
  return { target: mentions[0]!.target, display: 'mention' };
}

/** A heading as a table of contents lists it. */
export interface TocEntry {
  readonly id: string;
  /** 1 to 4, as `h1` to `h4`. */
  readonly level: number;
  /** Its markup (marks, mentions and dates kept): draw it, or read it with `markupToPlain`. */
  readonly text: string;
  /** How far in it sits under the page's biggest heading: 0 for the biggest present. */
  readonly depth: number;
}

/**
 * A page's headings in reading order, wherever they sit in its content (a column, a toggle, under
 * an item), never inside a sub-page or a table; the empty ones left out.
 */
export function pageHeadings(blocks: BlockMap, children: ChildIndex, pageId: string): TocEntry[] {
  const found: { id: string; level: number; text: string }[] = [];
  const walk = (parent: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    for (const child of children[parent] ?? []) {
      const block = blocks[child];
      if (!block || block.deletedAt !== null || block.kind === 'page' || block.kind === 'table') continue;
      if (HEADING_KINDS.has(block.kind) && block.text.trim()) found.push({ id: block.id, level: Number(block.kind.slice(1)), text: block.text });
      walk(child, depth + 1);
    }
  };
  walk(pageId, 0);
  const top = Math.min(...found.map(entry => entry.level));
  return found.map(entry => ({ ...entry, depth: entry.level - top }));
}
