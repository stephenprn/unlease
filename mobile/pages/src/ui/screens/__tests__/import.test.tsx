/**
 * Pages' import on the phone: a Markdown file picked lands on the preview (its copy in the cache
 * removed), a second one added there, one left out by its box; the choices put them at the top of
 * the tree; « Importer » writes one batch its slip takes back. A .zip is sent to the web. Réglages
 * lists « Importer » first in Données and « Effacer des données » last; erasing keeps the journal.
 */
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { useUiStore } from '@shared/app/store/uiStore';
import { resetBootstrap } from '@app/bootstrap';
import { resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { createPage, erasePages } from '@app/store/pages';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';

import { __reset as resetMedia, state as media } from '../../../../../shared/__mocks__/NativeMedia';

jest.useFakeTimers();
jest.setSystemTime(new Date(2026, 10, 12, 10, 0));

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

const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] =>
  tree.root.findAll(node => (node.props as { accessibilityLabel?: unknown }).accessibilityLabel === label && typeof node.props.onPress === 'function', { deep: false });

/** The last pressable drawing `text`. */
function pressableWithText(tree: ReactTestRenderer, text: string): ReactTestInstance {
  const found = tree.root.findAll(node => typeof node.props.onPress === 'function' && node.findAll(child => child.children.includes(text)).length > 0, { deep: false });
  if (found.length === 0) throw new Error(`nothing pressable reads « ${text} »`);
  return found[found.length - 1]!;
}

async function settle(ms = 400): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

const press = async (tree: ReactTestRenderer, text: string): Promise<void> => {
  await act(async () => {
    pressableWithText(tree, text).props.onPress();
  });
  await settle();
};

const pages = (title: string) => Object.values(useLibraryStore.getState().blocks).filter(block => block.kind === 'page' && block.text === title && block.deletedAt === null);

let tree: ReactTestRenderer | null = null;

async function boot(): Promise<ReactTestRenderer> {
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'pagesImport.sqlite' });
  writePreference('onboarded', true);
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await settle(500);
  return tree!;
}

const pickNext = (name: string, text: string): void => {
  media.nextFile = { status: 'ok', message: '', path: `/cache/${name}`, name, bytes: text.length };
  media.texts[`/cache/${name}`] = text;
};

describe('Pages’ import on the phone', () => {
  beforeEach(() => {
    resetMedia();
  });

  afterEach(async () => {
    const last = tree;
    tree = null;
    if (last) await act(async () => last.unmount());
  });

  it('reads Markdown files into the preview, then writes the pages ticked in one batch its slip takes back', async () => {
    const root = await boot();
    await act(async () => {
      (navigationRef.navigate as (...args: unknown[]) => void)('Import');
    });
    await settle();
    expect(textOf(root)).toContain('Vos pages Notion ou Markdown');

    pickNext('Recettes.md', '# Recettes\n\n- [ ] Tarte\n\nVoir [[Idée]].');
    await press(root, 'Choisir un fichier Markdown');
    expect(textOf(root)).toContain('Ce que contient le fichier');
    expect(media.removed).toContain('/cache/Recettes.md');

    pickNext('Idée.md', 'Une idée');
    await press(root, 'Ajouter un fichier');
    pickNext('Brouillon.md', 'À jeter');
    await press(root, 'Ajouter un fichier');
    expect(textOf(root)).toContain('Idée');
    await act(async () => {
      pressables(root, 'Importer Brouillon')[0]!.props.onPress();
    });
    await settle();

    await press(root, 'Continuer');
    expect(textOf(root)).toContain('Où mettre les pages');
    await press(root, 'En haut de l’arborescence');
    await press(root, 'Importer 2\u00a0pages');
    await settle();
    expect(textOf(root)).toContain('Import terminé');
    expect(pages('Recettes')[0]!.parentId).toBeNull();
    expect(pages('Idée')).toHaveLength(1);
    expect(pages('Brouillon')).toHaveLength(0);
    // The wiki link to the other file: a mention of its page.
    const recettes = pages('Recettes')[0]!;
    const words = (useLibraryStore.getState().blocksByParent[recettes.id] ?? []).map(id => useLibraryStore.getState().blocks[id]!.text);
    expect(words).toContain(`Voir {@page=${pages('Idée')[0]!.id}}.`);

    await act(async () => {
      useUiStore.getState().snack?.action?.run();
    });
    expect(pages('Recettes')).toHaveLength(0);
  });

  it('sends a .zip to the web, and stays on its first step', async () => {
    const root = await boot();
    await act(async () => {
      (navigationRef.navigate as (...args: unknown[]) => void)('Import');
    });
    await settle();
    media.nextFile = { status: 'ok', message: '', path: '/cache/Export.zip', name: 'Export-abc.zip', bytes: 100 };
    await press(root, 'Choisir un fichier Markdown');
    expect(textOf(root)).toContain('s’importe depuis Pages sur le web');
    expect(media.removed).toContain('/cache/Export.zip');
  });

  it('lists « Importer » first in Données and « Effacer des données » last', async () => {
    const root = await boot();
    await act(async () => {
      (navigationRef.navigate as (...args: unknown[]) => void)('Settings');
    });
    await settle();
    const text = textOf(root);
    expect(text.indexOf('Importer')).toBeLessThan(text.indexOf('Vider la corbeille'));
    expect(text.indexOf('Vider la corbeille')).toBeLessThan(text.indexOf('Effacer des données'));
    await press(root, 'Effacer des données');
    expect(navigationRef.getCurrentRoute()?.name).toBe('Erase');
    expect(textOf(root)).toContain('Vos pages');
    expect(textOf(root)).toContain('Le journal');
  });

  it('erases the pages and keeps the journal', async () => {
    await boot();
    await act(async () => {
      const voyage = createPage({ title: 'Voyage' });
      createPage({ parentId: voyage, title: 'Lisbonne' });
      const journal = createPage({ title: 'Journal' });
      createPage({ parentId: journal, title: 'Jeudi 12 novembre 2026' });
    });
    let erased = 0;
    await act(async () => {
      erased = erasePages(new Set(['pages']));
    });
    expect(erased).toBe(2);
    expect(pages('Voyage')).toHaveLength(0);
    expect(pages('Journal')).toHaveLength(1);
  });
});
