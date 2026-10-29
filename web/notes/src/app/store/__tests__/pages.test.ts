import { beforeEach, describe, expect, it } from 'vitest';

import { ROOT } from '@unlease/notes/services/blocks';
import { blocksFromText } from '@unlease/notes/services/pageText';
import { serializeRich } from '@unlease/core/services/richText';

import { freshLibrary } from '../../../test/library';
import { childPagesOf } from '../../hooks/usePages';
import { getRecord, useLibraryStore } from '../library';
import { redoPage, undoPage } from '../pageHistory';
import {
  addColumn,
  changeColumnType,
  createPage,
  deleteBlocks,
  deleteColumn,
  deletePageForever,
  duplicateBlocks,
  indentBlocks,
  insertBlock,
  insertDrafts,
  insertTable,
  mergeBlocks,
  moveBlocks,
  movePage,
  nudgeBlocks,
  outdentBlocks,
  restorePage,
  saveBlockText,
  setCell,
  showTargetAs,
  splitBlock,
  splitTitle,
  trashPage,
  turnInto,
  updateBlock,
} from '../pages';

const T0 = Date.now() + 3_600_000;
const state = () => useLibraryStore.getState();
const kids = (id: string): string[] => [...(state().blocksByParent[id] ?? [])];
const text = (id: string): string => state().blocks[id]!.text;

describe('pages', () => {
  beforeEach(async () => {
    await freshLibrary({ now: T0 });
  });

  it('nests pages: a sub-page is a block of its parent’s content', () => {
    const voyage = createPage({ title: 'Voyage' }, T0);
    const intro = insertBlock(voyage, voyage, 0, { kind: 'text', text: 'Lisbonne' }, T0 + 1);
    const jour = createPage({ parentId: voyage, title: 'Jour 1' }, T0 + 2);
    expect(kids(ROOT)).toEqual([voyage]);
    expect(kids(voyage)).toEqual([intro, jour]);
    expect(childPagesOf(state(), null)).toEqual([voyage]);
    expect(childPagesOf(state(), voyage)).toEqual([jour]);
  });

  it('sends a page to the bin with what it holds, and brings it back where it was', () => {
    const voyage = createPage({ title: 'Voyage' }, T0);
    const jour = createPage({ parentId: voyage, title: 'Jour 1' }, T0 + 1);
    const undo = trashPage(voyage, T0 + 2);
    expect(childPagesOf(state(), null)).toEqual([]);
    undo();
    expect(childPagesOf(state(), null)).toEqual([voyage]);
    // A sub-page restored after its parent went for good comes back at the top.
    trashPage(jour, T0 + 3);
    deletePageForever([voyage], T0 + 4);
    restorePage(jour, T0 + 5);
    expect(state().blocks[jour]!.parentId).toBeNull();
    expect(childPagesOf(state(), null)).toEqual([jour]);
  });

  it('sends a sub-page to the bin when the block holding it is deleted, so it can come back', () => {
    const voyage = createPage({ title: 'Voyage' }, T0);
    const toggle = insertBlock(voyage, voyage, 0, { kind: 'toggle', text: 'Jours' }, T0 + 1);
    const jour = createPage({ parentId: voyage, title: 'Jour 1' }, T0 + 2);
    moveBlocks(voyage, [jour], { parentId: toggle, afterId: null }, [toggle, jour], T0 + 3);
    deleteBlocks(voyage, [toggle], null, T0 + 4);
    expect(state().blocks[toggle]!.deletedAt).toBe(T0 + 4);
    expect(state().blocks[jour]).toMatchObject({ deletedAt: null, trashedAt: T0 + 4 });
    restorePage(jour, T0 + 5);
    expect(childPagesOf(state(), null)).toEqual([voyage, jour]);
  });

  it('moves a page in the tree, never into itself', () => {
    const a = createPage({ title: 'A' }, T0);
    const b = createPage({ title: 'B' }, T0 + 1);
    const child = createPage({ parentId: a, title: 'A1' }, T0 + 2);
    expect(movePage(a, { into: child }, T0 + 3)).toBe(false);
    expect(movePage(b, { into: a }, T0 + 4)).toBe(true);
    expect(childPagesOf(state(), a)).toEqual([child, b]);
    expect(movePage(b, { beside: a, after: false }, T0 + 5)).toBe(true);
    expect(kids(ROOT)).toEqual([b, a]);
  });
});

