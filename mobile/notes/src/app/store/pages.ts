/**
 * What a person does to pages and their blocks, as library writes. Each gesture is one batch (one
 * clock) and one step of its page's undo (`pageHistory`). Positions come from `placeAt`, so blocks
 * two devices placed at once still find room. Columns tidy themselves in the same batch: a column
 * left empty goes, and a row of columns left with one is undone into its blocks.
 */
import { t } from '@unlease/core/i18n';
import { CAPTION_KINDS, canNest, type Block, type BlockKind, type BlockTarget, type CellValue, type CollectionView, type ColumnType, type SelectOption, type TableColumn, type ViewColumn } from '@unlease/notes/models/blocks';
import { isInBin, isWithin, parentKey, ROOT, shownTarget, type TargetDisplay } from '@unlease/notes/services/blocks';
import { comparePositions, indexBetween, placeAt } from '@unlease/core/services/fractionalIndex';
import { createId } from '@unlease/core/services/ids';
import type { BlockDraft } from '@unlease/notes/services/pageText';
import { concatRich, markupToPlain, parseRich, richFromPlain, richLength, serializeRich } from '@unlease/core/services/richText';
import { convertCell, distinctTexts, emptyCell, optionsFor } from '@unlease/notes/services/table';
import { blockFields, blockFromRecord, type NewBlockFields } from '@unlease/notes/sync/entities';
import type { Fields } from '@unlease/core/sync/record';
import { dateWords } from '@unlease/core/services/dates';

import { saveTypedText, writeWithUndo, type Undo } from './actions';
import { getRecord, useLibraryStore, writeLocal, type LocalChange } from './libraryStore';
import { commit, recordTyping, type Caret } from './pageHistory';

const state = () => useLibraryStore.getState();

const LIST_KINDS: ReadonlySet<BlockKind> = new Set(['bullet', 'numbered', 'todo']);

/**
 * The blocks as this gesture leaves them, before it is written: reads see its own changes, so a
 * move, the columns it empties and their tidying are computed in one go.
 */
class Batch {
  private readonly patches = new Map<string, Fields>();

  constructor(readonly now: number) {}

  block(id: string): Block | undefined {
    const patch = this.patches.get(id);
    const record = getRecord('block', id);
    if (!patch) return state().blocks[id];
    return blockFromRecord({ type: 'block', id, fields: { ...record?.fields, ...patch }, clocks: record?.clocks ?? {} });
  }

  set(id: string, patch: Fields): void {
    this.patches.set(id, { ...this.patches.get(id), ...patch });
  }

  /** The live blocks of a container, in order. */
  children(key: string): Block[] {
    const ids = new Set(state().blocksByParent[key] ?? []);
    for (const id of this.patches.keys()) ids.add(id);
    const out: Block[] = [];
    for (const id of ids) {
      const block = this.block(id);
      if (block && block.deletedAt === null && parentKey(block.parentId) === key) out.push(block);
    }
    return out.sort(comparePositions);
  }

  indexOf(block: Block): number {
    return this.children(parentKey(block.parentId)).findIndex(sibling => sibling.id === block.id);
  }

  /** Keys for `count` blocks going at `index` of a container (counted without `going`), twins moved aside. */
  place(key: string, index: number, count: number, going: ReadonlySet<string> = new Set()): string[] {
    const siblings = this.children(key).filter(sibling => !going.has(sibling.id));
    const { positions, moved } = placeAt(siblings, Math.max(0, Math.min(index, siblings.length)), count);
    for (const twin of moved) this.set(twin.id, { position: twin.position });
    return positions;
  }

  create(parentId: string | null, index: number, init: Omit<NewBlockFields, 'parentId' | 'position' | 'createdAt'>, id: string = createId(this.now)): string {
    const [position] = this.place(parentKey(parentId), index, 1);
    this.set(id, blockFields({ ...init, parentId, position: position!, createdAt: this.now }));
    return id;
  }

  /** `ids`, in this order, into a container at `index` (counted without them). */
  move(ids: readonly string[], parentId: string | null, index: number): void {
    const positions = this.place(parentKey(parentId), index, ids.length, new Set(ids));
    ids.forEach((id, at) => this.set(id, { parentId, position: positions[at]! }));
  }

  /**
   * A block and what it holds, gone. A page among them goes to the bin instead, as it might be wanted
   * back; `forever` (emptying the bin) takes a page with its content, except a page already in the
   * bin on its own, which waits there.
   */
  remove(id: string, forever = false): void {
    const walk = (blockId: string, depth: number): void => {
      const block = this.block(blockId);
      if (!block || depth > 200) return;
      if (block.kind === 'page' && (depth > 0 || !forever)) {
        if (block.trashedAt !== null) return;
        if (!forever) {
          this.set(blockId, { trashedAt: this.now });
          return;
        }
      }
      for (const child of this.children(blockId)) walk(child.id, depth + 1);
      this.set(blockId, { deletedAt: this.now });
    };
    walk(id, 0);
  }

