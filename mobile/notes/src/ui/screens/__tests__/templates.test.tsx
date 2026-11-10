/**
 * « Ce que Claude relève » on the phone: the overview (the collections with their own facts, every
 * kind's usual ones), a collection's page (Claude's usual facts or its own, a fact shaped in its sheet,
 * saved whole and undone from the slip), a kind's usual facts changed and set back, and what a link
 * read before its facts changed offers (« Relire », the well, the preview).
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { collectionTemplate, kindTemplateId, presetFields, templateSignature } from '@unlease/notes/services/templates';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { addLink, createLine, saveCollectionFacts, saveTemplate, updateLink } from '@app/store/actions';
import { resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { useUiStore } from '@shared/app/store/uiStore';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';
import type { RootStackParamList } from '@ui/navigation/types';

jest.useFakeTimers();

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

/** The text inside one element (a menu's row). */
function textIn(node: ReactTestInstance): string {
  return node.children.map(child => (typeof child === 'string' ? child : textIn(child))).join('');
}

/** The pressable named so (a button, a row, a chip): the last drawn, on the screen on top of the stack. */
function pressable(tree: ReactTestRenderer, label: string): ReactTestInstance {
  const found = tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function', { deep: false });
  if (found.length === 0) throw new Error(`Nothing to press named « ${label} »`);
  return found[found.length - 1]!;
}

async function settle(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
}

async function press(tree: ReactTestRenderer, label: string): Promise<void> {
  await act(async () => {
    pressable(tree, label).props.onPress();
  });
  await settle();
}

/** A menu's row, by its words. */
async function pressMenu(tree: ReactTestRenderer, words: string): Promise<void> {
  const row = tree.root.findAll(node => node.props.accessibilityRole === 'menuitem' && typeof node.props.onPress === 'function', { deep: false }).find(node => textIn(node) === words);
  if (!row) throw new Error(`No menu row « ${words} »`);
  await act(async () => {
    row.props.onPress();
  });
  await settle();
}

/** Types into the field named so (its label, or its label and its problem). */
async function type(tree: ReactTestRenderer, label: string, text: string): Promise<void> {
  const input = tree.root.findAll(node => node.type === TextInput && typeof node.props.accessibilityLabel === 'string' && (node.props.accessibilityLabel === label || node.props.accessibilityLabel.startsWith(`${label},`))).pop();
  if (!input) throw new Error(`No field named « ${label} »`);
  await act(async () => {
    input.props.onChangeText(text);
  });
}

async function go<K extends keyof RootStackParamList>(screen: K, params?: RootStackParamList[K]): Promise<void> {
  await act(async () => {
    (navigationRef.navigate as (...args: unknown[]) => void)(screen, params);
    jest.advanceTimersByTime(400);
  });
}

const answer = (body: unknown, code = 200) => ({ ok: code < 400, status: code, headers: { get: () => null }, json: async () => body });
let tried: unknown[] = [];

/** The server: a sync waits forever; « Essayer » reads the page and says what it found. */
function fakeFetch(input: string, init?: { body?: unknown }) {
  const url = new URL(input);
  if (url.pathname === '/api/notes/template-try') {
    tried.push(typeof init?.body === 'string' ? JSON.parse(init.body) : null);
    return Promise.resolve(answer({ title: 'Château Margaux 2015', values: { f1: 'Château Margaux' }, costUsd: 0.004 }));
  }
  if (url.pathname === '/api/sync') return new Promise(() => {});
  return Promise.resolve(answer({ error: 'not found' }, 404));
}

let mounted: ReactTestRenderer | null = null;
let ids: Record<string, string> = {};

async function boot(seed?: () => void): Promise<ReactTestRenderer> {
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'templates.sqlite' });
  writePreference('onboarded', true);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await act(async () => {
    const vins = createLine({ title: 'Vins' });
    const cuisine = createLine({ title: 'Cuisine' });
    const margaux = addLink('https://vins.fr/margaux', { noteId: vins });
    updateLink(margaux, { status: 'ready', title: 'Château Margaux', kind: 'product', attributes: [{ label: 'Marque', value: 'Margaux' }] });
    const yquem = addLink('https://vins.fr/yquem', { noteId: vins });
    updateLink(yquem, { status: 'ready', title: 'Château d’Yquem', kind: 'product' });
    const tarte = addLink('https://cuisine.fr/tarte', { noteId: cuisine });
    updateLink(tarte, { status: 'ready', title: 'Tarte aux pommes', kind: 'recipe', attributes: [{ label: 'Temps total', value: '1 h' }] });
    ids = { vins, cuisine, margaux, yquem, tarte };
    seed?.();
  });
  await settle();
  mounted = tree;
  return tree;
}

const WINE = [{ id: 'f1', name: 'Domaine', type: 'text' as const, hint: 'Le domaine ou le château' }, { id: 'f2', name: 'Millésime', type: 'number' as const, hint: '' }];

