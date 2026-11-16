import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { setOnboarded } from '@shared/app/store/settings';
import { App } from '@shared/ui/App';
import { initHistory } from '@shared/ui/router';
import { emptyDraft } from '../../app/drafts';
import { saveContact } from '../../app/store/actions';
import { useContactsUi } from '../../app/store/contactsUi';
import { useContactsStore } from '../../app/store/library';

const state = () => useContactsStore.getState();

function person(name: string, extra: Partial<ReturnType<typeof emptyDraft>> = {}): string {
  return saveContact(null, { ...emptyDraft(name), ...extra }, { since: null, typed: '' });
}

function openFavorites(): void {
  history.replaceState(null, '', '/contacts/favorites');
  initHistory();
  render(<App />);
}

describe('Contacts’ favourites', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  });

  it('shows the favourites as cards, no letters: the face, the name, one quiet line and the ways to reach them', () => {
    const camille = person('Camille Durand', {
      favorite: true,
      jobTitle: 'Architecte',
      company: 'Atelier Nord',
      phones: [{ id: 'p1', number: '+33 6 12 34 56 78', kind: 'mobile', label: '' }],
      emails: [{ id: 'e1', address: 'camille@example.org', kind: 'work', label: '' }],
    });
    person('Paul Martin', { favorite: true, phones: [{ id: 'p2', number: '+33 6 98 76 54 32', kind: 'mobile', label: '' }] });
    person('Léa Bernard');
    openFavorites();
    // Cards, not the list: no letter heads them, no table of columns.
    expect(screen.queryAllByRole('heading', { level: 3 })).toEqual([]);
    expect(screen.queryByText('Nom')).toBeNull();
    const cards = within(screen.getByRole('list', { name: 'Favoris' })).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    // The card opens the contact; its line says what they do, else their number.
    expect(screen.getByRole('link', { name: 'Camille Durand, Architecte, Atelier Nord' })).toHaveAttribute('href', `/contacts/contact/${camille}`);
    expect(screen.getByRole('link', { name: 'Paul Martin, +33 6 98 76 54 32' })).toBeInTheDocument();
    // The ways to reach them, as links; no SMS away from a finger.
    const ways = within(cards[0]!).getByRole('navigation', { name: 'Contacter Camille Durand' });
    expect(within(ways).getByRole('link', { name: 'Appeler Camille Durand' })).toHaveAttribute('href', 'tel:+33612345678');
    expect(within(ways).getByRole('link', { name: 'WhatsApp avec Camille Durand' })).toHaveAttribute('href', expect.stringContaining('33612345678'));
    expect(within(ways).getByRole('link', { name: 'Écrire un e-mail à Camille Durand' })).toHaveAttribute('href', 'mailto:camille@example.org');
    expect(within(ways).queryByRole('link', { name: /SMS/ })).toBeNull();
    // Paul has no e-mail: no way to write one.
    expect(within(cards[1]!).queryByRole('link', { name: /e-mail/ })).toBeNull();
  });

  it('picks cards by their pebble, then by a click while a pick is on, and the bar acts on them', async () => {
    const user = userEvent.setup();
    const lea = person('Léa Martin', { favorite: true });
    const paul = person('Paul Martin', { favorite: true });
    openFavorites();
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner Léa Martin' }));
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Léa Martin' })).toHaveAttribute('aria-checked', 'true');
    // While a pick is on, the card itself picks rather than opening.
    await user.click(screen.getByRole('link', { name: 'Paul Martin' }));
    expect(location.pathname).toBe('/contacts/favorites');
    expect([...useContactsUi.getState().selection].sort()).toEqual([lea, paul].sort());
    const bar = screen.getByRole('toolbar', { name: 'Contacts sélectionnés' });
    await user.click(within(bar).getByRole('button', { name: 'Retirer des favoris' }));
    expect([state().contacts[lea]!.favorite, state().contacts[paul]!.favorite]).toEqual([false, false]);
    expect(await screen.findByText('Aucun favori')).toBeInTheDocument();
  });

  it('opens the contact from its card', async () => {
    const user = userEvent.setup();
    const lea = person('Léa Martin', { favorite: true });
    openFavorites();
    await user.click(screen.getByRole('link', { name: 'Léa Martin' }));
    await waitFor(() => expect(location.pathname).toBe(`/contacts/contact/${lea}`));
  });
});