  changes(): LocalChange[] {
    return [...this.patches].map(([id, patch]) => ({ type: 'block' as const, id, patch }));
  }
}

/**
 * Columns these containers belonged to, tidied: an empty column goes; a row left with one column
 * hands its blocks back to where the row stood; a row left with none goes.
 */
function tidyColumns(batch: Batch, containers: Iterable<string | null>): void {
  const rows = new Set<string>();
  for (const id of containers) {
    if (id === null) continue;
    const container = batch.block(id);
    if (!container || container.deletedAt !== null) continue;
    if (container.kind === 'column') {
      if (batch.children(id).length === 0) batch.remove(id);
      if (container.parentId) rows.add(container.parentId);
    } else if (container.kind === 'columns') {
      rows.add(id);
    }
  }
  for (const rowId of rows) {
    const row = batch.block(rowId);
    if (!row || row.deletedAt !== null) continue;
    const columns = batch.children(rowId);
    if (columns.length > 1) continue;
    if (columns.length === 1) {
      const only = columns[0]!;
      const blocks = batch.children(only.id).map(block => block.id);
      batch.move(blocks, row.parentId, batch.indexOf(row));
    }
    batch.remove(rowId);
  }
}

/** The page whose undo a block's gesture belongs to: the editor passes it, so a sub-page's own blocks stay in theirs. */
type PageId = string;

function write(page: PageId | null, batch: Batch, carets: { readonly before?: Caret | null; readonly after?: Caret | null } = {}): void {
  commit(page, batch.changes(), carets, batch.now);
}

const outermost = (ids: readonly string[]): string[] => {
  const blocks = state().blocks;
  return ids.filter(id => !ids.some(other => other !== id && isWithin(blocks, id, other)));
};

/** In reading order: the order of the outline. */
function inDocumentOrder(ids: readonly string[], outline: readonly string[]): string[] {
  const rank = new Map(outline.map((id, index) => [id, index]));
  return [...ids].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
}

// ── pages ──────────────────────────────────────────────────────────────────

export interface NewPage {
  /** What it goes in (a page's content, or a column or an item of it), at the end or after `afterId`; null for a top-level page. */
  readonly parentId?: string | null;
  readonly afterId?: string | null;
  readonly title?: string;
  readonly icon?: string | null;
  /** The page whose undo takes it, when it is not its parent. */
  readonly history?: string;
}

/** A new page; inside another, it is also a block of that page's content (its undo is that page's). */
export function createPage({ parentId = null, afterId = null, title = '', icon = null, history }: NewPage = {}, now: number = Date.now()): string {
  const batch = new Batch(now);
  const siblings = batch.children(parentKey(parentId));
  const index = afterId ? siblings.findIndex(block => block.id === afterId) + 1 || siblings.length : siblings.length;
  const id = batch.create(parentId, index, { kind: 'page', text: title, ...(icon ? { icon } : {}), trashedAt: null });
  write(history ?? parentId, batch);
  return id;
}

export function renamePage(id: string, since: string | null, typed: string): string {
  return saveTypedText('block', id, 'text', since, typed.replace(/\r?\n/g, ' '));
}

export function setPageIcon(id: string, icon: string | null): void {
  writeLocal([{ type: 'block', id, patch: { icon } }]);
}

/** Kept away from Claude, with what is under it: never sent with a question about the pages. */
export function setPagePrivate(id: string, kept: boolean): void {
  writeLocal([{ type: 'block', id, patch: { private: kept } }]);
}

/** To the bin, with what it holds; its block stays where it was in its parent's content, hidden. */
export function trashPage(id: string, now: number = Date.now()): Undo {
  const before = state().blocks[id]?.trashedAt ?? null;
  writeLocal([{ type: 'block', id, patch: { trashedAt: now } }], now);
  return () => writeLocal([{ type: 'block', id, patch: { trashedAt: before } }]);
}

/** Out of the bin: where it was, or at the top level when that place is gone or in the bin itself. */
export function restorePage(id: string, now: number = Date.now()): Undo {
  const { blocks } = state();
  const page = blocks[id];
  if (!page) return () => {};
  const batch = new Batch(now);
  batch.set(id, { trashedAt: null });
  if (page.parentId !== null && (!blocks[page.parentId] || isInBin(blocks, page.parentId))) batch.move([id], null, batch.children(ROOT).length);
  return writeWithUndo(batch.changes());
}

/** Gone for good: the page and everything under it get a tombstone (a sub-page in the bin on its own stays there). */
export function deletePageForever(ids: readonly string[], now: number = Date.now()): void {
  const batch = new Batch(now);
  for (const id of ids) batch.remove(id, true);
  writeLocal(batch.changes(), now);
}

/** The pages in the bin: those put there themselves (what they hold went with them). */
export function trashedPages(): Block[] {
  const { blocks } = state();
  return Object.values(blocks)
    .filter(block => block.kind === 'page' && block.deletedAt === null && block.trashedAt !== null)
    .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
}

