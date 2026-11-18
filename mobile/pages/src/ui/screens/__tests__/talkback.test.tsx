/**
 * Pages' phone screens beyond typing in a page: a search marks what matched and opens the page at
 * the block that did, as the web's; what a hold opens is a named action for TalkBack (a block's
 * actions, a table row's, the table's), even on a block with nothing to press (a bookmark whose
 * note is gone); a month to pick a day from reads each day in full, today said so, the weekdays'
 * initials left to the eye.
 */
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { APP_WORDS } from '@unlease/core/appWords';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { bootstrap, resetBootstrap } from '@app/bootstrap';
import { resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { changeColumnType, createPage, insertBlock, insertTable, targetBlock } from '@app/store/pages';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';
import { usePageSheets } from '@ui/features/pages/sheetStore';
import { closeTableSheet, openTableSheet, useTableSheets } from '@ui/features/pages/TableSheetStore';

jest.useFakeTimers();

let mounted: ReactTestRenderer | null = null;

async function settle(ms = 400): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function boot(prepare: () => void): Promise<ReactTestRenderer> {
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'talkback.sqlite' });
  writePreference('onboarded', true);
  bootstrap();
  prepare();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await settle();
  mounted = tree;
  return tree;
}

const open = async (id: string): Promise<void> => {
  await act(async () => {
    (navigationRef.navigate as (...args: unknown[]) => void)('Page', { id });
  });
  await settle();
};

/** What carries a named action for TalkBack, by its label. */
const withAction = (tree: ReactTestRenderer, label: string): ReactTestInstance[] =>
  tree.root.findAll(node => Array.isArray(node.props.accessibilityActions) && (node.props.accessibilityActions as { label?: string }[]).some(action => action.label === label) && typeof node.props.onAccessibilityAction === 'function', { deep: false });

const run = async (node: ReactTestInstance, actionName: string): Promise<void> => {
  await act(async () => {
    node.props.onAccessibilityAction({ nativeEvent: { actionName } });
  });
  await settle();
};

describe('Pages beyond the page’s words, on the phone', () => {
  afterAll(async () => {
    const last = mounted;
    if (last) await act(async () => last.unmount());
  });

  it('marks what a search matched and opens the page at the block that did', async () => {
    let page = '';
    let block = '';
    const tree = await boot(() => {
      page = createPage({ title: 'Voyage à Lisbonne' });
      insertBlock(page, page, 0, { kind: 'text', text: 'Réserver le tram' });
      block = insertBlock(page, page, 1, { kind: 'text', text: 'Les pastéis de Belém' });
    });
    const field = tree.root.findAll(node => typeof node.props.onChangeText === 'function' && node.props.placeholder === APP_WORDS.pages.search, { deep: false })[0]!;
    await act(async () => field.props.onChangeText('pasteis'));
    await settle();
    // The snippet's match is marked (accents folded), and TalkBack hears the row whole.
    const marked = tree.root.findAll(node => Array.isArray(node.props.highlight) && node.props.highlight.length > 0 && typeof node.props.children === 'string' && node.props.children.includes('pastéis'), { deep: false });
    expect(marked.length).toBeGreaterThan(0);
    const row = tree.root.findAll(node => node.props.accessibilityRole === 'link' && typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Voyage à Lisbonne, ') && typeof node.props.onPress === 'function', { deep: false })[0]!;
    expect(row.props.accessibilityLabel).toContain('pastéis de Belém');
    await act(async () => row.props.onPress());
    expect(navigationRef.getCurrentRoute()).toMatchObject({ name: 'Page', params: { id: page, block } });
  });

  it('gives TalkBack a block’s actions, even a bookmark whose note is gone', async () => {
    let page = '';
    let bookmark = '';
    const tree = await boot(() => {
      page = createPage({ title: 'Semaine' });
      bookmark = insertBlock(page, page, 0, targetBlock('bookmark', { type: 'note', id: '0190f0f0-0000-7000-8000-00000000dead' }));
    });
    await open(page);
    const gone = withAction(tree, 'Actions du bloc');
    expect(gone).toHaveLength(1);
    // Its words are the one stop that carries it.
    expect(gone[0]!.props.accessible).toBe(true);
    await run(gone[0]!, 'blockActions');
    expect(usePageSheets.getState()).toMatchObject({ open: true, sheet: { kind: 'block', block: bookmark } });
  });

  it('gives TalkBack a table row’s actions and the table’s, as a hold does', async () => {
    let page = '';
    let table = '';
    const tree = await boot(() => {
      page = createPage({ title: 'Courses' });
      const first = insertBlock(page, page, 0, { kind: 'text', text: 'Liste' });
      table = insertTable(page, { afterId: first })!;
    });
    await open(page);
    const rows = useLibraryStore.getState().blocksByParent[table]!;
    const cells = withAction(tree, 'Actions de la ligne');
    expect(cells.length).toBeGreaterThan(0);
    await run(cells[0]!, 'rowActions');
    expect(useTableSheets.getState().request).toMatchObject({ kind: 'row', table, row: rows[0] });
    await act(async () => closeTableSheet());
    await settle();
    // The head and « Nouvelle ligne » carry the table's own (the block's actions).
    const heads = withAction(tree, 'Actions du bloc');
    expect(heads.length).toBeGreaterThanOrEqual(3);
    await run(heads[0]!, 'tableActions');
    expect(usePageSheets.getState()).toMatchObject({ open: true, sheet: { kind: 'block', block: table } });
  });

  it('reads a month’s days in full, today said so, the weekdays’ initials left to the eye', async () => {
    let page = '';
    let table = '';
    const tree = await boot(() => {
      page = createPage({ title: 'Échéances' });
      const first = insertBlock(page, page, 0, { kind: 'text', text: 'Dates' });
      table = insertTable(page, { afterId: first })!;
    });
    await open(page);
    const { blocks, blocksByParent } = useLibraryStore.getState();
    const column = blocks[table]!.columns[0]!.id;
    await act(async () => {
      changeColumnType(page, table, column, 'date');
      openTableSheet({ kind: 'cell', page, table, row: blocksByParent[table]![0]!, column });
    });
    await settle();
    const today = tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.endsWith(', aujourd’hui') && typeof node.props.onPress === 'function', { deep: false });
    expect(today).toHaveLength(1);
    const hidden = tree.root.findAll(node => node.props.importantForAccessibility === 'no-hide-descendants' && node.props.accessibilityElementsHidden === true && typeof node.type !== 'string', { deep: false });
    expect(hidden.length).toBeGreaterThan(0);
  });
});
