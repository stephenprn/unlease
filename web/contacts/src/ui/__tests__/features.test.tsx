import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { getRecord } from '@shared/app/store/records';
import { setOnboarded, setServer, setServerApps } from '@shared/app/store/settings';
import { useUiStore } from '@shared/app/store/ui';
import { App } from '@shared/ui/App';
import { initHistory } from '@shared/ui/router';
import { emptyDraft } from '../../app/drafts';
import { saveContact } from '../../app/store/actions';
import { useContactsStore } from '../../app/store/library';
import { loadPrefs, usePrefsStore } from '../../app/store/prefs';

const state = () => useContactsStore.getState();
const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

function person(name: string, extra: Partial<ReturnType<typeof emptyDraft>> = {}): string {
  return saveContact(null, { ...emptyDraft(name), ...extra }, { since: null, typed: '' });
}

let entry = 0;
const email = (address: string) => [{ id: `e${(entry += 1)}`, address, kind: 'home', label: '' }];
const phone = (number: string) => [{ id: `p${(entry += 1)}`, number, kind: 'mobile', label: '' }];

/** The server's answers, by path; everything else is a 404. Every request kept. */
function serve(routes: Record<string, (init?: RequestInit) => Response>): { url: string; init?: RequestInit }[] {
  const requests: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      requests.push({ url: input, init });
      const path = new URL(input).pathname;
      const route = routes[path];
      return route ? route(init) : json({ error: 'not found' }, 404);
    }),
  );
  return requests;
}

