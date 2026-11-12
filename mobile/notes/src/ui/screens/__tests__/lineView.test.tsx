/**
 * A collection's page laid out as this phone keeps it: its layout, order and filter (remembered per
 * collection, never synced), « Tout lire » while Claude could read links kept unread, and what a
 * row says of a price that moved and of the owner's note.
 */
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { addLink, createLine, updateLink } from '@app/store/actions';
import { resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { setLineView, useLineViewStore } from '@app/store/lineViewStore';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { useUiStore } from '@shared/app/store/uiStore';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';

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

/** The pressable named so (a button, a sheet's row). */
function pressable(tree: ReactTestRenderer, label: string): ReactTestInstance {
  const found = tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  if (found.length === 0) throw new Error(`Nothing to press named « ${label} »`);
  return found[0]!;
}

async function press(tree: ReactTestRenderer, label: string): Promise<void> {
  await act(async () => {
    pressable(tree, label).props.onPress();
    jest.advanceTimersByTime(400);
  });
}

let mounted: ReactTestRenderer | null = null;
let ids: Record<string, string> = {};

async function boot(): Promise<ReactTestRenderer> {
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'lineview.sqlite' });
  writePreference('onboarded', true);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await act(async () => {
    const mode = createLine({ title: 'Mode' });
    const films = createLine({ title: 'Films' });
    // Added newest first: the collection's own order is the reverse of this.
    const pull = addLink('https://maille.fr/pull', { noteId: mode });
    updateLink(pull, { status: 'ready', title: 'Pull col roulé', kind: 'product', price: 89.9, currency: 'EUR', attributes: [{ label: 'Couleur', value: 'Marine' }] });
    const veste = addLink('https://atelier.fr/veste', { noteId: mode });
    updateLink(veste, { status: 'ready', title: 'Veste en laine', kind: 'product', price: 189, currency: 'EUR', attributes: [{ label: 'Couleur', value: 'Camel' }], comment: 'En M.\nVoir en boutique avant.' });
    // « Suivi des prix »'s fields, as the server writes them.
    updateLink(veste, { priceBefore: 215, priceChangedAt: Date.now() });
    updateLink(pull, { priceBefore: 79.9, priceChangedAt: Date.now() });
    const bonnet = addLink('https://maille.fr/bonnet', { noteId: mode });
    updateLink(bonnet, { status: 'skipped' });
    const echarpe = addLink('https://maille.fr/echarpe', { noteId: mode });
    updateLink(echarpe, { status: 'skipped' });
    const film = addLink('https://cinema.fr/film', { noteId: films });
    updateLink(film, { status: 'ready', title: 'Les Feux de septembre', kind: 'film' });
    const film2 = addLink('https://cinema.fr/film2', { noteId: films });
    updateLink(film2, { status: 'ready', title: 'Le Dernier Quai', kind: 'film' });
    ids = { mode, films, pull, veste, bonnet, echarpe };
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  mounted = tree;
  return tree;
}

async function openLine(id: string): Promise<void> {
  await act(async () => {
    (navigationRef.navigate as (...args: unknown[]) => void)('Line', { id });
    jest.advanceTimersByTime(400);
  });
}

afterEach(async () => {
  await act(async () => useSettingsStore.setState({ server: null, reading: null }));
});

describe('a collection’s order and filter', () => {
  it('says what is applied, orders by price, filters, and remembers it on this phone', async () => {
    const tree = await boot();
    await openLine(ids.mode!);
    expect(textOf(tree)).toContain('Tous les liens');
    expect(textOf(tree)).toContain('Ordre de la collection');
    const order = (): number[] => ['Veste en laine', 'Pull col roulé'].map(title => textOf(tree).indexOf(title));
    // Its own order: the newest added first.
    expect(order()[0]).toBeLessThan(order()[1]!);

    await press(tree, 'Ordre : Ordre de la collection');
    await press(tree, 'Prix croissant');
    expect(useLineViewStore.getState().views[ids.mode!]).toEqual({ sort: 'priceUp', filter: 'all', layout: 'list' });
    expect(readPreferences().lineViews).toEqual({ [ids.mode!]: { sort: 'priceUp', filter: 'all', layout: 'list' } });
    expect(order()[1]).toBeLessThan(order()[0]!);

    await press(tree, 'Liens affichés : Tous les liens');
    await press(tree, 'Non lus');
    expect(textOf(tree)).not.toContain('Veste en laine');
    expect(textOf(tree)).toContain('Bonnet');

    // Another collection keeps its own.
    await openLine(ids.films!);
    expect(textOf(tree)).toContain('Ordre de la collection');
  });

  it('says what a filter that keeps nothing looked for, and shows all again', async () => {
    const tree = await boot();
    await act(async () => setLineView(ids.films!, { sort: 'own', filter: 'priceDrop', layout: 'list' }));
    await openLine(ids.films!);
    expect(textOf(tree)).toContain('Aucun prix en baisse dans Films pour l’instant.');
    expect(textOf(tree)).not.toContain('Le Dernier Quai');
    await press(tree, 'Tout afficher');
    expect(textOf(tree)).toContain('Le Dernier Quai');
    expect(useLineViewStore.getState().views[ids.films!]).toBeUndefined();
  });
});

describe('a collection’s links kept unread', () => {
  it('offers to read them all while Claude can read, with what it costs, then sends them', async () => {
    const tree = await boot();
    await openLine(ids.mode!);
    // Nobody to read them: no offer.
    expect(textOf(tree)).not.toContain('Tout lire');
    await act(async () => {
      useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading: true, model: 'claude-sonnet-5-5' });
    });
    expect(textOf(tree)).toContain('2\u00a0liens gardés sans lecture · environ 0,04 $ pour tout lire');
    await press(tree, 'Tout lire');
    const { links } = useLibraryStore.getState();
    expect([links[ids.bonnet!]!.status, links[ids.echarpe!]!.status]).toEqual(['pending', 'pending']);
    expect(useUiStore.getState().snack).toMatchObject({ message: '2\u00a0liens envoyés en lecture', tone: 'success' });
    expect(textOf(tree)).not.toContain('Tout lire');
  });
});