describe('writing in a page', () => {
  let page: string;
  beforeEach(async () => {
    await freshLibrary({ now: T0 });
    page = createPage({ title: 'Notes' }, T0);
  });

  it('splits a list item at the caret, and joins it back with Backspace', () => {
    const item = insertBlock(page, page, 0, { kind: 'bullet', text: 'pain et lait' }, T0 + 1);
    const next = splitBlock(page, item, 'pain ', 'et lait', {}, T0 + 2)!;
    expect(kids(page)).toEqual([item, next]);
    expect(state().blocks[next]).toMatchObject({ kind: 'bullet', text: 'et lait' });
    const caret = mergeBlocks(page, item, next, 'et lait', T0 + 3);
    expect(caret).toEqual({ block: item, offset: 5 });
    expect(text(item)).toBe('pain et lait');
    expect(kids(page)).toEqual([item]);
  });

  it('gives way to text after a heading, and puts a new block above when Enter is at the start', () => {
    const heading = insertBlock(page, page, 0, { kind: 'h2', text: 'Titre' }, T0 + 1);
    const after = splitBlock(page, heading, 'Titre', '', {}, T0 + 2)!;
    expect(state().blocks[after]!.kind).toBe('text');
    expect(splitBlock(page, heading, '', 'Titre', {}, T0 + 3)).toBe(heading);
    expect(kids(page)).toHaveLength(3);
    expect(kids(page)[1]).toBe(heading);
  });

  it('goes on from the title in a paragraph at the top: the rest of the title moves there, an empty one already there takes it', () => {
    const first = insertBlock(page, page, 0, { kind: 'text', text: 'Jour 1' }, T0 + 1);
    const top = splitTitle(page, 'No', 'tes *1*', T0 + 2);
    expect(text(page)).toBe('No');
    expect(kids(page)).toEqual([top, first]);
    expect(text(top)).toBe(serializeRich([{ kind: 'text', text: 'tes *1*', marks: {} }]));
    expect(undoPage(page)).toEqual({ block: page, offset: 2 });
    expect(text(page)).toBe('Notes');
    expect(kids(page)).toEqual([first]);
    const empty = insertBlock(page, page, 0, { kind: 'text', text: '' }, T0 + 3);
    expect(splitTitle(page, 'Notes', '', T0 + 4)).toBe(empty);
    expect(splitTitle(page, 'No', 'tes', T0 + 5)).toBe(empty);
    expect(kids(page)).toEqual([empty, first]);
    expect(text(empty)).toBe('tes');
  });

  it('nests with Tab and comes back out with Maj+Tab', () => {
    const first = insertBlock(page, page, 0, { kind: 'bullet', text: 'un' }, T0 + 1);
    const second = insertBlock(page, page, 1, { kind: 'bullet', text: 'deux' }, T0 + 2);
    expect(indentBlocks(page, [second])).toBe(true);
    expect(kids(first)).toEqual([second]);
    expect(indentBlocks(page, [first])).toBe(false);
    expect(outdentBlocks(page, [second])).toBe(true);
    expect(kids(page)).toEqual([first, second]);
  });

  it('turns blocks into another kind, keeping the text (plain in code)', () => {
    const block = insertBlock(page, page, 0, { kind: 'text', text: '{b:const} x = 1' }, T0 + 1);
    turnInto(page, [block], 'code', { language: 'typescript' }, T0 + 2);
    expect(state().blocks[block]).toMatchObject({ kind: 'code', text: 'const x = 1', language: 'typescript' });
    turnInto(page, [block], 'todo', {}, T0 + 3);
    expect(state().blocks[block]).toMatchObject({ kind: 'todo', text: 'const x = 1', checked: false });
  });

  it('makes columns when a block is dropped beside another, and undoes them when one is left', () => {
    const a = insertBlock(page, page, 0, { kind: 'text', text: 'A' }, T0 + 1);
    const b = insertBlock(page, page, 1, { kind: 'text', text: 'B' }, T0 + 2);
    expect(moveBlocks(page, [b], { beside: a, side: 'right' }, [a, b], T0 + 3)).toBe(true);
    const [row] = kids(page);
    expect(state().blocks[row!]!.kind).toBe('columns');
    const [left, right] = kids(row!);
    expect(kids(left!)).toEqual([a]);
    expect(kids(right!)).toEqual([b]);
    // A third column beside a block in a column.
    const c = insertBlock(page, page, 1, { kind: 'text', text: 'C' }, T0 + 4);
    moveBlocks(page, [c], { beside: b, side: 'right' }, [a, b, c], T0 + 5);
    expect(kids(row!)).toHaveLength(3);
    // Emptied, columns go; one left hands its blocks back where the row stood.
    deleteBlocks(page, [b, c], null, T0 + 6);
    expect(kids(page)).toEqual([a]);
    expect(getRecord('block', row!)!.fields.deletedAt).toBe(T0 + 6);
  });

  it('moves blocks into another container and nudges them up and down', () => {
    const toggle = insertBlock(page, page, 0, { kind: 'toggle', text: 'Plus' }, T0 + 1);
    const a = insertBlock(page, page, 1, { kind: 'text', text: 'A' }, T0 + 2);
    const b = insertBlock(page, page, 2, { kind: 'text', text: 'B' }, T0 + 3);
    expect(moveBlocks(page, [a], { parentId: toggle, afterId: null }, [toggle, a, b], T0 + 4)).toBe(true);
    expect(kids(toggle)).toEqual([a]);
    expect(moveBlocks(page, [toggle], { parentId: a, afterId: null }, [toggle, a, b], T0 + 5)).toBe(false);
    expect(nudgeBlocks(page, [b], -1, [toggle, b])).toBe(true);
    expect(kids(page)).toEqual([b, toggle]);
    expect(nudgeBlocks(page, [b], -1, [b, toggle])).toBe(false);
  });

  it('duplicates blocks with what they hold, right after them', () => {
    const toggle = insertBlock(page, page, 0, { kind: 'toggle', text: 'Plus' }, T0 + 1);
    insertBlock(page, toggle, 0, { kind: 'text', text: 'dedans' }, T0 + 2);
    const [copy] = duplicateBlocks(page, [toggle], [toggle], T0 + 3);
    expect(kids(page)).toEqual([toggle, copy]);
    expect(kids(copy!).map(text)).toEqual(['dedans']);
  });

  it('pastes Markdown as blocks, nested lists and code included', () => {
    const anchor = insertBlock(page, page, 0, { kind: 'text', text: '' }, T0 + 1);
    const drafts = blocksFromText('# Courses\n- pain\n  - complet\n- [x] lait\n```ts\nconst a = 1;\n```\nUn **mot**');
    const ids = insertDrafts(page, drafts, { afterId: anchor }, T0 + 2);
    expect(ids.map(id => state().blocks[id]!.kind)).toEqual(['h1', 'bullet', 'todo', 'code', 'text']);
    expect(kids(ids[1]!).map(text)).toEqual(['complet']);
    expect(state().blocks[ids[2]!]!.checked).toBe(true);
    expect(state().blocks[ids[3]!]).toMatchObject({ text: 'const a = 1;', language: 'typescript' });
    expect(text(ids[4]!)).toBe(serializeRich([{ kind: 'text', text: 'Un ', marks: {} }, { kind: 'text', text: 'mot', marks: { b: true } }]));
  });

  it('captions a block: typed as a step of its own, and dropped when the block turns into text', () => {
    const code = insertBlock(page, page, 0, { kind: 'code', text: 'ls', language: 'bash' }, T0 + 1);
    saveBlockText(page, code, 'ls', 'ls -la', { after: { block: code, offset: 6 } });
    saveBlockText(page, code, '', 'Lister', { after: { block: `${code} caption`, offset: 6 } }, 'caption');
    expect(state().blocks[code]).toMatchObject({ text: 'ls -la', caption: 'Lister' });
    expect(undoPage(page)).toBeNull();
    expect(state().blocks[code]).toMatchObject({ text: 'ls -la', caption: '' });
    expect(redoPage(page)).toEqual({ block: `${code} caption`, offset: 6 });
    turnInto(page, [code], 'text', {}, T0 + 2);
    expect(state().blocks[code]).toMatchObject({ kind: 'text', caption: '' });
    undoPage(page);
    expect(state().blocks[code]).toMatchObject({ kind: 'code', caption: 'Lister' });
  });

  it('shows a mention alone in its text as a bookmark or an embed, and back, in place', () => {
    const mention = serializeRich([{ kind: 'mention', target: { type: 'note', id: 'n1' } }]);
    const block = insertBlock(page, page, 0, { kind: 'text', text: `${mention} ` }, T0 + 1);
    const held = insertBlock(page, block, 0, { kind: 'text', text: 'dessous' }, T0 + 2);
    showTargetAs(page, [block], 'bookmark', T0 + 3);
    expect(state().blocks[block]).toMatchObject({ kind: 'bookmark', text: '', target: { type: 'note', id: 'n1' } });
    // A bookmark holds nothing: what the text held comes out after it.
    expect(kids(page)).toEqual([block, held]);
    updateBlock(page, block, { caption: 'Pour le voyage', view: 'table' });
    showTargetAs(page, [block], 'embed', T0 + 4);
    expect(state().blocks[block]).toMatchObject({ kind: 'embed', caption: 'Pour le voyage', view: 'table', target: { type: 'note', id: 'n1' } });
    showTargetAs(page, [block], 'mention', T0 + 5);
    expect(state().blocks[block]).toMatchObject({ kind: 'text', text: mention, caption: '', target: null });
    undoPage(page);
    expect(state().blocks[block]).toMatchObject({ kind: 'embed', caption: 'Pour le voyage' });
  });

  it('leaves a text with more than its mention as it is', () => {
    const mention = serializeRich([{ kind: 'mention', target: { type: 'note', id: 'n1' } }, { kind: 'text', text: ' à relire', marks: {} }]);
    const block = insertBlock(page, page, 0, { kind: 'text', text: mention }, T0 + 1);
    showTargetAs(page, [block], 'bookmark', T0 + 2);
    expect(state().blocks[block]).toMatchObject({ kind: 'text', text: mention });
  });

  it('undoes and redoes a page’s gestures, typing in a burst as one step', () => {
    const block = insertBlock(page, page, 0, { kind: 'text', text: '' }, T0 + 1);
    saveBlockText(page, block, '', 'Bon', { after: { block, offset: 3 } });
    saveBlockText(page, block, 'Bon', 'Bonjour', { after: { block, offset: 7 } });
    const next = splitBlock(page, block, 'Bonjour', '', { caret: { block, offset: 7 } })!;
    expect(undoPage(page)).toEqual({ block, offset: 7 });
    expect(state().blocks[next]!.deletedAt).not.toBeNull();
    expect(undoPage(page)).toBeNull();
    expect(text(block)).toBe('');
    expect(redoPage(page)).toEqual({ block, offset: 7 });
    expect(text(block)).toBe('Bonjour');
  });
});

