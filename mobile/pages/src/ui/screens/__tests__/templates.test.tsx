/**
 * A new page on the phone: the templates it offers while it holds nothing, one filling it in one step
 * of its undo; and « Déplacer vers » listing the pages changed last first.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { createPage } from '@app/store/pages';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';
import { openPageSheet } from '@ui/features/pages/sheetStore';

jest.useFakeTimers();
jest.setSystemTime(new Date(2026, 10, 9, 10, 0));

// The preset's TextInput mock has no caret.
Object.assign((TextInput as unknown as { prototype: object }).prototype, { setSelection: jest.fn() });

function outermost(tree: ReactTestRenderer, match: (props: Record<string, unknown>) => boolean): ReactTestInstance[] {
  return tree.root.findAll(node => match(node.props as Record<string, unknown>), { deep: false });
}

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

const pressable = (tree: ReactTestRenderer, label: string) => outermost(tree, props => props.accessibilityLabel === label && typeof props.onPress === 'function');
const kinds = (page: string): string[] => (useLibraryStore.getState().blocksByParent[page] ?? []).map(id => useLibraryStore.getState().blocks[id]!.kind);

let tree: ReactTestRenderer | null = null;
const ids = { blank: '', shelf: [] as string[] };

async function boot(): Promise<ReactTestRenderer> {
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'pagesTemplates.sqlite' });
  writePreference('onboarded', true);
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await act(async () => {
    ids.shelf = Array.from({ length: 9 }, (_, index) => createPage({ title: `Page ${index + 1}` }, Date.now() + index));
    ids.blank = createPage({});
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  await act(async () => {
    (navigationRef.navigate as (...args: unknown[]) => void)('Page', { id: ids.blank });
    jest.advanceTimersByTime(400);
  });
  return tree!;
}

describe('a new page on the phone', () => {
  beforeAll(async () => {
    await boot();
  });

  afterAll(async () => {
    const last = tree;
    if (last) await act(async () => last.unmount());
  });

  it('offers its templates under the title while it holds nothing', () => {
    const root = tree!;
    expect(textOf(root)).toContain('Partir d’un modèle');
    for (const name of ['Journal du jour', 'Réunion', 'Voyage', 'Liste de lecture', 'Projet']) expect(pressable(root, name)).toHaveLength(1);
  });

  it('fills itself from « Journal du jour » as Agenda’s « Note du jour » does, one step of its undo', async () => {
    const root = tree!;
    await act(async () => {
      pressable(root, 'Journal du jour')[0]!.props.onPress();
      jest.advanceTimersByTime(50);
    });
    const page = useLibraryStore.getState().blocks[ids.blank]!;
    expect(page.text).toBe('Lundi 9 novembre 2026');
    expect(kinds(ids.blank)).toEqual(['text', 'text']);
    expect(useLibraryStore.getState().blocks[useLibraryStore.getState().blocksByParent[ids.blank]![0]!]!.text).toBe('Note du jour · {@date=2026-11-09}');
    expect(textOf(root)).not.toContain('Partir d’un modèle');
    // The title shows what the template gave it.
    expect(root.root.findAll(node => node.type === TextInput && node.props.accessibilityLabel === 'Titre de la page')[0]!.props.value).toBe('Lundi 9 novembre 2026');

    await act(async () => {
      pressable(root, 'Annuler')[0]!.props.onPress();
      jest.advanceTimersByTime(50);
    });
    expect(kinds(ids.blank)).toEqual([]);
    expect(useLibraryStore.getState().blocks[ids.blank]!.text).toBe('');
    expect(textOf(root)).toContain('Partir d’un modèle');
  });

  it('lists the pages changed last first when moving it, then every page', async () => {
    const root = tree!;
    await act(async () => {
      openPageSheet({ kind: 'movePage', page: ids.blank });
      jest.advanceTimersByTime(400);
    });
    const text = textOf(root);
    expect(text).toContain('Récentes');
    expect(text).toContain('Toutes les pages');
    // Five recent pages, the latest first, then every page again by where it sits.
    expect(text.indexOf('Page 9')).toBeLessThan(text.indexOf('Page 5'));
    expect(outermost(root, props => props.accessibilityRole === 'radio' && props.accessibilityLabel === 'Page 9')).toHaveLength(2);
    expect(outermost(root, props => props.accessibilityRole === 'radio' && props.accessibilityLabel === 'Page 1')).toHaveLength(1);
  });
});