export function emptyPagesBin(now: number = Date.now()): number {
  const pages = trashedPages();
  deletePageForever(
    pages.map(page => page.id),
    now,
  );
  return pages.length;
}

/** Where a page is dropped in the tree: into another page (at the end of its content), or beside one. */
export type PageDrop = { readonly into: string | null } | { readonly beside: string; readonly after: boolean };

export function movePage(id: string, drop: PageDrop, now: number = Date.now()): boolean {
  const { blocks } = state();
  const batch = new Batch(now);
  const page = blocks[id];
  if (!page) return false;
  let parentId: string | null;
  let index: number;
  if ('into' in drop) {
    parentId = drop.into;
    if (parentId !== null && isWithin(blocks, parentId, id)) return false;
    index = batch.children(parentKey(parentId)).filter(block => block.id !== id).length;
  } else {
    const sibling = blocks[drop.beside];
    if (!sibling || sibling.id === id || (sibling.parentId !== null && isWithin(blocks, sibling.parentId, id))) return false;
    parentId = sibling.parentId;
    const siblings = batch.children(parentKey(parentId)).filter(block => block.id !== id);
    index = siblings.findIndex(block => block.id === sibling.id) + (drop.after ? 1 : 0);
  }
  const from = page.parentId;
  batch.move([id], parentId, index);
  tidyColumns(batch, [from]);
  writeLocal(batch.changes(), now);
  return true;
}

/** A copy of blocks (pages included) and of all they hold, right after the last of them; returns the copies' ids. */
export function duplicateBlocks(page: PageId | null, ids: readonly string[], outline: readonly string[] = ids, now: number = Date.now()): string[] {
  const batch = new Batch(now);
  const roots = inDocumentOrder(outermost(ids), outline);
  const last = batch.block(roots[roots.length - 1] ?? '');
  if (!last) return [];
  const copies: string[] = [];
  const copy = (source: Block, parentId: string | null, index: number, rename: boolean): string => {
    const fields = { ...getRecord('block', source.id)?.fields };
    delete fields.parentId;
    delete fields.position;
    const id = createId(now);
    const [position] = batch.place(parentKey(parentId), index, 1);
    batch.set(id, { ...fields, text: rename && source.kind === 'page' ? t('{title} (copie)', { title: source.text }) : source.text, parentId, position: position!, createdAt: now, deletedAt: null, trashedAt: null });
    batch.children(source.id).forEach((child, at) => copy(child, id, at, false));
    return id;
  };
  let index = batch.indexOf(last) + 1;
  for (const id of roots) {
    const source = batch.block(id);
    if (!source) continue;
    copies.push(copy(source, last.parentId, index, true));
    index += 1;
  }
  write(page, batch);
  return copies;
}

// ── writing in blocks ──────────────────────────────────────────────────────

/** What an editor holds for a block's text, caption or drawing (`saveTypedText`), kept in its page's undo. Returns the text now stored. */
export function saveBlockText(page: PageId, id: string, since: string | null, typed: string, carets: { readonly before?: Caret | null; readonly after?: Caret | null } = {}, field: 'text' | 'caption' | 'drawing' = 'text'): string {
  const before = getRecord('block', id)?.fields[field];
  const stored = saveTypedText('block', id, field, since, typed);
  recordTyping(page, id, field, typeof before === 'string' ? before : '', stored, carets);
  return stored;
}

export function updateBlock(page: PageId | null, id: string, patch: Fields, carets: { readonly before?: Caret | null; readonly after?: Caret | null } = {}): void {
  commit(page, [{ type: 'block', id, patch }], carets);
}

export interface NewBlock extends Omit<NewBlockFields, 'parentId' | 'position' | 'createdAt'> {
  readonly kind: BlockKind;
}

/** A block in a container at `index`; returns its id. */
export function insertBlock(page: PageId, parentId: string, index: number, init: NewBlock, now: number = Date.now()): string {
  const batch = new Batch(now);
  const id = batch.create(parentId, index, init);
  write(page, batch, { after: { block: id, offset: 0 } });
  return id;
}

/** A block right after another one (in the same container); returns its id. */
export function insertAfter(page: PageId, afterId: string, init: NewBlock, now: number = Date.now()): string | null {
  const batch = new Batch(now);
  const anchor = batch.block(afterId);
  if (!anchor) return null;
  const id = batch.create(anchor.parentId, batch.indexOf(anchor) + 1, init);
  write(page, batch, { after: { block: id, offset: 0 } });
  return id;
}