beforeEach(() => {
  tried = [];
  global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
});

afterEach(async () => {
  await act(async () => useSettingsStore.setState({ server: null, reading: null }));
  await act(async () => useUiStore.setState({ snack: null }));
});

const own = (lineId: string) => collectionTemplate(useLibraryStore.getState().linkTemplates, useLibraryStore.getState().notes[lineId]);

describe('the overview', () => {
  it('lists the collections with their own facts, then every kind’s usual ones', async () => {
    const tree = await boot();
    await go('Templates');
    expect(textOf(tree)).toContain('Une collection peut avoir les siennes : « Ce que Claude relève » dans son menu.');
    expect(textOf(tree)).toContain('Informations habituelles, par type de lien');
    expect(textOf(tree)).toContain('Temps total, Portions, Difficulté');
    // No collection with its own yet.
    expect(textOf(tree)).not.toContain('Collections qui ont les leurs');
    // A link of no kind keeps its title and summary: no row for it.
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Lien' && typeof node.props.onPress === 'function')).toHaveLength(0);

    await act(async () => {
      saveCollectionFacts(ids.vins!, WINE);
      saveTemplate({ id: null, name: '', kind: 'recipe', fields: [...presetFields('recipe'), { id: 'veggie', name: 'Végétarien', type: 'yesno', hint: '' }] });
    });
    expect(textOf(tree)).toContain('Collections qui ont les leurs');
    expect(textOf(tree)).toContain('Domaine, Millésime');
    expect(textOf(tree)).toContain('Temps total, Portions, Difficulté, Végétarien · Modifiées');
    await press(tree, 'Vins');
    expect(navigationRef.getCurrentRoute()).toMatchObject({ name: 'Template', params: { collection: ids.vins } });
  });
});

describe('a kind’s usual facts', () => {
  it('take a suggestion in one tap and are saved whole, under the kind’s own id', async () => {
    const tree = await boot();
    await go('Templates');
    await press(tree, 'Recette');
    expect(navigationRef.getCurrentRoute()?.name).toBe('Template');
    expect(textOf(tree)).toContain('Claude les relève sur chaque lien qu’il reconnaît comme « Recette », sauf dans une collection qui a les siennes.');
    expect(textOf(tree)).toContain('Suggestions');
    await press(tree, 'Ajouter « Marque »');
    await press(tree, 'Enregistrer');
    const saved = useLibraryStore.getState().linkTemplates[kindTemplateId('recipe')]!;
    expect(saved).toMatchObject({ kind: 'recipe', name: '', deletedAt: null });
    expect(saved.fields.map(field => field.name)).toEqual(['Temps total', 'Portions', 'Difficulté', 'Marque']);
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Informations enregistrées', tone: 'success' });
    expect(navigationRef.getCurrentRoute()?.name).toBe('Templates');
    expect(textOf(tree)).toContain('Temps total, Portions, Difficulté, Marque · Modifiées');
  });

  it('go back to Claude’s in one press, with « Annuler »', async () => {
    const tree = await boot(() => {
      saveTemplate({ id: null, name: '', kind: 'recipe', fields: presetFields('recipe').slice(0, 1) });
    });
    await go('Templates');
    await go('Template', { kind: 'recipe' });
    // Its own usual facts it lacks are suggested first.
    expect(textOf(tree)).toContain('Suggestions Portions Difficulté Marque');
    await press(tree, 'Rétablir celles de Claude');
    expect(useLibraryStore.getState().linkTemplates[kindTemplateId('recipe')]!.deletedAt).not.toBeNull();
    const snack = useUiStore.getState().snack!;
    expect(snack).toMatchObject({ message: 'Informations de Claude rétablies', tone: 'success', action: { label: 'Annuler' } });
    expect(textOf(tree)).toContain('Temps total, Portions, Difficulté');
    await act(async () => snack.action!.run());
    expect(useLibraryStore.getState().linkTemplates[kindTemplateId('recipe')]!.deletedAt).toBeNull();
    expect(textOf(tree)).toContain('Temps total · Modifiées');
  });
});

