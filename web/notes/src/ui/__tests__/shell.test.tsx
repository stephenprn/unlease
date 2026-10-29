import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { freshLibrary } from '../../test/library';
import { createLabel, createLine, createNote } from '../../app/store/actions';
import { toggleSelected } from '../../app/store/board';
import { useLibraryStore } from '../../app/store/library';
import { useNavUiStore } from '../../app/store/navUi';
import { createPage } from '../../app/store/pages';
import { setOnboarded } from '../../app/store/settings';
import { useUiStore } from '../../app/store/ui';
import { App } from '../App';
import { initHistory } from '../router';
import { NARROW } from '../useMedia';

/** A phone-sized window: jsdom has no `matchMedia`, so the app reads as wide unless one is given. */
function phoneSized(): void {
  window.matchMedia = ((query: string) => ({
    matches: query === NARROW,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

const bottomBar = () => screen.queryByRole('button', { name: 'Nouvelle note' });

describe('the shell', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
  });

  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  describe('on a phone-sized window', () => {
    beforeEach(() => {
      phoneSized();
    });

    it('heads the board with the search strip and ends it with the capture bar', () => {
      open('/');
      render(<App />);
      expect(screen.getByRole('searchbox', { name: 'Rechercher' })).toHaveAttribute('placeholder', 'Rechercher notes et pages');
      expect(screen.queryByRole('button', { name: 'Retour' })).not.toBeInTheDocument();
      expect(bottomBar()).toBeInTheDocument();
    });

    it('gives every other page the phone’s top bar: Back, the title, no search, no capture bar', async () => {
      const user = userEvent.setup();
      open('/settings');
      render(<App />);
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Réglages' })).toBeInTheDocument();
      expect(bottomBar()).not.toBeInTheDocument();
      // Opened first in the tab, Back leads to the board rather than out of the app.
      await user.click(screen.getByRole('button', { name: 'Retour' }));
      expect(location.pathname).toBe('/');
      expect(screen.getByRole('searchbox', { name: 'Rechercher' })).toBeInTheDocument();
    });

    it('puts a page’s action in the top bar as a pebble', async () => {
      const user = userEvent.setup();
      open('/lines');
      render(<App />);
      const bar = screen.getByRole('heading', { level: 1, name: 'Collections' }).closest('header')!;
      await user.click(within(bar).getByRole('button', { name: 'Nouvelle collection' }));
      expect(useUiStore.getState().newLineOpen).toBe(true);
      expect(bottomBar()).not.toBeInTheDocument();
    });

    it('keeps the capture bar to the views the phone gives it', () => {
      open('/archive');
      render(<App />);
      expect(screen.getByRole('searchbox', { name: 'Rechercher' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Archives' })).toBeInTheDocument();
      expect(bottomBar()).not.toBeInTheDocument();
    });

    it('lays a collection’s Back over its head, which keeps its name and its actions', () => {
      const line = createLine({ id: 'line-mode', title: 'Mode' });
      open(`/line/${line}`);
      render(<App />);
      expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Mode' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Plus d’actions' })).toBeInTheDocument();
      expect(bottomBar()).not.toBeInTheDocument();
    });

    it('turns the strip into the phone’s search: Back where the menu was, and a full-size ×', async () => {
      const user = userEvent.setup();
      open('/');
      render(<App />);
      await user.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'pain');
      expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Effacer la recherche' })).not.toHaveClass('compact');
      await user.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
      expect(screen.getByRole('searchbox', { name: 'Rechercher' })).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
      await user.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'pain');
      await user.click(screen.getByRole('button', { name: 'Fermer la recherche' }));
      expect(screen.getByRole('searchbox', { name: 'Rechercher' })).toHaveValue('');
    });

    it('draws a dialog as the phone’s sheet, closed by its handle, the scrim and Back: no ×', async () => {
      const user = userEvent.setup();
      open('/');
      render(<App />);
      await user.click(screen.getByRole('button', { name: 'Classer un lien' }));
      const sheet = screen.getByRole('dialog', { name: 'Classer un lien' });
      expect(within(sheet).queryByRole('button', { name: 'Fermer' })).not.toBeInTheDocument();
    });

    it('sends the capture bar away while notes are picked, and brings it back after', async () => {
      const id = createNote({ kind: 'text', title: 'À ranger' });
      open('/');
      render(<App />);
      act(() => toggleSelected(id));
      await waitFor(() => expect(bottomBar()).not.toBeInTheDocument());
      act(() => toggleSelected(id));
      expect(bottomBar()).toBeInTheDocument();
    });
  });

  it('lays the selection bar over the strip and rests the chips where they are', async () => {
    createLine({ title: 'Restaurants', id: 'line-restos' });
    const id = createNote({ kind: 'text', title: 'À ranger' });
    open('/');
    render(<App />);
    act(() => toggleSelected(id));
    expect(screen.getByRole('toolbar', { name: 'Notes sélectionnées' })).toBeInTheDocument();
    // The chips stay, out of reach, and the strip waits under the bar.
    expect(screen.getByRole('navigation', { name: 'Collections' })).toHaveAttribute('inert');
    expect(screen.getByRole('searchbox', { name: 'Rechercher' }).closest('[inert]')).not.toBeNull();
    act(() => toggleSelected(id));
    expect(screen.getByRole('navigation', { name: 'Collections' })).not.toHaveAttribute('inert');
    // The bar fades off the strip before it goes.
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: 'Notes sélectionnées' })).not.toBeInTheDocument());
  });

  it('keeps the menu, a small × and the dialogs’ × on a wide window', async () => {
    const user = userEvent.setup();
    open('/');
    render(<App />);
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'pain');
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fermer la recherche' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Effacer la recherche' })).toHaveClass('compact');
    // The header's own (the bottom bar's is the phone's).
    await user.click(screen.getAllByRole('button', { name: 'Classer un lien' })[0]!);
    expect(within(screen.getByRole('dialog', { name: 'Classer un lien' })).getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
  });

  it('titles a page at the display size, under the search header, on a wide window', () => {
    open('/labels');
    render(<App />);
    expect(screen.getByRole('searchbox', { name: 'Rechercher' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Labels' })).toHaveClass('t-display');
    expect(screen.queryByRole('button', { name: 'Retour' })).not.toBeInTheDocument();
  });
});

describe('getting around', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
  });

  it('folds a navigation section on its title, remembers it, and keeps the foot in reach', async () => {
    const user = userEvent.setup();
    createLine({ title: 'Restaurants', id: 'line-restos' });
    open('/');
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Navigation' });
    const toggle = within(nav).getByRole('button', { name: 'Replier Collections' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(nav).getByRole('link', { name: 'Restaurants' })).toBeInTheDocument();
    await user.click(toggle);
    expect(within(nav).getByRole('button', { name: 'Déplier Collections' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(nav).queryByRole('link', { name: 'Restaurants' })).not.toBeInTheDocument();
    expect(useNavUiStore.getState().folded.has('collections')).toBe(true);
    for (const name of ['Archives', 'Corbeille', 'Réglages', 'Administration']) expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
  });

  it('goes anywhere by name with Ctrl+K, the spotlight', async () => {
    const user = userEvent.setup();
    const page = createPage({ title: 'Recettes' });
    open('/');
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    const dialog = screen.getByRole('dialog', { name: 'Rechercher' });
    await user.type(within(dialog).getByRole('combobox', { name: 'Rechercher' }), 'recet');
    expect(within(dialog).getByRole('option', { name: /Recettes/ })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    // The dialog closes (its history entry goes) before the page opens.
    await waitFor(() => expect(location.pathname).toBe(`/page/${page}`));
  });

  it('puts a label on every picked note from the selection bar, and takes it off all', async () => {
    const user = userEvent.setup();
    const travail = createLabel('Travail');
    const one = createNote({ kind: 'text', title: 'Un' });
    const two = createNote({ kind: 'text', title: 'Deux', labelIds: [travail] });
    open('/');
    render(<App />);
    act(() => {
      toggleSelected(one);
      toggleSelected(two);
    });
    await user.click(within(screen.getByRole('toolbar', { name: 'Notes sélectionnées' })).getByRole('button', { name: 'Labels' }));
    const box = screen.getByRole('checkbox', { name: /Travail/ });
    expect(box).toHaveAttribute('aria-checked', 'mixed');
    await user.click(box);
    expect(useLibraryStore.getState().notes[one]!.labelIds).toEqual([travail]);
    expect(screen.getByRole('checkbox', { name: /Travail/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('checkbox', { name: /Travail/ }));
    expect(useLibraryStore.getState().notes[one]!.labelIds).toEqual([]);
    expect(useLibraryStore.getState().notes[two]!.labelIds).toEqual([]);
  });
});
