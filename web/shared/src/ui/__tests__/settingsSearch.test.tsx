import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { createNote } from '@notes/app/store/actions';
import { setLocale } from '@unlease/core/i18n';
import { setOnboarded } from '../../app/store/settings';
import { setQuery } from '../../app/store/search';
import { App } from '../App';
import { initHistory, navigate } from '../router';

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

const options = (dialog: HTMLElement): string[] => within(dialog).queryAllByRole('option').map(option => option.textContent ?? '');

describe('the settings a search finds', () => {
  const scrolled = vi.fn();

  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
    scrolled.mockClear();
    // jsdom draws nothing, so it has no scrollIntoView.
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scrolled, configurable: true, writable: true });
  });

  afterEach(() => {
    setQuery('');
    setLocale('fr');
    vi.restoreAllMocks();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('in the spotlight: a group of their own after the titles, each saying where it is, opening Réglages on its section, on its page', async () => {
    const user = userEvent.setup();
    createNote({ kind: 'text', title: 'Grain de café' });
    open('/notes');
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    const dialog = screen.getByRole('dialog', { name: 'Rechercher' });
    await user.type(within(dialog).getByRole('combobox', { name: 'Rechercher' }), 'grain');
    const found = options(dialog);
    // The note titled so first, then the settings.
    expect(found[0]).toMatch(/^Grain de café/);
    expect(found[1]).toBe('Grain du papierRéglages › Apparence');
    expect(found[2]).toBe('Grain sur le fondRéglages › Apparence › Fond');
    expect(within(dialog).getByText('Réglages', { selector: 'p' })).toBeInTheDocument();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    // The look's sections are on « Apparence »'s own page.
    await waitFor(() => expect(`${location.pathname}${location.hash}`).toBe('/notes/settings/appearance#ground'));
    expect(screen.getByRole('heading', { level: 1, name: 'Apparence' })).toBeInTheDocument();
    await waitFor(() => expect(scrolled).toHaveBeenCalled());
    expect(scrolled.mock.contexts.at(-1)).toBe(document.getElementById('ground'));
  });

  it('takes an older address of a look’s section (`/notes/settings#colors`) on to « Apparence »’s page, and one of the overview’s back there', async () => {
    open('/notes/settings#colors');
    render(<App />);
    await waitFor(() => expect(`${location.pathname}${location.hash}`).toBe('/notes/settings/appearance#colors'));
    expect(screen.getByRole('heading', { level: 1, name: 'Apparence' })).toBeInTheDocument();
    await waitFor(() => expect(scrolled.mock.contexts.at(-1)).toBe(document.getElementById('colors')));
    // The way back is Réglages' row in the navigation, marked as where this page is.
    expect(within(screen.getByRole('navigation', { name: 'Navigation' })).getByRole('link', { name: 'Réglages' })).toHaveAttribute('aria-current', 'location');
    act(() => navigate('/notes/settings/appearance#language'));
    await waitFor(() => expect(`${location.pathname}${location.hash}`).toBe('/notes/settings#language'));
    expect(screen.getByRole('heading', { level: 1, name: 'Réglages' })).toBeInTheDocument();
    // Carnet's reminders were a section of their own: their address opens Réglages at its top, on Carnet's.
    act(() => navigate('/notes/settings#reminders'));
    await waitFor(() => expect(location.hash).toBe('#reminders'));
    expect(location.pathname).toBe('/notes/settings');
  });

  it('in the spotlight: an action already saying it stays alone, and nothing found is not said over a setting', async () => {
    const user = userEvent.setup();
    open('/notes');
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    const dialog = screen.getByRole('dialog', { name: 'Rechercher' });
    const field = within(dialog).getByRole('combobox', { name: 'Rechercher' });
    await user.type(field, 'raccourcis');
    expect(options(dialog).filter(option => option.startsWith('Raccourcis'))).toEqual(['Raccourcis clavier']);
    expect(within(dialog).queryByText('Réglages', { selector: 'p' })).not.toBeInTheDocument();
    await user.clear(field);
    await user.type(field, 'budget');
    expect(options(dialog)[0]).toBe('Budget mensuelAdministration › Claude');
    expect(within(dialog).queryByText(/Rien ne correspond/)).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(location.pathname).toBe('/notes/admin/reading'));
  });

  it('on the home, above the results: three at most until « Tout voir », in the interface’s language, opening the place', async () => {
    const user = userEvent.setup();
    open('/notes');
    render(<App />);
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'fond');
    const group = screen.getByRole('region', { name: 'Réglages' });
    expect(within(group).getAllByRole('link').map(link => link.textContent)).toEqual(['FondRéglages › Apparence', 'Grain sur le fondRéglages › Apparence › Fond', 'Habiller vos autres servicesRéglages › Apparence › Fond']);
    expect(within(group).getAllByRole('link')[0]).toHaveAttribute('href', '/notes/settings/appearance#ground');
    // The words that found it, marked.
    expect(within(group).getAllByText('Fond', { selector: 'mark' }).length).toBeGreaterThan(0);
    await user.clear(screen.getByRole('searchbox', { name: 'Rechercher' }));
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'données');
    const data = screen.getByRole('region', { name: 'Réglages' });
    expect(within(data).getAllByRole('link')).toHaveLength(3);
    await user.click(within(data).getByRole('button', { name: 'Tous les réglages trouvés' }));
    expect(within(data).getAllByRole('link').length).toBeGreaterThan(3);
    expect(within(data).queryByRole('button', { name: 'Tous les réglages trouvés' })).not.toBeInTheDocument();
    await user.click(within(data).getByRole('link', { name: /Nettoyer les liens enregistrés/ }));
    await waitFor(() => expect(`${location.pathname}${location.hash}`).toBe('/notes/settings#data'));
  });

  it('on the home, says nothing when no setting answers, and reads the English too', async () => {
    const user = userEvent.setup();
    open('/notes');
    render(<App />);
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'lisbonne');
    expect(screen.queryByRole('region', { name: 'Réglages' })).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Rechercher' }));
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'background');
    expect(within(screen.getByRole('region', { name: 'Réglages' })).getAllByRole('link')[0]).toHaveTextContent('Fond');
  });
});