/** Drafts (a paste) as blocks after `afterId`, or at the start of `parentId`: returns the top ids. */
export function insertDrafts(page: PageId, drafts: readonly BlockDraft[], at: { readonly afterId: string } | { readonly parentId: string; readonly index: number }, now: number = Date.now()): string[] {
  const batch = new Batch(now);
  let parentId: string | null;
  let index: number;
  if ('afterId' in at) {
    const anchor = batch.block(at.afterId);
    if (!anchor) return [];
    parentId = anchor.parentId;
    index = batch.indexOf(anchor) + 1;
  } else {
    parentId = at.parentId;
    index = at.index;
  }
  const make = (draft: BlockDraft, into: string | null, where: number): string => {
    const id = batch.create(into, where, {
      ...(draft.extra as Partial<NewBlock> | undefined),
      kind: draft.kind,
      text: draft.text,
      ...(draft.checked !== undefined ? { checked: draft.checked } : {}),
      ...(draft.language !== undefined ? { language: draft.language } : {}),
      ...(draft.kind === 'page' ? { trashedAt: null } : {}),
    });
    (draft.children ?? []).forEach((child, k) => make(child, canNest(draft.kind) ? id : into, k));
    return id;
  };
  const ids = drafts.map((draft, k) => make(draft, parentId, index + k));
  const last = ids[ids.length - 1];
  write(page, batch, last ? { after: { block: last, offset: 'end' } } : {});
  return ids;
}

/** A block to make, with what goes under it. */
type Making = NewBlock & { readonly children?: readonly BlockDraft[] };

const makingOf = (draft: BlockDraft): Making => ({
  ...(draft.extra as Partial<NewBlock> | undefined),
  kind: draft.kind,
  text: draft.text,
  ...(draft.checked !== undefined ? { checked: draft.checked } : {}),
  ...(draft.language !== undefined ? { language: draft.language } : {}),
  ...(draft.children ? { children: draft.children } : {}),
});

/**
 * A whole page in one gesture (an article kept as a copy): a top-level page after the others, the
 * card of `cite` first in it, then the drafts. Not a step of its undo: undoing it would delete the
 * page for good (it goes to the bin like any page).
 */
export function createPageFrom({ title, cite = null, drafts }: { readonly title: string; readonly cite?: BlockTarget | null; readonly drafts: readonly BlockDraft[] }, now: number = Date.now()): string {
  const batch = new Batch(now);
  const id = batch.create(null, batch.children(ROOT).length, { kind: 'page', text: title, trashedAt: null });
  // Each container's blocks placed at once: a long article stays one quick batch.
  const fill = (into: string, list: readonly Making[]): void => {
    const positions = batch.place(into, 0, list.length);
    list.forEach((item, k) => {
      const { children, ...init } = item;
      const child = createId(now);
      batch.set(child, blockFields({ ...init, parentId: into, position: positions[k]!, createdAt: now }));
      if (children && children.length > 0 && canNest(init.kind)) fill(child, children.map(makingOf));
    });
  };
  fill(id, [...(cite ? [targetBlock('bookmark', cite)] : []), ...drafts.map(makingOf)]);
  write(null, batch);
  return id;
}

/**
 * Enter in a block: it keeps the text before the caret, a new block after it takes the rest. A
 * list goes on as a list, a heading gives way to text; an open toggle or a callout takes the new
 * block first inside. At the very start of a block, the new empty one goes before it instead and
 * the caret stays. Returns the block the caret goes to.
 */
export function splitBlock(page: PageId, id: string, before: string, after: string, options: { readonly intoChildren?: boolean; readonly caret?: Caret } = {}, now: number = Date.now()): string | null {
  const batch = new Batch(now);
  const block = batch.block(id);
  if (!block) return null;
  const listy = LIST_KINDS.has(block.kind);
  const kind: BlockKind = listy || block.kind === 'toggle' ? block.kind : 'text';
  const extra = kind === 'todo' ? { checked: false } : {};
  if (before === '' && after !== '' && !options.intoChildren) {
    batch.create(block.parentId, batch.indexOf(block), { kind: listy ? block.kind : 'text', text: '', ...extra });
    write(page, batch, { before: options.caret ?? null, after: { block: id, offset: 0 } });
    return id;
  }
  batch.set(id, { text: before });
  const inside = options.intoChildren || block.kind === 'callout';
  const next = inside ? batch.create(id, 0, { kind: 'text', text: after }) : batch.create(block.parentId, batch.indexOf(block) + 1, { kind, text: after, ...extra });
  write(page, batch, { before: options.caret ?? null, after: { block: next, offset: 0 } });
  return next;
}

/**
 * Enter in a page's title: the title keeps what is before the caret, and a paragraph at the top of
 * the page takes the rest (the empty paragraph already there, or a new one). Returns that paragraph.
 */
export function splitTitle(page: PageId, before: string, after: string, now: number = Date.now()): string {
  const batch = new Batch(now);
  if (batch.block(page)?.text !== before) batch.set(page, { text: before });
  const text = serializeRich(richFromPlain(after));
  const first = batch.children(page)[0];
  let id: string;
  if (first?.kind === 'text' && first.text === '') {
    id = first.id;
    if (text) batch.set(id, { text });
  } else {
    id = batch.create(page, 0, { kind: 'text', text });
  }
  write(page, batch, { before: { block: page, offset: before.length }, after: { block: id, offset: 0 } });
  return id;
}

/**
 * Backspace at the start of a block, into the block before it in the outline: its text joins that
 * one's, what it held follows (under that block when it nests, else in its place). Returns where
 * the caret goes.
 */
