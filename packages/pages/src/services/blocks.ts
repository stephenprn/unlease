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

/** Deeper than any real tree: a walk up stops here. */
const MAX_DEPTH = 256;

export const parentKey = (parentId: string | null): string => parentId ?? ROOT;

/**
 * Of a loop two devices' moves made (one put page A into B as the other put B into A), the block
 * shown at the top level, as if its move had not happened: a page of the loop if there is one, the
 * one moved last (its `parentId`'s clock), so every device shows the same until the server repairs it.
 */
function loopBreaker(loop: readonly Block[]): Block {
  const pages = loop.filter(block => block.kind === 'page');
  const among = pages.length > 0 ? pages : loop;
  return among.reduce((best, block) => {
    const a = block.movedAt ?? '';
    const b = best.movedAt ?? '';
    return a > b || (a === b && block.id > best.id) ? block : best;
  });
}

/**
 * The blocks from `id` up to the top as they are shown, `id` first: a loop is broken at its
 * `loopBreaker`. `whole` is false when a parent is not here (yet) or the chain is too deep.
 */
function shownChain(blocks: BlockMap, id: string): { readonly path: readonly Block[]; readonly whole: boolean } {
  const path: Block[] = [];
  const at = new Map<string, number>();
  let current = blocks[id];
  for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
    const seen = at.get(current.id);
    if (seen !== undefined) {
      const breaker = loopBreaker(path.slice(seen));
      return { path: path.slice(0, path.indexOf(breaker) + 1), whole: true };
    }
    at.set(current.id, path.length);
    path.push(current);
    if (current.parentId === null) return { path, whole: true };
    current = blocks[current.parentId];
  }
  return { path, whole: false };
}

/** The blocks of the loop `id` is on (it first), or null when its walk up does not come back to it. */
function loopThrough(blocks: BlockMap, id: string): Block[] | null {
  const first = blocks[id];
  if (!first) return null;
  const loop: Block[] = [first];
  const seen = new Set<string>([id]);
  let current = first.parentId;
  for (let depth = 0; current !== null && depth < MAX_DEPTH; depth += 1) {
    if (current === id) return loop;
    const block = blocks[current];
    if (!block || seen.has(current)) return null;
    seen.add(current);
    loop.push(block);
    current = block.parentId;
  }
  return null;
}

/** The parent a block is shown under: its own, or none (the top level) for the block a loop is broken at. */
export function shownParent(blocks: BlockMap, id: string): string | null {
  const block = blocks[id];
  if (!block) return null;
  const loop = loopThrough(blocks, id);
  return loop && loopBreaker(loop).id === id ? null : block.parentId;
}

/**
 * For a projection's children index (`blocksByParent`), which files each live block under its
 * `shownParent`: the blocks to file again after `changed` did, those on a loop they made or opened.
 * `stranded` holds the blocks shown at the top level for breaking a loop; it is kept up to date.
 */
export function loopsToRefile(blocks: BlockMap, changed: Iterable<string>, stranded: Set<string>): string[] {
  const out = new Set<string>(stranded);
  for (const id of changed) for (const block of loopThrough(blocks, id) ?? []) out.add(block.id);
  stranded.clear();
  for (const id of out) {
    const block = blocks[id];
    if (block && block.deletedAt === null && shownParent(blocks, id) !== block.parentId) stranded.add(id);
  }
  return [...out];
}

/** The page that holds a block (the nearest page above it), or null for a top-level page or a broken chain. */
export function containingPage(blocks: BlockMap, id: string): string | null {
  return shownChain(blocks, id).path.slice(1).find(block => block.kind === 'page')?.id ?? null;
}

/**
 * The toggles a block is shown in, up to its page, the nearest first: what must open for it to be
 * drawn (a block Tab nested under a closed toggle takes the caret there).
 */
export function togglesAbove(blocks: BlockMap, id: string): string[] {
  const out: string[] = [];
  for (const block of shownChain(blocks, id).path.slice(1)) {
    if (block.kind === 'page') break;
    if (block.kind === 'toggle') out.push(block.id);
  }
  return out;
}

/** The pages above a page, the top-level one first: its breadcrumb. */
export function ancestorPages(blocks: BlockMap, pageId: string): Block[] {
  return shownChain(blocks, pageId)
    .path.slice(1)
    .filter(block => block.kind === 'page')
    .reverse();
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

/**
 * In the bin: the block's own page, or a page above it, was put there (a deleted one counts too).
 * A parent that is not here (yet), or a chain too deep, counts too: not shown. A loop two devices'
 * moves made is not: it is shown broken (`shownParent`), so nothing it holds disappears.
 */
export function isInBin(blocks: BlockMap, id: string): boolean {
  const { path, whole } = shownChain(blocks, id);
  return path.length === 0 || !whole || path.some(block => block.trashedAt !== null || block.deletedAt !== null);
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
