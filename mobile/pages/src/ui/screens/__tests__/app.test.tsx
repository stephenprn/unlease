/**
 * Pages' root in the real app: a fresh install opens on the suite's first run with Pages' brand
 * (and Carnet's connection offered in one tap when Carnet holds one), an onboarded one on the
 * pages' home, covered by « Activer Pages » when the server does not run it; `unlease-pages://page/<id>` opens that page (`#block-<id>` at a block); a note of
 * Carnet's shown in a page and the drawer's Carnet row open Carnet (`carnet://`); the library holds
 * both apps' records and the sync asks for both. As on the web: a page says when it changed and
 * folds its breadcrumb into a menu, « Déplacer vers » lists pages by their paths, an embedded link
 * shows its facts and stamp, an embedded collection shows as a table when asked, and a page of the
 * drawer's tree held down offers its actions; the bin keeps a card per page, as every app's.
 */
import React from 'react';
import { Linking } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { NavigationState, PartialState } from '@react-navigation/native';

import type { AdminStatus } from '@unlease/core/sync/admin';
import type { ServerSettings } from '@unlease/core/sync/settings';
import { linkFields, noteFields } from '@unlease/notes/sync/entities';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { syncedTypes } from '@shared/app/store/library';
import { setDrawerOpen, useUiStore } from '@shared/app/store/uiStore';
import { setServer, setServerApps, useSettingsStore } from '@shared/app/store/settingsStore';
import { bootstrap, resetBootstrap } from '@app/bootstrap';
import { resetLibrary, useLibraryStore, writeLocal } from '@app/store/libraryStore';
import { createPage, insertBlock, targetBlock, trashPage } from '@app/store/pages';
import { AppProviders } from '@app/providers/AppProviders';
import { blockFromHash, linking } from '@ui/navigation/RootNavigator';
import { navigationRef } from '@ui/navigation/navigationRef';
import { SettingsScroll } from '@shared/ui/features/settings/SettingsScroll';

import { state as suite, __reset as resetSuite } from '../../../../../shared/__mocks__/NativeSuiteLink';

jest.useFakeTimers();

const SETTINGS: ServerSettings = {
  apps: { enabled: ['notes', 'pages'] },
  setup: { done: true },
  analysis: { enabled: false, keySource: null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 },
  pages: { enabled: false, everywhere: true, web: true, reach: 'medium' },
  backup: { configured: false, endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretHint: null, recurrence: 'off', keep: 30, storageClass: 'STANDARD' },
  drive: { provider: null, url: '', folder: '', library: null, tokenHint: null, leaving: false },
  calendar: { holidays: { country: null, region: null }, publishPath: null, ask: false },
  seerr: { url: '', keyHint: null },
  immich: { url: '', keyHint: null },
};

const ADMIN: AdminStatus = {
  server: { version: '0.1.0', notes: 0, pages: 0, contacts: 0, events: 0, files: 0, fileBytes: 0 },
  backup: { running: false, last: null, lastSuccessAt: null, nextAt: null },
  drive: { running: false, files: 0, bytes: 0, waiting: 0, lastPassAt: null, error: null },
  restore: { running: false, startedAt: null, finishedAt: null, error: null, report: null, thawing: false },
};

const answer = (body: unknown, code = 200) => ({ ok: code < 400, status: code, headers: { get: () => null }, json: async () => body });

/** What the first run asks of the server; a sync waits forever (no records come). */
function fakeFetch(input: string) {
  const url = new URL(input);
  if (url.pathname === '/api/sync') return new Promise(() => {});
  if (url.pathname === '/api/health') return Promise.resolve(answer({ ok: true, analysis: false, version: '0.1.0', apps: SETTINGS.apps.enabled, setup: true }));
  if (url.pathname === '/api/settings') return Promise.resolve(answer(SETTINGS));
  if (url.pathname === '/api/usage') return Promise.resolve(answer({}));
  // What the server holds: no page yet, so the first run offers the import.
  if (url.pathname === '/api/admin') return Promise.resolve(answer(ADMIN));
  return Promise.resolve(answer({ error: 'not found' }, 404));
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

const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] =>
  tree.root.findAll(node => (node.props as { accessibilityLabel?: unknown }).accessibilityLabel === label && typeof node.props.onPress === 'function', { deep: false });

/** The first pressable drawing `text` (a row whose label is its text). */
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

let mounted: ReactTestRenderer | null = null;

