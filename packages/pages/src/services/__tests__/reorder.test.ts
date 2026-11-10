/** Reordering a page's blocks in an outline (the phone's « Réorganiser »): the rows, and where a row let go lands. */
import type { Block, BlockKind } from '../../models/blocks';
import { blockFields, blockFromRecord } from '../../sync/entities';
import { ROOT, type ChildIndex } from '../blocks';
import { carriedRows, outlineDrop, pageOutline, rowsLeft, type OutlineRow } from '../reorder';

function block(id: string, kind: BlockKind, parentId: string | null, extra: Partial<Block> = {}): Block {
  return blockFromRecord({ type: 'block', id, fields: blockFields({ parentId, position: 'a0', kind, createdAt: 0, ...extra }), clocks: {} });
}

/**
 * A page: a heading; a list (a, under it a1 and a2, under a2 a paragraph); a toggle holding t1; two
 * columns (a paragraph, a picture); a sub-page (its own content), one in the bin; a table (its row);
 * a last paragraph.
 */
function page() {
  const list = [
    block('P', 'page', null),
    block('title', 'h1', 'P'),
    block('a', 'bullet', 'P'),
    block('a1', 'bullet', 'a'),
    block('a2', 'bullet', 'a'),
    block('a2x', 'text', 'a2'),
    block('t', 'toggle', 'P'),
    block('t1', 'text', 't'),
    block('cols', 'columns', 'P'),
    block('c1', 'column', 'cols'),
    block('c1x', 'text', 'c1'),
    block('c2', 'column', 'cols'),
    block('c2x', 'image', 'c2'),
    block('sub', 'page', 'P'),
    block('subx', 'text', 'sub'),
    block('binned', 'page', 'P', { trashedAt: 5 }),
    block('gone', 'text', 'P', { deletedAt: 5 }),
    block('tbl', 'table', 'P'),
    block('r1', 'row', 'tbl'),
    block('end', 'text', 'P'),
  ];
  const blocks = Object.fromEntries(list.map(entry => [entry.id, entry]));
  const children: Record<string, string[]> = {};
  for (const entry of list) (children[entry.parentId ?? ROOT] ??= []).push(entry.id);
  return { blocks, children: children as ChildIndex };
}

const outline = () => {
  const { blocks, children } = page();
  return pageOutline(blocks, children, 'P');
};

/** The gap before `id` among the rows `moving` leaves (their count: after them all). */
const gapBefore = (moving: string, id: string | null): number => {
  const left = rowsLeft(outline(), moving);
  return id === null ? left.length : left.findIndex(row => row.id === id);
};

describe('a page as an outline', () => {
  it('lists every block in reading order, as deep as it nests, a sub-page’s content and a table’s rows left out', () => {
    expect(outline().map(row => `${'  '.repeat(row.depth)}${row.id}`)).toEqual(['title', 'a', '  a1', '  a2', '    a2x', 't', '  t1', 'cols', '  c1', '    c1x', '  c2', '    c2x', 'sub', 'tbl', 'end']);
  });

  it('knows what can be picked up and what can take blocks under it', () => {
    const rows = new Map(outline().map(row => [row.id, row]));
    expect(rows.get('c1')).toMatchObject({ movable: false, holds: true, parentId: 'cols' });
    expect(rows.get('cols')).toMatchObject({ movable: true, holds: false });
    expect(rows.get('sub')).toMatchObject({ movable: true, holds: false });
    expect(rows.get('title')).toMatchObject({ holds: false });
    expect(rows.get('a2')).toMatchObject({ holds: true, parentId: 'a' });
  });

  it('takes a block with what it holds', () => {
    expect(carriedRows(outline(), 'a')).toBe(3);
    expect(carriedRows(outline(), 'end')).toBe(0);
    expect(rowsLeft(outline(), 'a').map(row => row.id).slice(0, 3)).toEqual(['title', 't', 't1']);
  });
});