export function mergeBlocks(page: PageId, previousId: string, id: string, markup: string, now: number = Date.now()): Caret | null {
  const batch = new Batch(now);
  const previous = batch.block(previousId);
  const block = batch.block(id);
  if (!previous || !block) return null;
  const head = parseRich(previous.text);
  batch.set(previousId, { text: serializeRich(concatRich(head, parseRich(markup))) });
  const held = batch.children(id).map(child => child.id);
  if (held.length > 0) {
    if (canNest(previous.kind)) batch.move(held, previousId, batch.children(previousId).length);
    else batch.move(held, block.parentId, batch.indexOf(block));
  }
  batch.set(id, { deletedAt: now });
  tidyColumns(batch, [block.parentId]);
  const caret = { block: previousId, offset: richLength(head) };
  write(page, batch, { before: { block: id, offset: 0 }, after: caret });
  return caret;
}

/** Blocks deleted with what they hold; a page among them goes to the bin. */
export function deleteBlocks(page: PageId, ids: readonly string[], caretAfter: Caret | null = null, now: number = Date.now()): void {
  const batch = new Batch(now);
  const parents = new Set<string | null>();
  for (const id of outermost(ids)) {
    const block = batch.block(id);
    if (!block) continue;
    parents.add(block.parentId);
    batch.remove(id);
  }
  tidyColumns(batch, parents);
  write(page, batch, { after: caretAfter });
}

/** Where blocks are dropped: into a container after one of its blocks (null: first), or beside a block, making columns. */
export type BlockDrop = { readonly parentId: string; readonly afterId: string | null } | { readonly beside: string; readonly side: 'left' | 'right' };

/** Blocks moved (dragged, or Ctrl+Maj+↑↓), in reading order. False when the drop would put a block inside itself. */
export function moveBlocks(page: PageId, ids: readonly string[], drop: BlockDrop, outline: readonly string[] = ids, now: number = Date.now()): boolean {
  const { blocks } = state();
  const batch = new Batch(now);
  const moving = inDocumentOrder(outermost(ids), outline);
  if (moving.length === 0) return false;
  const from = moving.map(id => blocks[id]?.parentId ?? null);
  if ('parentId' in drop) {
    if (moving.some(id => isWithin(blocks, drop.parentId, id))) return false;
    const siblings = batch.children(drop.parentId).filter(block => !moving.includes(block.id));
    batch.move(moving, drop.parentId, indexBetween(siblings, drop.afterId, null));
  } else {
    const target = batch.block(drop.beside);
    if (!target || moving.includes(target.id) || moving.some(id => isWithin(blocks, target.id, id))) return false;
    const container = target.parentId === null ? undefined : batch.block(target.parentId);
    if (container?.kind === 'column') {
      // Beside a block already in a column: one more column in that row, the row's widths evened out.
      const row = container.parentId!;
      const columns = batch.children(row);
      const index = columns.findIndex(column => column.id === container.id) + (drop.side === 'right' ? 1 : 0);
      for (const column of columns) if (column.ratio !== 1) batch.set(column.id, { ratio: 1 });
      const column = batch.create(row, index, { kind: 'column', ratio: 1 });
      batch.move(moving, column, 0);
    } else {
      // A row of two columns where the block stood: the block in one, the dropped blocks in the other.
      const row = batch.create(target.parentId, batch.indexOf(target), { kind: 'columns' });
      const first = batch.create(row, 0, { kind: 'column', ratio: 1 });
      const second = batch.create(row, 1, { kind: 'column', ratio: 1 });
      batch.move([target.id], drop.side === 'left' ? second : first, 0);
      batch.move(moving, drop.side === 'left' ? first : second, 0);
    }
  }
  tidyColumns(batch, from);
  write(page, batch, { after: { block: moving[0]!, offset: 'end' } });
  return true;
}

/** Ctrl+Maj+↑ / ↓: blocks one step up or down among their siblings. */
export function nudgeBlocks(page: PageId, ids: readonly string[], direction: -1 | 1, outline: readonly string[] = ids): boolean {
  const { blocks, blocksByParent } = state();
  const moving = inDocumentOrder(outermost(ids), outline);
  const first = blocks[moving[0] ?? ''];
  const last = blocks[moving[moving.length - 1] ?? ''];
  if (!first || !last || first.parentId === null || last.parentId !== first.parentId) return false;
  const others = (blocksByParent[first.parentId] ?? []).filter(id => !moving.includes(id)).flatMap(id => blocks[id] ?? []);
  if (direction === -1) {
    const before = others.filter(block => comparePositions(block, first) < 0);
    if (before.length === 0) return false;
    return moveBlocks(page, moving, { parentId: first.parentId, afterId: before[before.length - 2]?.id ?? null }, outline);
  }
  const next = others.find(block => comparePositions(block, last) > 0);
  return next ? moveBlocks(page, moving, { parentId: first.parentId, afterId: next.id }, outline) : false;
}