async function boot({ onboarded, prepare }: { onboarded: boolean; prepare?: () => void }): Promise<ReactTestRenderer> {
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'app.sqlite' });
  if (onboarded) writePreference('onboarded', true);
  if (prepare) {
    // What the phone held before the app opened: written once the library is loaded (the shell's own bootstrap then has nothing left to do).
    bootstrap();
    prepare();
  }
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await settle();
  mounted = tree;
  return tree;
}

/** The route a state leads to, nested or not. */
function leaf(state: PartialState<NavigationState> | NavigationState | undefined): { name: string; params?: object } | undefined {
  const route = state?.routes[state.index ?? state.routes.length - 1];
  return route?.state ? leaf(route.state) : (route as { name: string; params?: object } | undefined);
}

describe('Pages, its root', () => {
  beforeEach(() => {
    resetSuite();
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // The next boot starts alone on the phone (the database is a new one; the store is not).
    await act(async () => setServer(null));
  });

  afterAll(async () => {
    const last = mounted;
    if (last) await act(async () => last.unmount());
  });

  it('opens on the first run on a fresh install, Carnet’s connection offered in one tap', async () => {
    suite.siblings = [{ packageName: 'com.stephenprn.carnet', server: 'https://carnet.test', token: 'jeton', appearance: '', grain: '', locale: '' }];
    const tree = await boot({ onboarded: false });
    expect(navigationRef.getCurrentRoute()?.name).toBe('Setup');
    expect(suite.asked[0]).toEqual(['com.stephenprn.carnet', 'com.stephenprn.agenda', 'com.stephenprn.contacts']);
    expect(textOf(tree)).toContain('Pages');
    expect(textOf(tree)).toContain('Carnet est déjà relié à carnet.test sur ce téléphone.');
    await act(async () => {
      pressables(tree, 'Utiliser la connexion de Carnet')[0]!.props.onPress();
    });
    await settle();
    expect(useSettingsStore.getState().server).toEqual({ url: 'https://carnet.test', token: 'jeton' });
    // No page on the server yet: the import is offered, its Markdown picked or left for later.
    expect(textOf(tree)).toContain('Vous arrivez de Notion ?');
    expect(textOf(tree)).toContain('Choisir un fichier Markdown');
    await act(async () => {
      pressableWithText(tree, 'Plus tard').props.onPress();
    });
    await settle();
    await act(async () => {
      pressableWithText(tree, 'Commencer').props.onPress();
    });
    await settle();
    expect(useSettingsStore.getState().onboarded).toBe(true);
    expect(navigationRef.getCurrentRoute()?.name).toBe('Pages');
  });

  it('opens on the pages’ home once onboarded, and lists the pages made there', async () => {
    const tree = await boot({ onboarded: true });
    expect(navigationRef.getCurrentRoute()?.name).toBe('Pages');
    expect(textOf(tree)).toContain('Aucune page pour l’instant');
    await act(async () => {
      createPage({ title: 'Voyage au Portugal' });
    });
    expect(textOf(tree)).toContain('Voyage au Portugal');
    expect(textOf(tree)).toContain('Toutes les pages');
  });

  it('says so when the server does not run Pages, and turns it on there', async () => {
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        setServer({ url: 'https://carnet.test', token: 'jeton' });
        setServerApps(['notes']);
      },
    });
    expect(textOf(tree)).toContain('Pages n’est pas activé sur ce serveur');
    const turnOn = pressableWithText(tree, 'Activer Pages');
    global.fetch = jest.fn((input: string, init?: { method?: string; body?: string }) => {
      if (new URL(input).pathname === '/api/settings' && init?.method === 'PUT') return Promise.resolve(answer({ ...SETTINGS, apps: { enabled: JSON.parse(init.body!).apps } }));
      return fakeFetch(input);
    }) as unknown as typeof fetch;
    await act(async () => {
      turnOn.props.onPress();
    });
    await settle();
    expect(useSettingsStore.getState().apps).toEqual(['notes', 'pages']);
    expect(textOf(tree)).not.toContain('Pages n’est pas activé sur ce serveur');
  });

  it('reads unlease-pages:// links: a page, at a block, and the home', async () => {
    expect(blockFromHash('page/abc#block-def')).toBe('page/abc?block=def');
    expect(blockFromHash('page/abc?x=1#def')).toBe('page/abc?x=1&block=def');
    expect(leaf(linking.getStateFromPath!('page/abc#block-def', linking.config))).toMatchObject({ name: 'Page', params: { id: 'abc', block: 'def' } });
    expect(leaf(linking.getStateFromPath!('', linking.config))).toMatchObject({ name: 'Pages' });
    expect(leaf(linking.getStateFromPath!('trash', linking.config))).toMatchObject({ name: 'Trash' });
    // The launcher's shortcuts: a new page, the search.
    expect(leaf(linking.getStateFromPath!('new', linking.config))).toMatchObject({ name: 'Pages', params: { capture: 'page' } });
    expect(leaf(linking.getStateFromPath!('search', linking.config))).toMatchObject({ name: 'Pages', params: { capture: 'search' } });

    let page = '';
    jest.spyOn(Linking, 'getInitialURL').mockImplementation(async () => `unlease-pages://page/${page}`);
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        page = createPage({ title: 'Lisbonne' });
      },
    });
    expect(navigationRef.getCurrentRoute()).toMatchObject({ name: 'Page', params: { id: page } });
    expect(textOf(tree)).toContain('Lisbonne');
  });

  it('opens a note of Carnet’s shown in a page in Carnet', async () => {
    const note = '0190f0f0-0000-7000-8000-000000000001';
    let page = '';
    await boot({
      onboarded: true,
      prepare: () => {
        writeLocal([{ type: 'note', id: note, patch: noteFields({ kind: 'text', title: 'Liste de courses', body: 'Pain', color: null, pinned: false, archived: false, trashedAt: null, labelIds: [], position: 'a0', reminderAt: null, code: '', hint: '', createdAt: 0, deletedAt: null }) }]);
        page = createPage({ title: 'Semaine' });
        insertBlock(page, page, 0, targetBlock('bookmark', { type: 'note', id: note }));
      },
    });
    // Carnet's record and Pages' sit in one library.
    expect(useLibraryStore.getState().notes[note]?.title).toBe('Liste de courses');
    expect(syncedTypes()).toEqual(expect.arrayContaining(['block', 'note', 'link', 'check']));
    await act(async () => {
      (navigationRef.navigate as (...args: unknown[]) => void)('Page', { id: page });
    });
    await settle();
    const bookmark = mounted!.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Liste de courses') && typeof node.props.onPress === 'function', { deep: false });
    expect(bookmark.length).toBeGreaterThan(0);
    await act(async () => {
      bookmark[0]!.props.onPress();
    });
    expect(Linking.openURL).toHaveBeenCalledWith(`carnet://note/${note}`);
  });

  it('heads a page with when it changed, and folds the pages above it into a « … » that lists them', async () => {
    let deepest = '';
    let second = '';
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        const root = createPage({ title: 'Maison' });
        second = createPage({ parentId: root, title: 'Travaux' });
        const third = createPage({ parentId: second, title: 'Cuisine' });
        deepest = createPage({ parentId: third, title: 'Devis' });
      },
    });
    await act(async () => {
      (navigationRef.navigate as (...args: unknown[]) => void)('Page', { id: deepest });
    });
    await settle();
    expect(textOf(tree)).toMatch(/Modifiée à/);
    // The first page and the parent show; the one between them folds into « … », a menu of it (the drawer's tree lists it too).
    expect(textOf(tree)).toContain('Maison');
    expect(textOf(tree)).toContain('Cuisine');
    const fold = tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && /^1\spage au-dessus$/.test(node.props.accessibilityLabel) && typeof node.props.onPress === 'function', { deep: false });
    expect(fold.length).toBeGreaterThan(0);
    await act(async () => {
      fold[0]!.props.onPress();
    });
    await settle();
    await act(async () => {
      pressableWithText(tree, 'Travaux').props.onPress();
    });
    await settle();
    expect(navigationRef.getCurrentRoute()).toMatchObject({ name: 'Page', params: { id: second } });
  });

  it('moves a page from a flat list of pages by their paths, the one it is in ticked', async () => {
    let child = '';
    let other = '';
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        const root = createPage({ title: 'Projets' });
        child = createPage({ parentId: root, title: 'Jardin' });
        other = createPage({ title: 'Archives' });
      },
    });
    await act(async () => {
      (navigationRef.navigate as (...args: unknown[]) => void)('Page', { id: child });
    });
    await settle();
    await act(async () => {
      pressables(tree, 'Plus d’actions')[0]!.props.onPress();
    });
    await settle();
    await act(async () => {
      pressableWithText(tree, 'Déplacer vers…').props.onPress();
    });
    await settle();
    const rows = (label: string) => tree.root.findAll(node => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === label && typeof node.props.onPress === 'function', { deep: false });
    // Where it is now is ticked; the page itself is never offered; the top level is.
    expect(rows('Projets')[0]!.props.accessibilityState).toEqual({ checked: true });
    expect(rows('Jardin, Projets')).toHaveLength(0);
    expect(rows('Au premier niveau, Avec les pages de l’accueil')[0]!.props.accessibilityState).toEqual({ checked: false });
    await act(async () => {
      rows('Archives')[0]!.props.onPress();
    });
    await settle();
    expect(useLibraryStore.getState().blocks[child]!.parentId).toBe(other);
    expect(textOf(tree)).toContain('Page déplacée vers Archives');
  });

  it('shows an embedded link whole: its facts, and its stamp pressed in place', async () => {
    const line = '0190f0f0-0000-7000-8000-000000000002';
    const link = '0190f0f0-0000-7000-8000-000000000003';
    let page = '';
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        writeLocal([
          { type: 'note', id: line, patch: noteFields({ kind: 'links', title: 'À lire', body: '', color: null, pinned: false, archived: false, trashedAt: null, labelIds: [], position: 'a0', reminderAt: null, code: '', hint: '', createdAt: 0, deletedAt: null }) },
          {
            type: 'link',
            id: link,
            patch: linkFields({ noteId: line, url: 'https://example.org/article', status: 'ready', autoFile: false, filedBy: null, title: 'Un bel article', summary: 'Ce qu’il raconte.', siteName: 'Example', kind: 'article', price: null, currency: null, attributes: [], imageIds: [], imageUrl: null, done: false, doneAt: null, comment: '', position: 'a0', error: null, analyzedAt: 1, lang: 'fr', copy: null, createdAt: 0, deletedAt: null }),
          },
        ]);
        page = createPage({ title: 'Lectures' });
        insertBlock(page, page, 0, targetBlock('embed', { type: 'link', id: link }));
      },
    });
    await act(async () => {
      (navigationRef.navigate as (...args: unknown[]) => void)('Page', { id: page });
    });
    await settle();
    expect(textOf(tree)).toContain('Un bel article');
    expect(textOf(tree)).toContain('Ce qu’il raconte.');
    await act(async () => {
      pressables(tree, 'Lu')[0]!.props.onPress();
    });
    await settle();
    expect(useLibraryStore.getState().links[link]!.done).toBe(true);
    expect(textOf(tree)).toContain('Tamponné « Lu »');
    expect(pressables(tree, 'Remettre à faire').length).toBeGreaterThan(0);
    await act(async () => {
      pressables(tree, 'Ouvrir la page')[0]!.props.onPress();
    });
    expect(Linking.openURL).toHaveBeenCalledWith('https://example.org/article');
  });

  it('shows an embedded collection as a list or as a table of its links’ properties, as the web keeps it', async () => {
    const line = '0190f0f0-0000-7000-8000-000000000004';
    const link = '0190f0f0-0000-7000-8000-000000000005';
    let page = '';
    let block = '';
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        writeLocal([
          { type: 'note', id: line, patch: noteFields({ kind: 'links', title: 'Films', body: '', color: null, pinned: false, archived: false, trashedAt: null, labelIds: [], position: 'a0', reminderAt: null, code: '', hint: '', createdAt: 0, deletedAt: null }) },
          {
            type: 'link',
            id: link,
            patch: linkFields({ noteId: line, url: 'https://example.org/cleo', status: 'ready', autoFile: false, filedBy: null, title: 'Cléo de 5 à 7', summary: '', siteName: 'AlloCiné', kind: 'film', price: null, currency: null, attributes: [{ label: 'Réalisateur', value: 'Agnès Varda' }], imageIds: [], imageUrl: null, done: false, doneAt: null, comment: '', position: 'a0', error: null, analyzedAt: 1, lang: 'fr', copy: null, createdAt: 0, deletedAt: null }),
          },
        ]);
        page = createPage({ title: 'Cinéma' });
        block = insertBlock(page, page, 0, targetBlock('embed', { type: 'note', id: line }));
      },
    });
    await act(async () => {
      (navigationRef.navigate as (...args: unknown[]) => void)('Page', { id: page });
    });
    await settle();
    expect(textOf(tree)).toContain('Cléo de 5 à 7');
    expect(textOf(tree)).not.toContain('Réalisateur');
    await act(async () => {
      pressables(tree, 'Tableau')[0]!.props.onPress();
    });
    await settle();
    expect(useLibraryStore.getState().blocks[block]!.view).toBe('table');
    // The title first, then the facts Claude read, each in its column.
    expect(textOf(tree)).toContain('Titre');
    expect(textOf(tree)).toContain('Réalisateur');
    expect(textOf(tree)).toContain('Agnès Varda');
    await act(async () => {
      pressables(tree, 'Marquer « Cléo de 5 à 7 » : vu')[0]!.props.onPress();
    });
    expect(useLibraryStore.getState().links[link]!.done).toBe(true);
  });

  it('holds a page of the drawer’s tree down for its actions: a sub-page, a copy, the bin', async () => {
    let page = '';
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        page = createPage({ title: 'Recettes' });
      },
    });
    await act(async () => {
      setDrawerOpen(true);
    });
    await settle();
    const row = tree.root.findAll(node => typeof node.props.onLongPress === 'function' && node.findAll(child => child.children.includes('Recettes')).length > 0, { deep: false });
    await act(async () => {
      row[row.length - 1]!.props.onLongPress();
    });
    await settle();
    await act(async () => {
      pressableWithText(tree, 'Mettre à la corbeille').props.onPress();
    });
    await settle();
    expect(useLibraryStore.getState().blocks[page]!.trashedAt).not.toBeNull();
    expect(textOf(tree)).toContain('Page placée dans la corbeille');
  });

  it('keeps the bin as every app’s: a card per page, restored with « Annuler », opened, deleted for good once asked', async () => {
    let page = '';
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        page = createPage({ title: 'Recettes' });
        trashPage(page);
      },
    });
    await act(async () => {
      navigationRef.navigate('Trash');
    });
    await settle();
    expect(textOf(tree)).toMatch(/Les pages de la corbeille sont supprimées au bout de \d+\sjours\./);
    await act(async () => {
      pressables(tree, 'Restaurer Recettes')[0]!.props.onPress();
    });
    expect(useLibraryStore.getState().blocks[page]!.trashedAt).toBeNull();
    const snack = useUiStore.getState().snack;
    expect(snack).toMatchObject({ message: 'Page restaurée', tone: 'success' });
    await act(async () => snack!.action!.run());
    expect(useLibraryStore.getState().blocks[page]!.trashedAt).not.toBeNull();
    await settle();
    await act(async () => {
      pressables(tree, 'Recettes')[0]!.props.onPress();
    });
    expect(leaf(navigationRef.getRootState())).toMatchObject({ name: 'Page', params: { id: page } });
    await act(async () => {
      navigationRef.goBack();
    });
    await settle();
    await act(async () => {
      pressables(tree, 'Supprimer définitivement Recettes')[0]!.props.onPress();
    });
    await settle();
    expect(textOf(tree)).toContain('Cette page disparaîtra de tous vos appareils, avec tout ce qu’elle contient.');
    await act(async () => {
      pressableWithText(tree, 'Supprimer').props.onPress();
    });
    await settle();
    const gone = useLibraryStore.getState().blocks[page];
    expect(gone === undefined || gone.deletedAt !== null).toBe(true);
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Page supprimée définitivement', tone: 'success' });
    expect(useUiStore.getState().snack?.action).toBeUndefined();
    expect(textOf(tree)).toContain('La corbeille est vide');
  });

  it('offers Carnet in the drawer when it is installed, and opens it there', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const tree = await boot({ onboarded: true });
    await act(async () => {
      setDrawerOpen(true);
    });
    await settle();
    await act(async () => {
      pressableWithText(tree, 'Carnet').props.onPress();
    });
    expect(Linking.openURL).toHaveBeenCalledWith('carnet://');
    await act(async () => {
      setDrawerOpen(false);
    });
  });

  it('keeps Réglages in every app’s order: the look one row opening its page, the Administration last', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => {
      (navigationRef.navigate as (...args: unknown[]) => void)('Settings');
    });
    await settle();
    // Réglages' own words (the drawer names the Administration too).
    const textIn = (node: ReactTestInstance): string => node.children.map(child => (typeof child === 'string' ? child : textIn(child))).join(' ');
    const overview = textIn(tree.root.findByType(SettingsScroll));
    // No settings of its own yet: « Apparence », « Langue », « Données », and the way to the Administration last.
    const order = ['Apparence', 'Langue', 'Données', 'Administration'].map(words => overview.indexOf(words));
    expect(order.every(at => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(overview).not.toContain('Palettes');
    // Its row opens « Apparence »'s page: the theme and the paper's grain, the colours, the ground.
    await act(async () => {
      pressables(tree, 'Apparence')[0]!.props.onPress();
    });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Appearance');
    for (const words of ['Thème', 'Grain du papier', 'Palettes', 'Couleurs unies', 'Grain sur le fond']) expect(textOf(tree)).toContain(words);
    // Back is Réglages.
    await act(async () => {
      navigationRef.goBack();
    });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Settings');
  });
});
