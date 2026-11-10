/**
 * « Modèles de fiche » on the phone: the list (each kind with its fields, the person's own with the
 * collections that pick them), a kind's template changed and saved whole, one of the person's own
 * made with a field from its sheet, a collection's picker, a kind's template set back, and what a
 * link read with an older version offers (« Relire », « Tout relire », « Essayer »).
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { kindTemplateId, presetFields, templateSignature } from '@unlease/notes/services/templates';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { addLink, createLine, saveTemplate, updateLink } from '@app/store/actions';
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

describe('the templates’ list', () => {
  it('lists each kind with its fields, then the person’s own with the collections that pick them', async () => {
    const tree = await boot();
    await go('Templates');
    expect(textOf(tree)).toContain('Ce que Claude relève sur les liens que vous gardez.');
    expect(textOf(tree)).toContain('Par type de lien');
    expect(textOf(tree)).toContain('Temps total, Portions, Difficulté');
    // None of one's own yet: only the way to make one.
    expect(textOf(tree)).not.toContain('Vos modèles');
    expect(textOf(tree)).toContain('Nouveau modèle');
    // A link of no kind keeps its title and summary: no row for it.
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Lien' && typeof node.props.onPress === 'function')).toHaveLength(0);

    await act(async () => {
      saveTemplate({ id: null, name: 'Vin', kind: null, fields: WINE }, { forCollection: ids.vins });
      saveTemplate({ id: null, name: 'Plante', kind: null, fields: [] });
      saveTemplate({ id: null, name: '', kind: 'recipe', fields: [...presetFields('recipe'), { id: 'veggie', name: 'Végétarien', type: 'yesno', hint: '' }] });
    });
    expect(textOf(tree)).toContain('Vos modèles');
    expect(textOf(tree)).toContain('2 champs · Vins');
    expect(textOf(tree)).toContain('0 champ · Aucune collection');
    expect(textOf(tree)).toContain('Temps total, Portions, Difficulté, Végétarien · Modifié');
    // By name: « Plante » before « Vin ».
    const own = tree.root.findAll(node => ['Plante', 'Vin'].includes(node.props.accessibilityLabel as string) && typeof node.props.onPress === 'function', { deep: false });
    expect(own.map(node => node.props.accessibilityLabel)).toEqual(['Plante', 'Vin']);
  });
});

describe('a kind’s template', () => {
  it('takes a common field in one tap and is saved whole, under the kind’s own id', async () => {
    const tree = await boot();
    await go('Templates');
    await press(tree, 'Recette');
    expect(navigationRef.getCurrentRoute()?.name).toBe('Template');
    expect(textOf(tree)).toContain('Pour les liens que Claude reconnaît comme « Recette ».');
    expect(textOf(tree)).toContain('Champs courants');
    await press(tree, 'Ajouter le champ « Marque »');
    await press(tree, 'Enregistrer');
    const saved = useLibraryStore.getState().linkTemplates[kindTemplateId('recipe')]!;
    expect(saved).toMatchObject({ kind: 'recipe', name: '', deletedAt: null });
    expect(saved.fields.map(field => field.name)).toEqual(['Temps total', 'Portions', 'Difficulté', 'Marque']);
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Modèle enregistré', tone: 'success' });
    expect(navigationRef.getCurrentRoute()?.name).toBe('Templates');
    expect(textOf(tree)).toContain('Temps total, Portions, Difficulté, Marque · Modifié');
  });

  it('is set back to its preset in one press, with « Annuler »', async () => {
    const tree = await boot(() => {
      saveTemplate({ id: null, name: '', kind: 'recipe', fields: presetFields('recipe').slice(0, 1) });
    });
    await go('Templates');
    await go('Template', { kind: 'recipe' });
    expect(textOf(tree)).not.toContain('Portions');
    await press(tree, 'Rétablir l’original');
    expect(useLibraryStore.getState().linkTemplates[kindTemplateId('recipe')]!.deletedAt).not.toBeNull();
    const snack = useUiStore.getState().snack!;
    expect(snack).toMatchObject({ message: 'Modèle d’origine rétabli', tone: 'success', action: { label: 'Annuler' } });
    expect(textOf(tree)).toContain('Temps total, Portions, Difficulté');
    await act(async () => snack.action!.run());
    expect(useLibraryStore.getState().linkTemplates[kindTemplateId('recipe')]!.deletedAt).toBeNull();
    expect(textOf(tree)).toContain('Temps total · Modifié');
  });
});

describe('one of the person’s own', () => {
  it('needs a name, takes a field shaped in its sheet, and is saved with it', async () => {
    const tree = await boot();
    await go('Templates');
    await press(tree, 'Nouveau modèle');
    expect(textOf(tree)).toContain('Aucun champ : Claude ne relèvera que le titre, le résumé et le prix.');
    expect(textOf(tree)).toContain('Choisissez-le dans le menu d’une collection.');
    // Saved nameless: said under the name, nothing written.
    await press(tree, 'Enregistrer');
    expect(textOf(tree)).toContain('Donnez-lui un nom.');
    expect(useLibraryStore.getState().linkTemplates).toEqual({});

    await type(tree, 'Nom du modèle', 'Vin');
    await press(tree, 'Ajouter un champ');
    // A field needs its name too.
    await press(tree, 'Ajouter');
    expect(textOf(tree)).toContain('Nommez ce champ.');
    await type(tree, 'Nom', 'Millésime');
    await press(tree, 'Nombre, Un nombre, avec son unité');
    await type(tree, 'Ce qu’il faut y mettre', 'L’année de la récolte');
    await press(tree, 'Ajouter');
    expect(textOf(tree)).toContain('Millésime');
    expect(textOf(tree)).toContain('Nombre · L’année de la récolte');

    await press(tree, 'Enregistrer');
    const own = Object.values(useLibraryStore.getState().linkTemplates);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ name: 'Vin', kind: null, deletedAt: null, fields: [{ name: 'Millésime', type: 'number', hint: 'L’année de la récolte' }] });
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Modèle enregistré' });
    expect(textOf(tree)).toContain('1 champ · Aucune collection');
  });

  it('is deleted from its form, with « Annuler »', async () => {
    let vin = '';
    const tree = await boot(() => {
      vin = saveTemplate({ id: null, name: 'Vin', kind: null, fields: WINE }, { forCollection: ids.vins }).id;
    });
    await go('Templates');
    await press(tree, 'Vin');
    expect(textOf(tree)).toContain('Lu sur les liens de Vins.');
    // A kind's template, unchanged, has nothing to set back; one's own has no original.
    expect(textOf(tree)).not.toContain('Rétablir l’original');
    await press(tree, 'Supprimer le modèle');
    expect(useLibraryStore.getState().linkTemplates[vin]!.deletedAt).not.toBeNull();
    // The collection keeps its choice: a deleted template reads as none.
    expect(useLibraryStore.getState().notes[ids.vins!]!.templateId).toBe(vin);
    expect(textOf(tree)).not.toContain('Vos modèles');
    await act(async () => useUiStore.getState().snack!.action!.run());
    expect(useLibraryStore.getState().linkTemplates[vin]!.deletedAt).toBeNull();
  });
});

describe('a collection’s « Modèle de fiche »', () => {
  it('is picked from its menu at once, undone from the slip, and « Non classé » never offers it', async () => {
    let vin = '';
    const tree = await boot(() => {
      vin = saveTemplate({ id: null, name: 'Vin', kind: null, fields: WINE }).id;
    });
    await go('Line', { id: ids.vins! });
    await press(tree, 'Plus d’actions');
    await pressMenu(tree, 'Modèle de fiche');
    expect(textOf(tree)).toContain('Chaque lien est lu avec le modèle de son type.');
    expect(pressable(tree, 'Selon le type de lien').props.accessibilityState).toMatchObject({ checked: true });
    await press(tree, 'Vin');
    expect(useLibraryStore.getState().notes[ids.vins!]!.templateId).toBe(vin);
    const snack = useUiStore.getState().snack!;
    expect(snack).toMatchObject({ message: 'Modèle choisi', tone: 'success', action: { label: 'Annuler' } });
    await act(async () => snack.action!.run());
    expect(useLibraryStore.getState().notes[ids.vins!]!.templateId).toBeNull();

    // « Nouveau modèle » from here: once saved, the collection reads with it.
    await press(tree, 'Plus d’actions');
    await pressMenu(tree, 'Modèle de fiche');
    await press(tree, 'Nouveau modèle');
    expect(textOf(tree)).toContain('Lu sur les liens de Vins une fois enregistré.');
    await type(tree, 'Nom du modèle', 'Grand cru');
    await press(tree, 'Ajouter le champ « Marque »');
    await press(tree, 'Enregistrer');
    const made = Object.values(useLibraryStore.getState().linkTemplates).find(template => template.name === 'Grand cru')!;
    expect(useLibraryStore.getState().notes[ids.vins!]!.templateId).toBe(made.id);

    await go('Line', { id: 'inbox' });
    await press(tree, 'Plus d’actions');
    const rows = tree.root.findAll(node => node.props.accessibilityRole === 'menuitem' && typeof node.props.onPress === 'function', { deep: false }).map(textIn);
    expect(rows).toContain('Modules');
    expect(rows).not.toContain('Modèle de fiche');
  });
});

describe('links read with an older version', () => {
  it('say so on their page with « Relire », the template offers « Tout relire », and « Essayer » shows what Claude finds', async () => {
    let vin = '';
    const tree = await boot(() => {
      vin = saveTemplate({ id: null, name: 'Vin', kind: null, fields: WINE }, { forCollection: ids.vins }).id;
    });
    await act(async () => {
      useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading: true, model: 'claude-sonnet-5-5' });
      // Read with the template as it is now: nothing to say.
      updateLink(ids.yquem!, { readWith: templateSignature(WINE) });
    });
    await go('Link', { id: ids.yquem! });
    expect(textOf(tree)).not.toContain('Lu avec une version précédente de la fiche.');
    await go('Link', { id: ids.margaux! });
    expect(textOf(tree)).toContain('Lu avec une version précédente de la fiche.');
    await press(tree, 'Relire');
    expect(useLibraryStore.getState().links[ids.margaux!]!.status).toBe('pending');

    // Read again, with an older version once more: the template's well counts it.
    await act(async () => updateLink(ids.margaux!, { status: 'ready', readWith: null }));
    await go('Templates');
    await go('Template', { id: vin });
    expect(textOf(tree)).toContain('1 lien lu avec une autre version · environ');
    // One link: « Relire », the web's word too.
    expect(textOf(tree)).not.toContain('Tout relire');
    await press(tree, 'Relire');
    expect(useLibraryStore.getState().links[ids.margaux!]!.status).toBe('pending');
    expect(textOf(tree)).not.toContain('pour le relire');

    // « Essayer » on the newest of its links, nothing written.
    expect(textOf(tree)).toContain('Voyez ce que Claude relèverait sur un lien, sans rien enregistrer.');
    await press(tree, 'Essayer');
    await settle();
    expect(tried).toEqual([{ url: expect.stringMatching(/^https:\/\/vins\.fr\//), lang: 'fr', fields: WINE }]);
    expect(textOf(tree)).toContain('Château Margaux 2015');
    expect(textOf(tree)).toContain('Château Margaux');
    expect(textOf(tree)).toContain('—');
    expect(textOf(tree)).toMatch(/Lu en [\d,]+ s · 0,004 \$/);
  });

  it('cannot be tried without Claude', async () => {
    let vin = '';
    const tree = await boot(() => {
      vin = saveTemplate({ id: null, name: 'Vin', kind: null, fields: WINE }, { forCollection: ids.vins }).id;
    });
    await go('Template', { id: vin });
    expect(textOf(tree)).toContain('Claude n’est pas configuré : l’essai n’est pas possible.');
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Essayer' && typeof node.props.onPress === 'function')).toHaveLength(0);
    // Nobody to read them: no well.
    expect(textOf(tree)).not.toContain('Tout relire');
  });
});
