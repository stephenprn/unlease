import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '../../test/library';
import { addLink, createLine, createNote } from '../../app/store/actions';
import { selectQuery, toggleSelected, useBoardStore } from '../../app/store/board';
import { setOnboarded } from '../../app/store/settings';
import { App } from '../App';
import { initHistory, navigate } from '../router';
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

/** Where the history stands: the page, the entry's index, and the page's index when something open holds the entry. */
const here = () => {
  const state = history.state as { index: number; base?: number } | null;
  return { path: location.pathname, index: state?.index, base: state?.base };
};

/** The browser's Back (jsdom moves through the history a task later). */
async function back(): Promise<void> {
  await act(async () => {
    history.back();
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}

/** Something open is drawn until its exit has played; gone means gone from the page. */
const shown = (role: 'dialog' | 'alertdialog' | 'toolbar', name: string) => screen.queryByRole(role, { name });

describe('Back closes what is open before it leaves the page', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
    // jsdom knows the `inert` attribute but not what it does: as in a browser, nothing under it takes focus
    // (React's commit would otherwise put focus back in a layer that is leaving).
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
      if (!this.closest('[inert]')) focus.call(this, options);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  describe('on a phone-sized window', () => {
    beforeEach(() => {
      phoneSized();
    });

    it('closes a sheet, playing its exit, and stays on the page', async () => {
      const user = userEvent.setup();
      open('/');
      render(<App />);
      await user.click(screen.getByRole('button', { name: 'Classer un lien' }));
      expect(shown('dialog', 'Classer un lien')).toBeInTheDocument();
      // Its own entry, above the page's, at the same address.
      await waitFor(() => expect(here()).toEqual({ path: '/', index: 1, base: 0 }));

      await back();
      expect(shown('dialog', 'Classer un lien')).not.toBeInTheDocument();
      // Still drawn, out of reach, while its exit plays.
      expect(document.querySelector('[data-state="closed"] [role="dialog"]')).not.toBeNull();
      expect(here()).toEqual({ path: '/', index: 0, base: undefined });
      await waitFor(() => expect(document.querySelector('[data-state="closed"]')).toBeNull());
    });

    it('gives the entry back when the sheet closes another way, so the next Back leaves the page', async () => {
      const user = userEvent.setup();
      open('/');
      render(<App />);
      act(() => navigate('/lines'));
      expect(here()).toEqual({ path: '/lines', index: 1, base: undefined });
      const bar = screen.getByRole('heading', { level: 1, name: 'Collections' }).closest('header')!;
      await user.click(within(bar).getByRole('button', { name: 'Nouvelle collection' }));
      await waitFor(() => expect(here().index).toBe(2));

      await user.keyboard('{Escape}');
      expect(shown('dialog', 'Nouvelle collection')).not.toBeInTheDocument();
      await waitFor(() => expect(here()).toEqual({ path: '/lines', index: 1, base: undefined }));

      await back();
      await waitFor(() => expect(here()).toEqual({ path: '/', index: 0, base: undefined }));
    });

    it('keeps the way of an action that closes the drawer and goes somewhere', async () => {
      const user = userEvent.setup();
      open('/');
      render(<App />);
      await user.click(screen.getByRole('button', { name: 'Menu' }));
      const drawer = screen.getByRole('dialog', { name: 'Navigation' });
      await waitFor(() => expect(here().index).toBe(1));

      await user.click(within(drawer).getByRole('link', { name: 'Réglages' }));
      // The drawer's entry is given back first: the settings take its place, one above the board.
      await waitFor(() => expect(here()).toEqual({ path: '/settings', index: 1, base: undefined }));
      expect(shown('dialog', 'Navigation')).not.toBeInTheDocument();

      await back();
      await waitFor(() => expect(here()).toEqual({ path: '/', index: 0, base: undefined }));
      expect(shown('dialog', 'Navigation')).not.toBeInTheDocument();
    });

    it('clears a selection, then ends a search, and only then leaves the board', async () => {
      const user = userEvent.setup();
      const id = createNote({ kind: 'text', title: 'Réparer le vélo' });
      open('/lines');
      render(<App />);
      act(() => navigate('/'));
      await user.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'vélo');
      await waitFor(() => expect(here()).toEqual({ path: '/', index: 2, base: 1 }));
      act(() => toggleSelected(id));
      expect(shown('toolbar', 'Notes sélectionnées')).toBeInTheDocument();
      await waitFor(() => expect(here()).toEqual({ path: '/', index: 3, base: 1 }));

      await back();
      expect(useBoardStore.getState().selection.size).toBe(0);
      expect(selectQuery(useBoardStore.getState())).toBe('vélo');

      await back();
      expect(selectQuery(useBoardStore.getState())).toBe('');
      expect(here()).toEqual({ path: '/', index: 1, base: undefined });

      await back();
      await waitFor(() => expect(here().path).toBe('/lines'));
    });

    it('ends a search from its back arrow, which gives its entry back', async () => {
      const user = userEvent.setup();
      open('/');
      render(<App />);
      const field = screen.getByRole('searchbox', { name: 'Rechercher' });
      await user.type(field, 'pain');
      await waitFor(() => expect(here().index).toBe(1));
      await user.click(screen.getByRole('button', { name: 'Fermer la recherche' }));
      expect(field).toHaveValue('');
      expect(field).not.toHaveFocus();
      await waitFor(() => expect(here()).toEqual({ path: '/', index: 0, base: undefined }));
      expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    });

    it('closes a picker over the note first, then the note', async () => {
      const user = userEvent.setup();
      createNote({ kind: 'text', title: 'Portail', body: '4512B' });
      open('/');
      render(<App />);
      await user.click(screen.getByRole('link', { name: 'Portail' }));
      const note = here();
      expect(note.path).toMatch(/^\/note\//);
      await user.click(screen.getByRole('button', { name: 'Couleur et papier' }));
      expect(shown('dialog', 'Couleur et papier')).toBeInTheDocument();
      await waitFor(() => expect(here().index).toBe(2));

      await back();
      expect(shown('dialog', 'Couleur et papier')).not.toBeInTheDocument();
      expect(here()).toEqual({ ...note, base: undefined });
      expect(screen.getByRole('textbox', { name: 'Titre' })).toHaveValue('Portail');

      await back();
      await waitFor(() => expect(here()).toEqual({ path: '/', index: 0, base: undefined }));
      await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Titre' })).not.toBeInTheDocument());
    });

    it('hands the entry a menu gave back to the sheet its item opened, rather than writing another', async () => {
      const user = userEvent.setup();
      const line = createLine({ id: 'line-mode', title: 'Mode' });
      createLine({ id: 'line-films', title: 'Films' });
      const link = addLink('https://www.atelier-nord.fr/veste', { noteId: line });
      open(`/line/${line}`);
      render(<App />);
      act(() => navigate(`/link/${link}`, { background: `/line/${line}` }));
      // A link nobody read is called by its address made readable, the same name as its row.
      const panel = screen.getByRole('dialog', { name: 'Veste' });
      await user.click(within(panel).getByRole('button', { name: 'Plus d’actions' }));
      await waitFor(() => expect(here().index).toBe(2));
      await user.click(screen.getByRole('menuitem', { name: 'Changer de collection' }));
      expect(shown('dialog', 'Changer de collection')).toBeInTheDocument();
      // The menu's entry is the sheet's now: no step back, no new entry.
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(here()).toEqual({ path: `/link/${link}`, index: 2, base: 1 });

      await back();
      expect(shown('dialog', 'Changer de collection')).not.toBeInTheDocument();
      expect(here()).toEqual({ path: `/link/${link}`, index: 1, base: undefined });
      expect(screen.getByRole('dialog', { name: 'Veste' })).toBeInTheDocument();
    });

    it('lets a menu’s item replace the page without leaving the menu’s entry behind', async () => {
      const user = userEvent.setup();
      const line = createLine({ id: 'line-mode', title: 'Mode' });
      open('/');
      render(<App />);
      act(() => navigate(`/line/${line}`));
      await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
      await waitFor(() => expect(here().index).toBe(2));
      await user.click(screen.getByRole('menuitem', { name: 'Supprimer la collection' }));
      // The collection is gone: Collections takes its entry, and Back goes where it was opened from.
      await waitFor(() => expect(here()).toEqual({ path: '/lines', index: 1, base: undefined }));
      await back();
      await waitFor(() => expect(here()).toEqual({ path: '/', index: 0, base: undefined }));
    });
  });

  it('steps off an entry left by a reload, so Back simply goes back', async () => {
    history.replaceState({ index: 0 }, '', '/lines');
    history.pushState({ index: 1 }, '', '/');
    // The drawer was open when the page was reloaded: nothing is open now.
    history.pushState({ index: 2, base: 1 }, '', '/');
    initHistory();
    render(<App />);
    await waitFor(() => expect(here()).toEqual({ path: '/', index: 1, base: undefined }));
    expect(shown('dialog', 'Navigation')).not.toBeInTheDocument();
    await back();
    await waitFor(() => expect(here().path).toBe('/lines'));
  });

  it('on a wide window too: Back closes a dialog, Escape still does, and with nothing open Back leaves', async () => {
    const user = userEvent.setup();
    open('/');
    render(<App />);
    await user.click(within(screen.getByRole('navigation', { name: 'Navigation' })).getByRole('link', { name: 'Réglages' }));
    expect(here()).toEqual({ path: '/settings', index: 1, base: undefined });

    await user.keyboard('k');
    expect(shown('dialog', 'Classer un lien')).toBeInTheDocument();
    await waitFor(() => expect(here().index).toBe(2));
    await back();
    expect(shown('dialog', 'Classer un lien')).not.toBeInTheDocument();
    expect(here()).toEqual({ path: '/settings', index: 1, base: undefined });

    await user.keyboard('k');
    expect(shown('dialog', 'Classer un lien')).toBeInTheDocument();
    await waitFor(() => expect(here().index).toBe(2));
    await user.keyboard('{Escape}');
    expect(shown('dialog', 'Classer un lien')).not.toBeInTheDocument();
    await waitFor(() => expect(here()).toEqual({ path: '/settings', index: 1, base: undefined }));

    await back();
    await waitFor(() => expect(here()).toEqual({ path: '/', index: 0, base: undefined }));
  });
});