describe('a link row', () => {
  it('says how much a price dropped beside it, and that one rose, heard in its name as on the link page', async () => {
    const tree = await boot();
    await openLine(ids.mode!);
    expect(textOf(tree)).toContain('26\u00a0€');
    expect(textOf(tree)).toContain('10\u00a0€');
    const row = tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Veste en laine') && typeof node.props.onPress === 'function')[0]!;
    // The link page's own sentence, which says since when.
    expect(row.props.accessibilityLabel).toContain('Avant 215\u00a0€ · en baisse aujourd’hui');
    expect(row.props.accessibilityLabel).toContain('Votre note : « En M. Voir en boutique avant. »');
  });

  it('shows the owner’s note in place of the facts, quoted, on one line', async () => {
    const tree = await boot();
    await openLine(ids.mode!);
    expect(textOf(tree)).toContain('« En M. Voir en boutique avant. »');
    expect(textOf(tree)).not.toContain('Camel');
    // The pull keeps its facts.
    expect(textOf(tree)).toContain('Marine');
  });
});

describe('a collection’s layouts', () => {
  it('shows its links as a gallery, a mosaic or a table from the head’s glyph, and remembers it', async () => {
    const tree = await boot();
    await openLine(ids.mode!);
    await press(tree, 'Affichage : Liste');
    expect(textOf(tree)).toContain('Les images en grand, pour comparer d’un coup d’œil');
    await press(tree, 'Galerie');
    expect(useLineViewStore.getState().views[ids.mode!]).toEqual({ sort: 'own', filter: 'all', layout: 'gallery' });
    // Each link a tile, named as its row is; a tile pressed opens the link's page.
    expect(pressable(tree, 'Veste en laine, atelier.fr, 189\u00a0€, Avant 215\u00a0€ · en baisse aujourd’hui, Votre note : « En M. Voir en boutique avant. »')).toBeTruthy();
    expect(textOf(tree)).toContain('Pull col roulé');

    await press(tree, 'Affichage : Galerie');
    await press(tree, 'Mosaïque');
    expect(textOf(tree)).toContain('89,90\u00a0€');

    await press(tree, 'Affichage : Mosaïque');
    await press(tree, 'Tableau');
    // A column for the fact its links carry, one for the owner's note.
    expect(textOf(tree)).toContain('Couleur');
    expect(textOf(tree)).toContain('Votre note');
    expect(textOf(tree)).toContain('Camel');
    // Its price's head orders it.
    await press(tree, 'Prix');
    expect(useLineViewStore.getState().views[ids.mode!]).toEqual({ sort: 'priceUp', filter: 'all', layout: 'table' });
    expect(readPreferences().lineViews).toEqual({ [ids.mode!]: { sort: 'priceUp', filter: 'all', layout: 'table' } });

    // Another collection keeps its own.
    await openLine(ids.films!);
    expect(pressable(tree, 'Affichage : Liste')).toBeTruthy();
  });
});
