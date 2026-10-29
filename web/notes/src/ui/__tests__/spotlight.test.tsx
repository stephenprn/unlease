import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '../../test/library';
import { addLink, createLabel, createLine, createNote, updateLink } from '../../app/store/actions';
import { useLibraryStore } from '../../app/store/library';
import { createPage, insertBlock } from '../../app/store/pages';
import { setOnboarded } from '../../app/store/settings';
import { setShortcutsOpen } from '../../app/store/ui';
import { App } from '../App';
import { initHistory } from '../router';

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

/** The spotlight, opened with Ctrl+P (jsdom is no Mac). */
async function spotlight(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Control>}p{/Control}');
  const dialog = screen.getByRole('dialog', { name: 'Rechercher' });
  return { dialog, field: within(dialog).getByRole('combobox', { name: 'Rechercher' }) };
}

const options = (dialog: HTMLElement): string[] => within(dialog).queryAllByRole('option').map(option => option.textContent ?? '');

describe('the spotlight', () => {
  const scrolled = vi.fn();

  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
    scrolled.mockClear();
    // jsdom draws nothing, so it has no scrollIntoView.
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scrolled, configurable: true, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('opens on Ctrl+P instead of printing, titles first, and opens a page at the block that matched', async () => {
    const user = userEvent.setup();
    const lisbonne = createPage({ title: 'Lisbonne' });
    const portugal = createPage({ title: 'Portugal' });
    insertBlock(portugal, portugal, 0, { kind: 'h2', text: 'Itinéraire' });
    const day = insertBlock(portugal, portugal, 1, { kind: 'text', text: 'Une semaine à Lisbonne, puis Porto' });
    open('/');
    render(<App />);
    expect(fireEvent.keyDown(document.body, { key: 'p', ctrlKey: true })).toBe(false);
    const dialog = screen.getByRole('dialog', { name: 'Rechercher' });
    await user.type(within(dialog).getByRole('combobox', { name: 'Rechercher' }), 'lisbonne');
    const found = options(dialog);
    expect(found[0]).toMatch(/^Lisbonne/);
    expect(found[1]).toMatch(/^Portugal.*Une semaine à Lisbonne/);
    expect(within(dialog).getByText('Titres')).toBeInTheDocument();
    expect(within(dialog).getByText('Dans le contenu')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    // Why it matched: the words marked in the snippet.
    expect(within(within(dialog).getAllByRole('option')[1]!).getByText('Lisbonne', { selector: 'mark' })).toBeInTheDocument();
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(location.pathname).toBe(`/page/${portugal}`));
    // The page brings the block that matched into view.
    await waitFor(() => expect(scrolled.mock.contexts.some(element => (element as HTMLElement).dataset.selectBlock === day)).toBe(true));
    expect(lisbonne).toBeTruthy();
  });

  it('forgives a typo, and says the words are only close', async () => {
    const user = userEvent.setup();
    createNote({ kind: 'text', title: 'Recettes de grand-mère', body: 'Tarte aux pommes' });
    open('/');
    render(<App />);
    const { dialog, field } = await spotlight(user);
    await user.type(field, 'recete');
    expect(options(dialog)[0]).toMatch(/^Recettes de grand-mère/);
    expect(within(dialog).getByText('Aucun mot exact : voici les plus proches.')).toBeInTheDocument();
  });

  it('narrows to one type with Tab, counts each, and widens again when a filter hides everything', async () => {
    const user = userEvent.setup();
    createPage({ title: 'Jardin' });
    createNote({ kind: 'text', title: 'Jardin potager' });
    open('/');
    render(<App />);
    const { dialog, field } = await spotlight(user);
    await user.type(field, 'jardin');
    expect(within(dialog).getByRole('radio', { name: 'Tout 2' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Tab}');
    expect(within(dialog).getByRole('radio', { name: 'Pages 1' })).toHaveAttribute('aria-checked', 'true');
    expect(options(dialog).filter(option => option.startsWith('Jardin'))).toEqual([expect.stringMatching(/^JardinPage/)]);
    expect(field).toHaveFocus();
    await user.keyboard('{Tab}{Tab}{Tab}');
    expect(within(dialog).getByRole('radio', { name: 'Liens 0' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByText('Rien ne correspond à « jardin »')).toBeInTheDocument();
    const widen = within(dialog).getByRole('option', { name: /Chercher partout/ });
    expect(widen).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    expect(within(dialog).getByRole('radio', { name: 'Tout 2' })).toHaveAttribute('aria-checked', 'true');
  });

  it('filters by a label typed after #, which Backspace takes off again', async () => {
    const user = userEvent.setup();
    const travail = createLabel('Travail');
    createNote({ kind: 'text', title: 'Facture du client', labelIds: [travail] });
    createNote({ kind: 'text', title: 'Facture du garage' });
    open('/');
    render(<App />);
    const { dialog, field } = await spotlight(user);
    await user.type(field, '#trav');
    expect(options(dialog)[0]).toMatch(/^Travail/);
    await user.keyboard('{Enter}');
    expect(field).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: 'Retirer le filtre Travail' })).toBeInTheDocument();
    await user.type(field, 'facture');
    expect(options(dialog).filter(option => option.startsWith('Facture'))).toEqual([expect.stringMatching(/^Facture du client/)]);
    await user.clear(field);
    await user.keyboard('{Backspace}');
    expect(within(dialog).queryByRole('button', { name: 'Retirer le filtre Travail' })).not.toBeInTheDocument();
    await user.type(field, 'facture');
    expect(options(dialog).filter(option => option.startsWith('Facture'))).toHaveLength(2);
  });

  it('turns « #label » and a space into the filter, when a label has that name', async () => {
    const user = userEvent.setup();
    createLabel('Perso');
    open('/');
    render(<App />);
    const { dialog, field } = await spotlight(user);
    await user.type(field, '#perso ');
    expect(field).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: 'Retirer le filtre Perso' })).toBeInTheDocument();
  });

  it('finds a link by what Claude read and by its collection, and opens it over the page', async () => {
    const user = userEvent.setup();
    const films = createLine({ title: 'Films' });
    const dune = addLink('https://www.example.org/dune', { noteId: films });
    updateLink(dune, { status: 'ready', title: 'Dune : deuxième partie', kind: 'film', summary: 'Paul s’allie aux Fremen du désert.' });
    open('/');
    render(<App />);
    const { dialog, field } = await spotlight(user);
    await user.type(field, 'films fremen');
    expect(options(dialog)[0]).toMatch(/^Dune : deuxième partie.*Lien · Films/);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(location.pathname).toBe(`/link/${dune}`));
  });

  it('opens with what was opened lately and the ways to start something, and learns what was picked', async () => {
    const user = userEvent.setup();
    const older = createNote({ kind: 'text', title: 'Plan du jardin' }, Date.now() - 86_400_000);
    createNote({ kind: 'text', title: 'Plan de table' });
    const page = createPage({ title: 'Lectures' });
    open(`/page/${page}`);
    render(<App />);
    let { dialog, field } = await spotlight(user);
    expect(within(dialog).getByText('Récents')).toBeInTheDocument();
    expect(options(dialog)[0]).toMatch(/^Lectures/);
    expect(within(dialog).getByRole('option', { name: 'Nouvelle note' })).toBeInTheDocument();
    await user.type(field, 'plan');
    expect(options(dialog)[0]).toMatch(/^Plan de table/);
    await user.click(within(dialog).getByRole('option', { name: /^Plan du jardin/ }));
    await waitFor(() => expect(location.pathname).toBe(`/note/${older}`));
    act(() => history.back());
    await waitFor(() => expect(location.pathname).toBe(`/page/${page}`));
    ({ dialog, field } = await spotlight(user));
    await user.type(field, 'pla');
    expect(options(dialog)[0]).toMatch(/^Plan du jardin/);
  });

  it('runs an action, and offers to create what nothing is titled yet', async () => {
    const user = userEvent.setup();
    open('/');
    render(<App />);
    const { dialog, field } = await spotlight(user);
    await user.type(field, 'Voyage au Japon');
    expect(within(dialog).getByRole('option', { name: 'Créer la note « Voyage au Japon »' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('option', { name: 'Créer la page « Voyage au Japon »' }));
    await waitFor(() => expect(location.pathname).toMatch(/^\/page\//));
    const id = decodeURIComponent(location.pathname.slice('/page/'.length));
    expect(useLibraryStore.getState().blocks[id]?.text).toBe('Voyage au Japon');
    const again = await spotlight(user);
    await user.type(again.field, 'nouv not');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(location.pathname).toMatch(/^\/note\//));
  });

  it('shows a long group whole on « Afficher plus », the choice on what it uncovers, and short again for the next query', async () => {
    const user = userEvent.setup();
    for (let at = 1; at <= 10; at += 1) createNote({ kind: 'text', title: `Recette ${at}` });
    open('/');
    render(<App />);
    const { dialog, field } = await spotlight(user);
    await user.type(field, 'recette');
    const more = within(dialog).getByRole('option', { name: 'Afficher 2 de plus' });
    await user.click(more);
    expect(within(dialog).queryByRole('option', { name: /Afficher/ })).not.toBeInTheDocument();
    const titles = within(dialog).getAllByRole('option').filter(option => /^Recette \d/.test(option.textContent ?? ''));
    expect(titles).toHaveLength(10);
    expect(titles[8]).toHaveAttribute('aria-selected', 'true');
    expect(field).toHaveFocus();
    await user.type(field, 's');
    expect(within(dialog).getByRole('option', { name: 'Afficher 2 de plus' })).toBeInTheDocument();
  });

  it('opens a result in a new tab with Ctrl+Enter, staying open', async () => {
    const user = userEvent.setup();
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);
    const page = createPage({ title: 'Archives familiales' });
    open('/');
    render(<App />);
    const { dialog, field } = await spotlight(user);
    await user.type(field, 'archives');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(windowOpen).toHaveBeenCalledWith(`/page/${page}`, '_blank', 'noopener');
    expect(dialog).toBeInTheDocument();
  });

  it('never prints over another dialog, nor opens there', async () => {
    open('/');
    render(<App />);
    act(() => setShortcutsOpen(true));
    expect(fireEvent.keyDown(document.body, { key: 'p', ctrlKey: true })).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Rechercher' })).not.toBeInTheDocument();
  });
});