/** Tab: under the block before the first of them, at the end of what it holds (when it can hold blocks). */
export function indentBlocks(page: PageId, ids: readonly string[], outline: readonly string[] = ids, caret: Caret | null = null): boolean {
  const moving = inDocumentOrder(outermost(ids), outline);
  const batch = new Batch(Date.now());
  const first = batch.block(moving[0] ?? '');
  if (!first) return false;
  const siblings = batch.children(parentKey(first.parentId));
  const previous = siblings[siblings.findIndex(block => block.id === first.id) - 1];
  if (!previous || moving.includes(previous.id) || !canNest(previous.kind) || previous.kind === 'page') return false;
  batch.move(moving, previous.id, batch.children(previous.id).length);
  write(page, batch, { before: caret, after: caret });
  return true;
}

/** Maj+Tab: out of the item they are nested under, right after it. */
export function outdentBlocks(page: PageId, ids: readonly string[], outline: readonly string[] = ids, caret: Caret | null = null): boolean {
  const moving = inDocumentOrder(outermost(ids), outline);
  const batch = new Batch(Date.now());
  const first = batch.block(moving[0] ?? '');
  const parent = first?.parentId ? batch.block(first.parentId) : undefined;
  if (!first || !parent || parent.kind === 'page' || parent.kind === 'column' || parent.kind === 'columns') return false;
  batch.move(moving, parent.parentId, batch.indexOf(parent) + 1);
  write(page, batch, { before: caret, after: caret });
  return true;
}

/** The kinds a block can be turned into from the block menu or a shortcut. */
export const TURNABLE: ReadonlySet<BlockKind> = new Set(['text', 'h1', 'h2', 'h3', 'h4', 'bullet', 'numbered', 'todo', 'toggle', 'callout', 'code', 'page']);

/** Blocks turned into another kind: text kept (code is plain, a page's title is plain); what it held moves out after it when the new kind holds nothing, and its caption goes when the new kind takes none. */
export function turnInto(page: PageId, ids: readonly string[], kind: BlockKind, options: { readonly language?: string; readonly checked?: boolean; readonly caret?: Caret | null; readonly label?: (target: BlockTarget) => string } = {}, now: number = Date.now()): void {
  const batch = new Batch(now);
  const label = options.label ?? (() => '');
  for (const id of ids) {
    const block = batch.block(id);
    if (!block || block.kind === kind || !TURNABLE.has(block.kind) || block.kind === 'page') continue;
    const patch: Fields = { kind };
    if (kind === 'code') {
      patch.text = markupToPlain(block.text, label, dateWords);
      patch.language = options.language ?? (block.language || 'plain');
    } else if (block.kind === 'code') {
      patch.text = serializeRich(richFromPlain(block.text));
    } else if (kind === 'page') {
      patch.text = markupToPlain(block.text, label, dateWords).replace(/\n/g, ' ').trim();
      patch.trashedAt = null;
    }
    if (kind === 'todo') patch.checked = options.checked ?? false;
    if (block.caption && !CAPTION_KINDS.has(kind)) patch.caption = '';
    batch.set(id, patch);
    if (!canNest(kind)) {
      const held = batch.children(id).map(child => child.id);
      if (held.length > 0) batch.move(held, block.parentId, batch.indexOf(block) + 1);
    }
  }
  write(page, batch, { before: options.caret ?? null, after: options.caret ?? null });
}

// ── tables ─────────────────────────────────────────────────────────────────

const DEFAULT_COLUMNS = (): TableColumn[] => [
  { id: createId(), name: t('Nom'), type: 'text' },
  { id: createId(), name: t('Étiquettes'), type: 'multi', options: [] },
];

/** A table after `afterId` (or in place of an empty block): two columns and three empty rows. */
export function insertTable(page: PageId, at: { readonly afterId: string } | { readonly parentId: string; readonly index: number }, now: number = Date.now()): string | null {
  const batch = new Batch(now);
  const anchor = 'afterId' in at ? batch.block(at.afterId) : undefined;
  if ('afterId' in at && !anchor) return null;
  const parentId = anchor ? anchor.parentId : (at as { parentId: string }).parentId;
  const index = anchor ? batch.indexOf(anchor) + 1 : (at as { index: number }).index;
  const table = batch.create(parentId, index, { kind: 'table', columns: DEFAULT_COLUMNS() });
  for (let row = 0; row < 3; row += 1) batch.create(table, row, { kind: 'row', cells: {} });
  write(page, batch);
  return table;
}

export function addRow(page: PageId, tableId: string, afterRowId: string | null = null, now: number = Date.now()): string {
  const batch = new Batch(now);
  const rows = batch.children(tableId);
  const index = afterRowId === null ? rows.length : rows.findIndex(row => row.id === afterRowId) + 1;
  const id = batch.create(tableId, index, { kind: 'row', cells: {} });
  write(page, batch);
  return id;
}

export function setCell(page: PageId, rowId: string, columnId: string, value: CellValue): void {
  const row = state().blocks[rowId];
  if (!row) return;
  commit(page, [{ type: 'block', id: rowId, patch: { cells: { ...row.cells, [columnId]: value } } }]);
}

