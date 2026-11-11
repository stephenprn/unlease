import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { shortcutGroups, shortcutTitles } from '@test/shortcuts';
import { setOnboarded } from '@shared/app/store/settings';
import { App } from '@shared/ui/App';
import { initHistory } from '@shared/ui/router';
import { emptyDraft } from '../../app/drafts';
import { saveContact } from '../../app/store/actions';
import { useContactsUi } from '../../app/store/contactsUi';
import { useContactsStore } from '../../app/store/library';

const person = (name: string): string => saveContact(null, emptyDraft(name), { since: null, typed: '' });

describe('Contacts’ keys', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  });

  it('lists a pick’s keys in the shortcuts dialog', async () => {
    const user = userEvent.setup();
    history.replaceState(null, '', '/contacts');
    initHistory();
    render(<App />);
    await user.keyboard('?');
    expect(shortcutTitles()).toEqual(['Partout', 'Contacts sélectionnés']);
    expect(shortcutGroups().get('Partout')).toContain('C Créer un contact');
    expect(shortcutGroups().get('Contacts sélectionnés')).toEqual(['# Supprimer', 'Maj+clic Sélectionner jusqu’à ce contact']);
  });

  // The selection bar's « Supprimer » says #: the key does what it says.
  it('sends what is picked to the bin on #, with its way back', async () => {
    const user = userEvent.setup();
    const lea = person('Léa Martin');
    const paul = person('Paul Martin');
    history.replaceState(null, '', '/contacts');
    initHistory();
    render(<App />);
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner Léa Martin' }));
    await user.keyboard('#');
    await waitFor(() => expect(useContactsStore.getState().contacts[lea]!.trashedAt).not.toBeNull());
    expect(useContactsStore.getState().contacts[paul]!.trashedAt).toBeNull();
    // The pick ends (its bar fades away).
    expect(useContactsUi.getState().selection.size).toBe(0);
    expect(await screen.findByText('Contact placé dans la corbeille')).toBeInTheDocument();
  });
});
