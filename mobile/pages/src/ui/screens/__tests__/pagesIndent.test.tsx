/**
 * A block nested from the bar (« Imbriquer le bloc ») under a closed toggle: the toggle opens, so the
 * block and its words stay on screen with the caret, and « Annuler » puts it back where it was.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { createPage, insertBlock } from '@app/store/pages';
import { usePagesUiStore } from '@app/store/pagesUi';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';
import { setFocused } from '@ui/features/pages/editorStore';

jest.useFakeTimers();
jest.setSystemTime(new Date(2026, 10, 11, 10, 0));

// The preset's TextInput mock has no caret.
Object.assign((TextInput as unknown as { prototype: object }).prototype, { setSelection: jest.fn() });

function textOf(tree: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) walk((node as { children: unknown }).children);
  };
  walk(tree.toJSON());
  return parts.join(' ');
}

const pressable = (tree: ReactTestRenderer, label: string): ReactTestInstance[] => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function', { deep: false });
const parentOf = (id: string): string | null => useLibraryStore.getState().blocks[id]?.parentId ?? null;

let tree: ReactTestRenderer | null = null;
const ids = { page: '', toggle: '', callout: '' };

async function boot(): Promise<ReactTestRenderer> {
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'pagesIndent.sqlite' });
  writePreference('onboarded', true);
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await act(async () => {
    const page = createPage({ title: 'Notes de réunion' });
    ids.page = page;
    ids.toggle = insertBlock(page, page, 0, { kind: 'toggle', text: 'Détails' });
    ids.callout = insertBlock(page, page, 1, { kind: 'callout', text: 'À retenir absolument' });
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  await act(async () => {
    (navigationRef.navigate as (...args: unknown[]) => void)('Page', { id: ids.page });
    jest.advanceTimersByTime(400);
  });
  return tree!;
}

describe('nesting a block under a closed toggle', () => {
  beforeAll(async () => {
    await boot();
  });

  afterAll(async () => {
    const last = tree;
    if (last) await act(async () => last.unmount());
    tree = null;
    closeDatabase();
  });

  it('opens the toggle, keeps the block and its words on screen, and undoes whole', async () => {
    const root = tree!;
    expect(usePagesUiStore.getState().openToggles.has(ids.toggle)).toBe(false);
    expect(textOf(root)).toContain('À retenir absolument');
    await act(async () => {
      setFocused(ids.callout, { start: 4, end: 4 });
    });
    await act(async () => {
      pressable(root, 'Imbriquer le bloc')[0]!.props.onPress();
      jest.advanceTimersByTime(50);
    });
    expect(parentOf(ids.callout)).toBe(ids.toggle);
    expect(usePagesUiStore.getState().openToggles.has(ids.toggle)).toBe(true);
    expect(textOf(root)).toContain('À retenir absolument');

    await act(async () => {
      pressable(root, 'Annuler')[0]!.props.onPress();
      jest.advanceTimersByTime(50);
    });
    expect(parentOf(ids.callout)).toBe(ids.page);
    expect(useLibraryStore.getState().blocks[ids.callout]?.text).toBe('À retenir absolument');
    expect(textOf(root)).toContain('À retenir absolument');
  });
});
