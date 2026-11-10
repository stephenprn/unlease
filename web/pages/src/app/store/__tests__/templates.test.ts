import { beforeEach, describe, expect, it } from 'vitest';

import { pageTemplate } from '@unlease/pages/services/templates';
import { tableDraft } from '@unlease/pages/services/pageText';

import { freshLibrary } from '@test/library';
import { useBlocksStore } from '../blocks';
import { redoPage, undoPage } from '../pageHistory';
import { createPage, fillPage, insertBlock, insertDrafts } from '../pages';

const T0 = Date.now() + 3_600_000;
const DAY = '2026-11-09';
const state = () => useBlocksStore.getState();
const kids = (id: string): string[] => [...(state().blocksByParent[id] ?? [])];

describe('a page filled from a template', () => {
  beforeEach(async () => {
    await freshLibrary({ now: T0 });
  });

  it('takes the template’s blocks in place of its empty paragraphs, its table with its rows, its icon: one step of its undo', () => {
    const page = createPage({ title: 'Lisbonne' }, T0);
    const blank = insertBlock(page, page, 0, { kind: 'text', text: '' }, T0 + 1);
    const { ids, caret } = fillPage(page, pageTemplate('trip', DAY, 'fr'), T0 + 2);
    expect(kids(page)).toEqual(ids);
    expect(state().blocks[blank]?.deletedAt ?? T0).not.toBeNull();
    expect(ids.map(id => state().blocks[id]!.kind)).toEqual(['text', 'text', 'h2', 'table', 'h2', 'todo', 'todo', 'todo', 'todo', 'h2', 'bullet']);
    const table = ids[3]!;
    expect(state().blocks[table]!.columns.map(column => column.type)).toEqual(['date', 'text', 'text', 'checkbox']);
    expect(kids(table).map(id => state().blocks[id]!.kind)).toEqual(['row', 'row', 'row']);
    expect(state().blocks[page]).toMatchObject({ text: 'Lisbonne', icon: '🧳' });
    // Named already: the caret goes where the template asks to write (« Retour : »).
    expect(caret).toEqual({ block: ids[1], offset: 'end' });

    expect(undoPage(page, T0 + 3)).toEqual({ block: page, offset: 'end' });
    expect(kids(page)).toEqual([blank]);
    expect(state().blocks[page]!.icon).toBeNull();
    redoPage(page, T0 + 4);
    expect(kids(page)).toEqual(ids);
  });

  it('names a page only when it has no name, and sends the caret to the title while it has none', () => {
    const named = createPage({ title: 'Mon journal', icon: '🌿' }, T0);
    fillPage(named, pageTemplate('journal', DAY, 'fr'), T0 + 1);
    expect(state().blocks[named]).toMatchObject({ text: 'Mon journal', icon: '🌿' });

    const daily = createPage({}, T0 + 2);
    const journal = fillPage(daily, pageTemplate('journal', DAY, 'en'), T0 + 3);
    expect(state().blocks[daily]!.text).toBe('Monday 9 November 2026');
    expect(journal.ids.map(id => state().blocks[id]!.text)).toEqual(['Daily note · {@date=2026-11-09}', '']);
    expect(journal.caret).toEqual({ block: journal.ids[1], offset: 'end' });

    const meeting = createPage({}, T0 + 4);
    expect(fillPage(meeting, pageTemplate('meeting', DAY, 'fr'), T0 + 5).caret).toEqual({ block: meeting, offset: 'end' });
  });

  it('pastes a table with its rows inside it', () => {
    const page = createPage({ title: 'Budget' }, T0);
    const anchor = insertBlock(page, page, 0, { kind: 'text', text: '' }, T0 + 1);
    const [table] = insertDrafts(page, [tableDraft([['Poste', 'Montant'], ['Vols', '186']])!], { afterId: anchor }, T0 + 2);
    expect(kids(page)).toEqual([anchor, table]);
    expect(kids(table!)).toHaveLength(1);
  });
});