describe('tables', () => {
  let page: string;
  let table: string;
  beforeEach(async () => {
    await freshLibrary({ now: T0 });
    page = createPage({ title: 'Budget' }, T0);
    const anchor = insertBlock(page, page, 0, { kind: 'text', text: '' }, T0 + 1);
    table = insertTable(page, { afterId: anchor }, T0 + 2)!;
  });

  it('starts with two columns and three rows', () => {
    expect(state().blocks[table]!.columns.map(column => column.type)).toEqual(['text', 'multi']);
    expect(kids(table)).toHaveLength(3);
  });

  it('converts a column’s cells when its type changes, and drops a deleted column’s cells', () => {
    const [first, second] = kids(table);
    const column = addColumn(page, table, null, 'text');
    setCell(page, first!, column, 'Rome');
    setCell(page, second!, column, 'Porto, Rome');
    changeColumnType(page, table, column, 'multi');
    const options = state().blocks[table]!.columns.find(entry => entry.id === column)!.options!;
    expect(options.map(option => option.name)).toEqual(['Rome', 'Porto']);
    expect(state().blocks[second!]!.cells[column]).toEqual([options[1]!.id, options[0]!.id]);
    deleteColumn(page, table, column);
    expect(column in state().blocks[first!]!.cells).toBe(false);
  });
});