describe('a collection’s « Ce que Claude relève »', () => {
  it('opens from its menu, never on « Non classé », on Claude’s usual facts and the kinds its links have', async () => {
    const tree = await boot();
    await go('Line', { id: ids.vins! });
    await press(tree, 'Plus d’actions');
    await pressMenu(tree, 'Ce que Claude relève');
    expect(navigationRef.getCurrentRoute()).toMatchObject({ name: 'Template', params: { collection: ids.vins } });
    expect(textOf(tree)).toContain('Sur les liens de Vins');
    expect(pressable(tree, 'Les informations habituelles, Chaque lien a celles de son type : la marque d’un produit, le réalisateur d’un film…').props.accessibilityState).toMatchObject({ checked: true });
    // Its links are products: the product's usual facts.
    expect(textOf(tree)).toContain('Marque, Couleur, Taille(s), Matière, Modèle, Disponibilité');

    await go('Line', { id: 'inbox' });
    await press(tree, 'Plus d’actions');
    const rows = tree.root.findAll(node => node.props.accessibilityRole === 'menuitem' && typeof node.props.onPress === 'function', { deep: false }).map(textIn);
    expect(rows).toContain('Modules');
    expect(rows).not.toContain('Ce que Claude relève');
  });

  it('takes its own facts from its links’ usual ones, a fact shaped in its sheet, saved whole and undone from the slip', async () => {
    const tree = await boot();
    await go('Template', { collection: ids.vins! });
    await press(tree, 'Les informations de cette collection, Les mêmes sur chaque lien, celles que vous choisissez.');
    expect(textOf(tree)).toContain('Disponibilité');
    await press(tree, 'Ajouter une information');
    // A fact needs its name.
    await press(tree, 'Ajouter');
    expect(textOf(tree)).toContain('Nommez cette information.');
    await type(tree, 'Nom de l’information', 'Millésime');
    await type(tree, 'Ce que Claude y note', 'L’année de la récolte');
    await press(tree, 'un nombre');
    await press(tree, 'Ajouter');
    expect(textOf(tree)).toContain('L’année de la récolte · un nombre');

    await press(tree, 'Enregistrer');
    const template = own(ids.vins!)!;
    expect(template).toMatchObject({ name: 'Vins', kind: null, deletedAt: null });
    expect(template.fields.map(field => field.name)).toEqual(['Marque', 'Couleur', 'Taille(s)', 'Matière', 'Modèle', 'Disponibilité', 'Millésime']);
    const snack = useUiStore.getState().snack!;
    expect(snack).toMatchObject({ message: 'Informations enregistrées', action: { label: 'Annuler' } });
    await act(async () => snack.action!.run());
    expect(own(ids.vins!)).toBeNull();
  });

  it('goes back to Claude’s usual facts, its list going with it', async () => {
    const tree = await boot(() => {
      saveCollectionFacts(ids.vins!, WINE);
    });
    const template = own(ids.vins!)!.id;
    await go('Template', { collection: ids.vins! });
    expect(textOf(tree)).toContain('Domaine');
    await press(tree, 'Les informations habituelles, Chaque lien a celles de son type : la marque d’un produit, le réalisateur d’un film…');
    await press(tree, 'Enregistrer');
    expect(own(ids.vins!)).toBeNull();
    expect(useLibraryStore.getState().linkTemplates[template]!.deletedAt).not.toBeNull();
  });
});

describe('links read before their facts changed', () => {
  it('say so on their page with « Relire », the collection’s facts offer the well, and the preview shows what Claude finds', async () => {
    const tree = await boot(() => {
      saveCollectionFacts(ids.vins!, WINE);
    });
    await act(async () => {
      useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading: true, model: 'claude-sonnet-5-5' });
      // Noted with the facts as they are now: nothing to say.
      updateLink(ids.yquem!, { readWith: templateSignature(WINE) });
    });
    await go('Link', { id: ids.yquem! });
    expect(textOf(tree)).not.toContain('Lu avant le dernier changement de ses informations.');
    await go('Link', { id: ids.margaux! });
    expect(textOf(tree)).toContain('Lu avant le dernier changement de ses informations.');
    await press(tree, 'Relire');
    expect(useLibraryStore.getState().links[ids.margaux!]!.status).toBe('pending');

    // Noted with older facts once more: the page's well counts it.
    await act(async () => updateLink(ids.margaux!, { status: 'ready', readWith: null }));
    await go('Template', { collection: ids.vins! });
    expect(textOf(tree)).toMatch(/1\slien lu avant ce changement · environ/);
    expect(textOf(tree)).not.toContain('Tout relire');
    await press(tree, 'Relire');
    expect(useLibraryStore.getState().links[ids.margaux!]!.status).toBe('pending');
    expect(textOf(tree)).not.toContain('pour le relire');

    // The preview on the newest of its links, nothing written.
    expect(textOf(tree)).toContain('Voyez ce que Claude relèverait, sans rien enregistrer.');
    await press(tree, 'Essayer');
    await settle();
    expect(tried).toEqual([{ url: expect.stringMatching(/^https:\/\/vins\.fr\//), lang: 'fr', fields: WINE }]);
    expect(textOf(tree)).toContain('Château Margaux 2015');
    expect(textOf(tree)).toContain('—');
    expect(textOf(tree)).toMatch(/Lu en [\d,]+ s · 0,004 \$/);
  });

  it('cannot be previewed without Claude', async () => {
    const tree = await boot(() => {
      saveCollectionFacts(ids.vins!, WINE);
    });
    await go('Template', { collection: ids.vins! });
    expect(textOf(tree)).toContain('Claude n’est pas configuré : l’essai n’est pas possible.');
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Essayer' && typeof node.props.onPress === 'function')).toHaveLength(0);
    // Nobody to note them: no well.
    expect(textOf(tree)).not.toContain('Tout relire');
  });
});