beforeEach(async () => {
  await freshLibrary();
  setOnboarded();
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('duplicates', () => {
  it('shows each group with why, merges it in one batch, and the slip takes it back', async () => {
    const user = userEvent.setup();
    const kept = person('Léa Martin', { emails: email('lea@example.org'), phones: phone('06 12 34 56 78') });
    const twin = person('Léa M.', { emails: email('lea@example.org'), company: 'Atelier Nord' });
    person('Paul Durand');
    open('/contacts/duplicates');
    render(<App />);
    expect(screen.getByRole('link', { name: /Doublons/ })).toHaveTextContent('1');
    const group = screen.getByRole('group', { name: 'Même e-mail' });
    expect(within(group).getByText('Gardé')).toBeInTheDocument();
    await user.click(within(group).getByRole('button', { name: 'Fusionner' }));
    expect(state().contacts[kept]).toMatchObject({ company: 'Atelier Nord', trashedAt: null });
    expect(state().contacts[twin]).toMatchObject({ mergedInto: kept });
    expect(state().contacts[twin]!.trashedAt).not.toBeNull();
    // One batch: the kept one's new fields and the twin's share one clock.
    expect(getRecord('contact', kept)!.clocks.company).toBe(getRecord('contact', twin)!.clocks.mergedInto);
    expect(screen.getByText('Aucun doublon')).toBeInTheDocument();
    act(() => useUiStore.getState().snack!.action!.run());
    expect(state().contacts[twin]).toMatchObject({ mergedInto: null, trashedAt: null });
    expect(state().contacts[kept]!.company).toBe('');
  });

  it('sets a group aside on this device, for good', async () => {
    const user = userEvent.setup();
    const a = person('Léa Martin', { phones: phone('06 12 34 56 78') });
    const b = person('Léa Martin', { phones: phone('+33 6 12 34 56 78') });
    open('/contacts/duplicates');
    render(<App />);
    const group = screen.getByRole('group', { name: 'Même nom · même numéro' });
    await user.click(within(group).getByRole('button', { name: 'Ignorer' }));
    expect(screen.getByText('Aucun doublon')).toBeInTheDocument();
    expect(usePrefsStore.getState().dismissed).toEqual([[a, b].sort().join(',')]);
    loadPrefs();
    expect(usePrefsStore.getState().dismissed).toEqual([[a, b].sort().join(',')]);
  });

  it('opens the one kept from a contact merged into it', async () => {
    const kept = person('Léa Martin', { emails: email('lea@example.org') });
    const twin = person('Léa M.', { emails: email('lea@example.org') });
    open('/contacts/duplicates');
    const { unmount } = render(<App />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Fusionner' }));
    unmount();
    open(`/contacts/contact/${twin}`);
    render(<App />);
    await waitFor(() => expect(location.pathname).toBe(`/contacts/contact/${kept}`));
  });
});

describe('a contact’s page', () => {
  it('opens an address in Google Maps or OpenStreetMap, picked where it is shown', async () => {
    const user = userEvent.setup();
    const id = person('Léa Martin', { addresses: [{ id: 'a1', kind: 'home', label: '', street: '12 rue des Lilas', postalCode: '69003', city: 'Lyon', region: '', country: 'France' }] });
    open(`/contacts/contact/${id}`);
    render(<App />);
    expect(screen.getByRole('link', { name: 'Google Maps' }).getAttribute('href')).toBe('https://www.google.com/maps/search/?api=1&query=12%20rue%20des%20Lilas%2C%2069003%20Lyon%2C%20France');
    expect(screen.getByRole('link', { name: 'OpenStreetMap' }).getAttribute('href')).toMatch(/^https:\/\/www\.openstreetmap\.org\/search\?query=12%20rue/);
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    await user.click(screen.getByRole('button', { name: 'Itinéraire' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Itinéraire dans OpenStreetMap' }));
    expect(opened).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/www\.openstreetmap\.org\/directions\?to=12%20rue/), '_blank', 'noopener,noreferrer');
    opened.mockRestore();
  });

  it('keeps a gift idea in Carnet’s « Cadeaux » and says where', async () => {
    const user = userEvent.setup();
    const requests = serve({ '/api/notes/gifts': () => json({ collectionId: 'line-cadeaux', linkId: 'l1', existing: false, created: true }) });
    setServer({ url: 'https://unlease.test', token: 'jeton' });
    const id = person('Léa Martin');
    open(`/contacts/contact/${id}`);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Idée cadeau…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Idée cadeau' });
    const field = within(dialog).getByLabelText('Lien du produit');
    expect(within(dialog).getByRole('button', { name: 'Ajouter' })).toBeDisabled();
    await user.type(field, 'pas un lien');
    // Pressed, a link that is not a page's says why under the field, and nothing is sent.
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(within(dialog).getByText('Collez l’adresse d’une page web, qui commence par https://')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(requests.some(request => request.url.endsWith('/api/notes/gifts'))).toBe(false);
    await user.clear(field);
    await user.type(field, 'https://shop.example.org/livre');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(useUiStore.getState().snack?.message).toBe('Ajouté à Cadeaux dans Carnet'));
    const sent = requests.find(request => request.url.endsWith('/api/notes/gifts'))!;
    expect(JSON.parse(String(sent.init?.body))).toMatchObject({ url: 'https://shop.example.org/livre', forName: 'Léa Martin', lang: 'fr' });
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    act(() => useUiStore.getState().snack!.action!.run());
    expect(opened).toHaveBeenCalledWith('/notes/line/line-cadeaux', '_blank', 'noopener');
  });

  it('offers no gift idea without a server, nor when Carnet is off, and says why', async () => {
    const user = userEvent.setup();
    const id = person('Léa Martin');
    open(`/contacts/contact/${id}`);
    const { unmount } = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Idée cadeau…' }));
    expect(useUiStore.getState().snack?.message).toMatch(/connectez-en un dans les Réglages/);
    expect(screen.queryByRole('dialog', { name: 'Idée cadeau' })).toBeNull();
    unmount();
    serve({});
    setServer({ url: 'https://unlease.test', token: 'jeton' });
    setServerApps(['contacts', 'pages']);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Idée cadeau…' }));
    expect(useUiStore.getState().snack?.message).toMatch(/n’est pas activé sur ce serveur/);
  });

  it('lists where the person is mentioned, them and those merged into them, in the apps the server runs', async () => {
    const id = person('Léa Martin', { emails: email('lea@example.org') });
    const twin = person('Léa M.', { emails: email('lea@example.org') });
    const requests = serve({
      '/api/pages/mentions': () => json({ places: [{ app: 'pages', type: 'page', id: 'p1', title: 'Voyage', within: 'Vacances', icon: '✈️', editedAt: 2 }] }),
      '/api/notes/mentions': () => json({ places: [{ app: 'notes', type: 'note', id: 'n1', title: '', within: '', icon: null, editedAt: 1 }] }),
    });
    setServer({ url: 'https://unlease.test', token: 'jeton' });
    setServerApps(['notes', 'pages', 'contacts']);
    // The twin merged into Léa: its mentions are hers.
    act(() => {
      useContactsStore.setState(s => ({ contacts: { ...s.contacts, [twin]: { ...s.contacts[twin]!, mergedInto: id, trashedAt: 1 } } }));
    });
    open(`/contacts/contact/${id}`);
    render(<App />);
    const section = await screen.findByRole('region', { name: 'Mentionné dans' });
    const links = within(section).getAllByRole('link');
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/pages/p1', '/notes/note/n1']);
    expect(links[0]).toHaveTextContent('Voyage');
    expect(links[0]).toHaveTextContent('Vacances · Pages');
    expect(links[1]).toHaveTextContent('Note sans titre');
    const asked = requests.filter(request => request.url.includes('/mentions')).map(request => new URL(request.url).searchParams.get('ids'));
    expect(asked).toEqual([[id, twin].join(','), [id, twin].join(',')].map(ids => [id, ...ids.split(',').slice(1).sort()].join(',')));
  });
});