describe('where a row let go lands', () => {
  it('stays where it is let go over its own place', () => {
    const rows = outline();
    expect(outlineDrop(rows, 'P', 'end', gapBefore('end', null), 0)).toEqual({ parentId: 'P', afterId: 'tbl', depth: 0, moves: false });
    expect(outlineDrop(rows, 'P', 'a2', gapBefore('a2', 't'), 1)).toEqual({ parentId: 'a', afterId: 'a1', depth: 1, moves: false });
    expect(outlineDrop(rows, 'P', 'title', 0, 0)).toEqual({ parentId: 'P', afterId: null, depth: 0, moves: false });
  });

  it('moves up or down at its depth', () => {
    const rows = outline();
    expect(outlineDrop(rows, 'P', 'end', 0, 0)).toEqual({ parentId: 'P', afterId: null, depth: 0, moves: true });
    expect(outlineDrop(rows, 'P', 'title', gapBefore('title', 'end'), 0)).toEqual({ parentId: 'P', afterId: 'tbl', depth: 0, moves: true });
  });

  it('goes as deep as the hand asks, within what the neighbours allow', () => {
    const rows = outline();
    // After a2's paragraph (depth 2): out to the list's level, a2's, or under the paragraph.
    const gap = gapBefore('end', 't');
    expect(outlineDrop(rows, 'P', 'end', gap, 0)).toMatchObject({ parentId: 'P', afterId: 'a' });
    expect(outlineDrop(rows, 'P', 'end', gap, 1)).toMatchObject({ parentId: 'a', afterId: 'a2' });
    expect(outlineDrop(rows, 'P', 'end', gap, 2)).toMatchObject({ parentId: 'a2', afterId: 'a2x' });
    expect(outlineDrop(rows, 'P', 'end', gap, 3)).toMatchObject({ parentId: 'a2x', afterId: null, depth: 3 });
    // Asked deeper still, as deep as it can go; asked shallower than the top, the top.
    expect(outlineDrop(rows, 'P', 'end', gap, 9)).toMatchObject({ depth: 3 });
    expect(outlineDrop(rows, 'P', 'end', gap, -4)).toMatchObject({ depth: 0 });
  });

  it('goes first under the row above when the row below is its first', () => {
    const rows = outline();
    expect(outlineDrop(rows, 'P', 'end', gapBefore('end', 'a1'), 0)).toEqual({ parentId: 'a', afterId: null, depth: 1, moves: true });
    expect(outlineDrop(rows, 'P', 'end', gapBefore('end', 't1'), 0)).toEqual({ parentId: 't', afterId: null, depth: 1, moves: true });
  });

  it('nests a block under the one above it by a move to the right', () => {
    const rows = outline();
    // a2 under a1: one step right of where it stands.
    expect(outlineDrop(rows, 'P', 'a2', gapBefore('a2', 't'), 2)).toEqual({ parentId: 'a1', afterId: null, depth: 2, moves: true });
    // Out of the list, after it, one step left.
    expect(outlineDrop(rows, 'P', 'a2', gapBefore('a2', 't'), 0)).toEqual({ parentId: 'P', afterId: 'a', depth: 0, moves: true });
  });

  it('never goes under a heading, a sub-page or a table', () => {
    const rows = outline();
    expect(outlineDrop(rows, 'P', 'end', gapBefore('end', 'a'), 5)).toMatchObject({ parentId: 'P', afterId: 'title', depth: 0 });
    expect(outlineDrop(rows, 'P', 'end', gapBefore('end', 'tbl'), 5)).toMatchObject({ parentId: 'P', afterId: 'sub', depth: 0 });
    expect(outlineDrop(rows, 'P', 'title', gapBefore('title', 'end'), 5)).toMatchObject({ parentId: 'P', afterId: 'tbl', depth: 0 });
  });

  it('keeps a row of columns for its columns, and columns out of a column', () => {
    const rows = outline();
    // Between the row of columns and its first column: nowhere.
    expect(outlineDrop(rows, 'P', 'end', gapBefore('end', 'c1'), 1)).toBeNull();
    // At the end of the first column, never between the two columns.
    expect(outlineDrop(rows, 'P', 'end', gapBefore('end', 'c2'), 1)).toMatchObject({ parentId: 'c1', afterId: 'c1x', depth: 2 });
    // First in the second column.
    expect(outlineDrop(rows, 'P', 'end', gapBefore('end', 'c2x'), 0)).toEqual({ parentId: 'c2', afterId: null, depth: 2, moves: true });
    // A row of columns moves whole, its columns and their blocks with it.
    expect(carriedRows(rows, 'cols')).toBe(4);
    expect(outlineDrop(rows, 'P', 'cols', gapBefore('cols', 't'), 2)).toEqual({ parentId: 'a2', afterId: 'a2x', depth: 2, moves: true });
  });

  it('never puts a row of columns inside a column', () => {
    const row = (id: string, kind: BlockKind, depth: number, parentId: string): OutlineRow => ({ id, kind, depth, parentId, movable: kind !== 'column', holds: kind !== 'columns' });
    const rows = [row('x', 'text', 0, 'Q'), row('k', 'columns', 0, 'Q'), row('k1', 'column', 1, 'k'), row('k1x', 'text', 2, 'k1'), row('m', 'columns', 0, 'Q'), row('m1', 'column', 1, 'm'), row('m1x', 'text', 2, 'm1')];
    // After the first row's paragraph, however far right: after that row, not in its column nor under its paragraph.
    expect(outlineDrop(rows, 'Q', 'm', 4, 3)).toEqual({ parentId: 'Q', afterId: 'k', depth: 0, moves: false });
    expect(outlineDrop(rows, 'Q', 'm', 1, 1)).toEqual({ parentId: 'x', afterId: null, depth: 1, moves: true });
  });

  it('never picks up a column, nor a block that is not on the page', () => {
    const rows = outline();
    expect(outlineDrop(rows, 'P', 'c1', 0, 0)).toBeNull();
    expect(outlineDrop(rows, 'P', 'subx', 0, 0)).toBeNull();
  });
});