function writeColumns(page: PageId, tableId: string, columns: readonly TableColumn[], extra: LocalChange[] = []): void {
  commit(page, [{ type: 'block', id: tableId, patch: { columns: columns.map(column => ({ ...column })) } }, ...extra]);
}

export function addColumn(page: PageId, tableId: string, afterColumnId: string | null = null, type: ColumnType = 'text'): string {
  const table = state().blocks[tableId];
  if (!table) return '';
  const id = createId();
  const names = new Set(table.columns.map(column => column.name));
  let number = table.columns.length + 1;
  while (names.has(t('Colonne {number}', { number }))) number += 1;
  const column: TableColumn = { id, name: t('Colonne {number}', { number }), type, ...(type === 'select' || type === 'multi' ? { options: [] } : {}) };
  const columns = [...table.columns];
  const index = afterColumnId === null ? columns.length : columns.findIndex(entry => entry.id === afterColumnId) + 1;
  columns.splice(index, 0, column);
  writeColumns(page, tableId, columns);
  return id;
}

export function updateColumn(page: PageId, tableId: string, columnId: string, patch: Partial<Omit<TableColumn, 'id' | 'type'>>): void {
  const table = state().blocks[tableId];
  if (!table) return;
  writeColumns(
    page,
    tableId,
    table.columns.map(column => (column.id === columnId ? { ...column, ...patch } : column)),
  );
}

export function moveColumn(page: PageId, tableId: string, columnId: string, toIndex: number): void {
  const table = state().blocks[tableId];
  if (!table) return;
  const columns = table.columns.filter(column => column.id !== columnId);
  const column = table.columns.find(entry => entry.id === columnId);
  if (!column) return;
  columns.splice(Math.max(0, Math.min(toIndex, columns.length)), 0, column);
  writeColumns(page, tableId, columns);
}

/** A column and its cells go; the rows stay. */
export function deleteColumn(page: PageId, tableId: string, columnId: string): void {
  const { blocks, blocksByParent } = state();
  const table = blocks[tableId];
  if (!table) return;
  const rows = (blocksByParent[tableId] ?? []).flatMap(id => (blocks[id] && columnId in blocks[id]!.cells ? [blocks[id]!] : []));
  writeColumns(
    page,
    tableId,
    table.columns.filter(column => column.id !== columnId),
    rows.map(row => {
      const cells = { ...row.cells };
      delete cells[columnId];
      return { type: 'block' as const, id: row.id, patch: { cells } };
    }),
  );
}

/** A column's type changed, its cells converted as Notion does (a select offers the texts it found). */
export function changeColumnType(page: PageId, tableId: string, columnId: string, type: ColumnType): void {
  const { blocks, blocksByParent } = state();
  const table = blocks[tableId];
  const from = table?.columns.find(column => column.id === columnId);
  if (!table || !from || from.type === type) return;
  const rows = (blocksByParent[tableId] ?? []).flatMap(id => (blocks[id] ? [blocks[id]!] : []));
  let to: TableColumn = { id: from.id, name: from.name, type, ...(from.width ? { width: from.width } : {}) };
  if (type === 'number' && from.unit) to = { ...to, unit: from.unit };
  if (type === 'select' || type === 'multi') {
    const names = distinctTexts(rows.map(row => row.cells[columnId]), from);
    to = { ...to, options: optionsFor(names, from.options ?? [], () => createId()) };
  }
  writeColumns(
    page,
    tableId,
    table.columns.map(column => (column.id === columnId ? to : column)),
    rows.map(row => ({ type: 'block' as const, id: row.id, patch: { cells: { ...row.cells, [columnId]: convertCell(row.cells[columnId], from, to) } } })),
  );
}

/** A select's choices changed: those removed are taken off every cell. */
export function setColumnOptions(page: PageId, tableId: string, columnId: string, options: readonly SelectOption[]): void {
  const { blocks, blocksByParent } = state();
  const table = blocks[tableId];
  const column = table?.columns.find(entry => entry.id === columnId);
  if (!table || !column) return;
  const kept = new Set(options.map(option => option.id));
  const rows = (blocksByParent[tableId] ?? []).flatMap(id => (blocks[id] ? [blocks[id]!] : []));
  const cleaned = rows.flatMap(row => {
    const value = row.cells[columnId];
    if (Array.isArray(value) && value.some(id => !kept.has(id))) return [{ type: 'block' as const, id: row.id, patch: { cells: { ...row.cells, [columnId]: value.filter(id => kept.has(id)) } } }];
    if (typeof value === 'string' && column.type === 'select' && value && !kept.has(value)) return [{ type: 'block' as const, id: row.id, patch: { cells: { ...row.cells, [columnId]: emptyCell('select') } } }];
    return [];
  });
  writeColumns(
    page,
    tableId,
    table.columns.map(entry => (entry.id === columnId ? { ...entry, options: options.map(option => ({ ...option })) } : entry)),
    cleaned,
  );
}

// ── files and what blocks point at ─────────────────────────────────────────

export interface BlockFile {
  readonly fileId: string;
  readonly fileName: string;
  readonly mime: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
}

/** A media block's file, just stored in this browser (`app/media/blockFiles`): it uploads with the next sync. */
export function setBlockFile(page: PageId, id: string, file: BlockFile): void {
  commit(page, [{ type: 'block', id, patch: { ...file, uploaded: false, url: null } }]);
}

/** Every block showing this file: the server has it now. */
export function markBlockFileUploaded(fileId: string): void {
  const { blocks } = state();
  const changes = Object.values(blocks)
    .filter(block => block.fileId === fileId && !block.uploaded)
    .map(block => ({ type: 'block' as const, id: block.id, patch: { uploaded: true } }));
  writeLocal(changes);
}

export function setMediaUrl(page: PageId, id: string, url: string, fileName: string): void {
  commit(page, [{ type: 'block', id, patch: { url, fileName, fileId: null, uploaded: false, mime: '', bytes: 0 } }]);
}

/** An empty block made into another one in place (a media block chosen from the slash menu), or a new one after it. */
export function placeBlock(page: PageId, anchorId: string, init: NewBlock, replace: boolean, now: number = Date.now()): string | null {
  const batch = new Batch(now);
  const anchor = batch.block(anchorId);
  if (!anchor) return null;
  const id = batch.create(anchor.parentId, batch.indexOf(anchor) + 1, init);
  if (replace) batch.set(anchorId, { deletedAt: now });
  write(page, batch, { before: { block: anchorId, offset: 0 }, after: { block: id, offset: 0 } });
  return id;
}

/** A bookmark or an embed of a note, a collection, a link or a page. */
export function targetBlock(kind: 'bookmark' | 'embed', target: BlockTarget): NewBlock {
  return { kind, target };
}

/**
 * Blocks showing what they point at another way, each in place (`shownTarget`): a text holding only
 * its mention, a bookmark, or an embed. A bookmark or an embed holds nothing, so what the text held
 * moves out after it; a text takes no caption. An embed's look stays for when it is one again.
 */
export function showTargetAs(page: PageId, ids: readonly string[], display: TargetDisplay, now: number = Date.now()): void {
  const batch = new Batch(now);
  for (const id of ids) {
    const block = batch.block(id);
    const shown = block ? shownTarget(block) : null;
    if (!block || !shown || shown.display === display) continue;
    if (display === 'mention') {
      batch.set(id, { kind: 'text', text: serializeRich([{ kind: 'mention', target: shown.target }]), caption: '', targetType: null, targetId: null });
      continue;
    }
    if (shown.display !== 'mention') {
      batch.set(id, { kind: display });
      continue;
    }
    batch.set(id, { kind: display, text: '', targetType: shown.target.type, targetId: shown.target.id });
    const held = batch.children(id).map(child => child.id);
    if (held.length > 0) batch.move(held, block.parentId, batch.indexOf(block) + 1);
  }
  write(page, batch);
}

/** An embedded collection shown as a list or as a table. */
export function setCollectionView(page: PageId, id: string, view: CollectionView): void {
  commit(page, [{ type: 'block', id, patch: { view } }]);
}

/** An embedded collection showing its links done too, under « Déjà faits », or only those to do. */
export function setShowDone(page: PageId, id: string, showDone: boolean): void {
  commit(page, [{ type: 'block', id, patch: { showDone } }]);
}

/** An embedded collection's table columns, in their new order, each shown or hidden (`notes/services/collectionTable`). */
export function setViewColumns(page: PageId, id: string, columns: readonly ViewColumn[]): void {
  commit(page, [{ type: 'block', id, patch: { viewColumns: columns.map(({ key, shown }) => ({ key, shown })) } }]);
}

/** Two or three empty columns, each with an empty paragraph, after `anchorId` (or in its place when it is empty). */
export function insertColumns(page: PageId, anchorId: string, count: number, replace: boolean, now: number = Date.now()): string | null {
  const batch = new Batch(now);
  const anchor = batch.block(anchorId);
  if (!anchor) return null;
  const row = batch.create(anchor.parentId, batch.indexOf(anchor) + 1, { kind: 'columns' });
  let first: string | null = null;
  for (let index = 0; index < count; index += 1) {
    const column = batch.create(row, index, { kind: 'column', ratio: 1 });
    const paragraph = batch.create(column, 0, { kind: 'text', text: '' });
    first ??= paragraph;
  }
  if (replace) batch.set(anchorId, { deletedAt: now });
  write(page, batch, { after: first ? { block: first, offset: 0 } : null });
  return first;
}

/** A column's share of its row, after its edge was dragged (the neighbour takes or gives the difference). */
export function resizeColumns(page: PageId, ratios: readonly { readonly id: string; readonly ratio: number }[]): void {
  commit(
    page,
    ratios.map(({ id, ratio }) => ({ type: 'block' as const, id, patch: { ratio: Math.round(Math.max(0.05, Math.min(20, ratio)) * 1000) / 1000 } })),
  );
}
