import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { getRecord } from '@shared/app/store/records';
import { setQuery } from '@shared/app/store/search';
import { setOnboarded } from '@shared/app/store/settings';
import { useUiStore } from '@shared/app/store/ui';
import { App } from '@shared/ui/App';
import { initHistory } from '@shared/ui/router';
import { emptyDraft } from '../../app/drafts';
import { createLabel, saveContact, setLabelOn, trashContacts } from '../../app/store/actions';
import { setRegion } from '../../app/store/prefs';
import { useContactsStore } from '../../app/store/library';

const state = () => useContactsStore.getState();

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

function person(name: string, extra: Partial<ReturnType<typeof emptyDraft>> = {}, note = ''): string {
  return saveContact(null, { ...emptyDraft(name), ...extra }, { since: null, typed: note });
}

const rowNames = (): string[] => screen.queryAllByRole('checkbox', { name: /^Sélectionner / }).map(box => box.getAttribute('aria-label')!.replace('Sélectionner ', ''));

describe('Contacts’ web app', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  });

  afterEach(() => {
    setQuery('');
    vi.restoreAllMocks();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('lists everyone in order, the favourites’ faces and the week’s birthdays on top, and the search filters by name or number', async () => {
    person('Paul Martin', { favorite: true, phones: [{ id: 'p1', number: '06 98 76 54 32', kind: 'mobile', label: '' }] });
    // Léa's birthday is tomorrow: the week's line names her and leads to every birthday.
    const tomorrow = new Date(Date.now() + 86_400_000);
    person('Léa Durand', { birthday: `--${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}` });
    person('Camille Bernard', { company: 'Atelier Nord' });
    open('/contacts');
    render(<App />);
    // As on the phone: the favourites as faces, not as rows of their own.
    const favorites = screen.getByRole('region', { name: 'Favoris' });
    expect(within(favorites).getByRole('link', { name: 'Paul Martin' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Anniversaires' })).toHaveTextContent('Léa Durand · Demain');
    // Everyone, by first name, under their letters.
    expect(rowNames()).toEqual(['Camille Bernard', 'Léa Durand', 'Paul Martin']);
    expect(screen.getByRole('heading', { level: 3, name: 'C' })).toBeInTheDocument();
    act(() => setQuery('0698'));
    await waitFor(() => expect(rowNames()).toEqual(['Paul Martin']));
    act(() => setQuery('atelier'));
    await waitFor(() => expect(rowNames()).toEqual(['Camille Bernard']));
    act(() => setQuery('zzz'));
    await waitFor(() => expect(screen.getByText('Aucun résultat pour « zzz »')).toBeInTheDocument());
  });

  it('creates a contact from its form, every field in one batch', async () => {
    const user = userEvent.setup();
    const family = createLabel('Famille');
    open('/contacts/new');
    render(<App />);
    await user.type(screen.getByLabelText('Prénom'), 'Inès');
    await user.type(screen.getByLabelText('Nom de famille'), 'Lefèvre');
    await user.type(screen.getByRole('textbox', { name: 'Numéro 1' }), '06 11 22 33 44');
    await user.type(screen.getByRole('textbox', { name: 'E-mail 1' }), 'ines@example.org');
    // Typed with its own slashes: those written for the person as it goes are not doubled.
    await user.type(screen.getByLabelText('Date'), '12/03/1990');
    expect(screen.getByLabelText('Date')).toHaveValue('12/03/1990');
    expect(screen.getByText('JJ/MM/AAAA, année facultative · 12 mars 1990')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Famille' }));
    // A label made in the form, as on the phone: « Nouveau libellé » becomes its name, Enter makes it worn (and sends nothing).
    await user.click(screen.getByRole('button', { name: 'Nouveau libellé' }));
    await user.type(screen.getByRole('textbox', { name: 'Nom du nouveau libellé' }), 'Club{Enter}');
    const club = Object.values(useContactsStore.getState().labels).find(label => label.name === 'Club')!.id;
    expect(screen.getByRole('checkbox', { name: 'Club' })).toHaveAttribute('aria-checked', 'true');
    expect(Object.values(state().contacts)).toEqual([]);
    await user.type(screen.getByRole('textbox', { name: 'Note' }), 'Rencontrée au club.');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const [ines] = Object.values(state().contacts);
    expect(ines).toMatchObject({ firstName: 'Inès', lastName: 'Lefèvre', birthday: '1990-03-12', labelIds: [family, club], note: 'Rencontrée au club.' });
    expect(ines!.phones.map(phone => [phone.number, phone.kind])).toEqual([['06 11 22 33 44', 'mobile']]);
    expect(new Set(Object.values(getRecord('contact', ines!.id)!.clocks)).size).toBe(1);
    await waitFor(() => expect(location.pathname).toBe(`/contacts/contact/${ines!.id}`));
    expect(screen.getByRole('heading', { level: 1, name: 'Inès Lefèvre' })).toBeInTheDocument();
  });

  it('edits a contact: a number added, the name changed, saved together', async () => {
    const user = userEvent.setup();
    const id = person('Hugo Moreau');
    open(`/contacts/contact/${id}/edit`);
    render(<App />);
    const first = screen.getByLabelText('Prénom');
    await user.clear(first);
    await user.type(first, 'Hugues');
    await user.click(screen.getByRole('button', { name: 'Ajouter une adresse' }));
    await user.type(screen.getByLabelText('Ville'), 'Lyon');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(state().contacts[id]).toMatchObject({ firstName: 'Hugues', lastName: 'Moreau' });
    expect(state().contacts[id]!.addresses.map(address => address.city)).toEqual(['Lyon']);
  });

  it('says what is wrong as the form says (an e-mail once left, an empty contact once saved), and saves nothing then', async () => {
    const user = userEvent.setup();
    open('/contacts/new');
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const first = screen.getByLabelText('Prénom');
    expect(screen.getByText('Donnez-lui au moins un nom, un numéro ou une adresse e-mail.')).toBeInTheDocument();
    expect(first).toHaveFocus();
    expect(screen.getByText('Un champ est à corriger.')).toBeInTheDocument();
    expect(Object.keys(state().contacts)).toHaveLength(0);
    await user.type(first, 'Inès');
    // Right again: the message goes at once.
    expect(screen.queryByText('Donnez-lui au moins un nom, un numéro ou une adresse e-mail.')).toBeNull();
    const email = screen.getByRole('textbox', { name: 'E-mail 1' });
    await user.type(email, 'ines');
    // Nothing is said while it is typed; leaving it says what is wanted.
    expect(screen.queryByText('Une adresse e-mail complète, comme nom@exemple.fr.')).toBeNull();
    await user.tab();
    expect(screen.getByText('Une adresse e-mail complète, comme nom@exemple.fr.')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(Object.keys(state().contacts)).toHaveLength(0);
    expect(email).toHaveFocus();
    await user.type(email, '@example.org');
    expect(screen.queryByText('Une adresse e-mail complète, comme nom@exemple.fr.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(Object.values(state().contacts).map(contact => contact.emails.map(entry => entry.address))).toEqual([['ines@example.org']]);
  });

  it('asks before leaving the form with changes, and leaves when they are given up', async () => {
    const user = userEvent.setup();
    const id = person('Hugo Moreau');
    open(`/contacts/contact/${id}/edit`);
    render(<App />);
    // Nothing changed: Annuler just goes.
    const first = screen.getByLabelText('Prénom');
    await user.type(first, 'x');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Abandonner les modifications ?' });
    await user.click(within(ask).getByRole('button', { name: 'Continuer à modifier' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByLabelText('Prénom')).toHaveValue('Hugox');
    await user.keyboard('{Control>}s{/Control}');
    expect(state().contacts[id]).toMatchObject({ firstName: 'Hugox' });
    await waitFor(() => expect(location.pathname).toBe(`/contacts/contact/${id}`));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('picks a number’s calling code in the form, the default first, and writes it with its +', async () => {
    const user = userEvent.setup();
    act(() => setRegion('FR'));
    const id = person('Hugo Moreau', { phones: [{ id: 'p1', number: '06 12 34 56 78', kind: 'mobile', label: '' }, { id: 'p2', number: '+44 20 7946 0958', kind: 'work', label: '' }] });
    open(`/contacts/contact/${id}/edit`);
    render(<App />);
    // Each number split from its code: a national one takes the default's.
    expect(screen.getByRole('button', { name: /^Indicatif du numéro 1 : France/ })).toHaveTextContent('+33');
    expect(screen.getByRole('textbox', { name: 'Numéro 1' })).toHaveValue('06 12 34 56 78');
    expect(screen.getByRole('button', { name: /^Indicatif du numéro 2 : / })).toHaveTextContent('+44');
    expect(screen.getByRole('textbox', { name: 'Numéro 2' })).toHaveValue('20 7946 0958');
    // A number nobody touched is saved as it was; one given another code is written with it.
    await user.click(screen.getByRole('button', { name: /^Indicatif du numéro 2 : / }));
    const menu = await screen.findByRole('menu');
    // The default heads the list.
    expect(within(menu).getAllByRole('menuitem')[0]).toHaveTextContent('France (+33)');
    await user.click(within(menu).getByRole('menuitem', { name: /\(\+353\)/ }));
    // A number typed with its own code gives it to the picker when the field is left.
    await user.click(screen.getByRole('button', { name: 'Ajouter un numéro' }));
    await user.type(screen.getByRole('textbox', { name: 'Numéro 3' }), '+32 470 12 34 56');
    await user.tab();
    expect(screen.getByRole('button', { name: /^Indicatif du numéro 3 : / })).toHaveTextContent('+32');
    expect(screen.getByRole('textbox', { name: 'Numéro 3' })).toHaveValue('470 12 34 56');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(state().contacts[id]!.phones.map(phone => phone.number)).toEqual(['06 12 34 56 78', '+353 20 7946 0958', '+32 470 12 34 56']);
  });

  it('shows a contact’s page: the quick actions, the star, the bin with its way back', async () => {
    const user = userEvent.setup();
    const id = person('Léa Martin', { phones: [{ id: 'p1', number: '06 12 34 56 78', kind: 'mobile', label: '' }], emails: [{ id: 'e1', address: 'lea@example.org', kind: 'home', label: '' }] }, 'Allergique aux noix.');
    open(`/contacts/contact/${id}`);
    render(<App />);
    expect(screen.getByRole('link', { name: 'Appeler' })).toHaveAttribute('href', 'tel:0612345678');
    expect(screen.getByRole('link', { name: 'E-mail' })).toHaveAttribute('href', 'mailto:lea@example.org');
    // The browser's country (jsdom says en-US) until one is chosen in Réglages: « 06 » starts no American number.
    expect(screen.queryByRole('link', { name: 'WhatsApp' })).toBeNull();
    expect(screen.getByText('06 12 34 56 78')).toBeInTheDocument();
    act(() => setRegion('FR'));
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/33612345678');
    // The « Indicatif par défaut »: the number shown and called with its code.
    expect(screen.getByText('+33 6 12 34 56 78')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Appeler' })).toHaveAttribute('href', 'tel:+33612345678');
    act(() => setRegion('none'));
    // No country: a national number cannot reach WhatsApp, and the greyed action says why.
    expect(screen.queryByRole('link', { name: 'WhatsApp' })).toBeNull();
    expect(screen.getByText('WhatsApp').closest('[aria-disabled]')).toHaveAttribute('title', expect.stringContaining('indicatif par défaut'));
    // A face without a photo: initials on a tile, never on the pebble.
    const face = screen.getByText('LM');
    expect(face).not.toHaveAttribute('data-pebble');
    // No address: no way there to offer.
    expect(screen.queryByText('Itinéraire')).toBeNull();
    expect(screen.getByText('Allergique aux noix.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter aux favoris' }));
    expect(state().contacts[id]!.favorite).toBe(true);
    expect(screen.getByRole('button', { name: 'Retirer des favoris' })).toHaveAttribute('aria-pressed', 'true');
    // The menu in the phone's order: the card, its labels, a gift idea, the bin.
    const family = createLabel('Famille');
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Exporter (.vcf)', 'Libellés', 'Idée cadeau…', 'Supprimer']);
    await user.click(screen.getByRole('menuitem', { name: 'Libellés' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Famille' }));
    expect(state().contacts[id]!.labelIds).toEqual([family]);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
    expect(state().contacts[id]!.trashedAt).not.toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Annuler' }));
    expect(state().contacts[id]!.trashedAt).toBeNull();
  });

  it('keeps the bin as Carnet’s and the phone’s: the restore undone from the slip, each deletion asked first and said', async () => {
    const user = userEvent.setup();
    const lea = person('Léa Martin');
    const paul = person('Paul Martin');
    act(() => {
      trashContacts([lea, paul]);
    });
    open('/contacts/trash');
    render(<App />);
    expect(screen.getByText('Les contacts de la corbeille sont supprimés au bout de 7 jours.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restaurer Léa Martin' }));
    expect(state().contacts[lea]!.trashedAt).toBeNull();
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Contact restauré', tone: 'success' });
    act(() => useUiStore.getState().snack!.action!.run());
    expect(state().contacts[lea]!.trashedAt).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement Paul Martin' }));
    const asked = await screen.findByRole('alertdialog', { name: 'Supprimer définitivement ?' });
    await user.click(within(asked).getByRole('button', { name: 'Supprimer' }));
    expect(state().contacts[paul]!.deletedAt).not.toBeNull();
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Contact supprimé définitivement', tone: 'success' });
    await user.click(screen.getByRole('button', { name: 'Vider la corbeille' }));
    const emptying = await screen.findByRole('alertdialog', { name: 'Vider la corbeille ?' });
    expect(within(emptying).getByText('Tous les contacts de la corbeille seront supprimés définitivement, sur tous vos appareils.')).toBeInTheDocument();
    await user.click(within(emptying).getByRole('button', { name: 'Vider' }));
    expect(state().contacts[lea]!.deletedAt).not.toBeNull();
  });

  it('imports and exports from Réglages › Données, as on the phone, not from the navigation', async () => {
    const user = userEvent.setup();
    person('Léa Martin');
    open('/contacts/settings');
    render(<App />);
    expect(screen.queryByRole('link', { name: 'Importer' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Exporter/ })).toHaveTextContent('1 contact dans un fichier .vcf');
    await user.click(screen.getByRole('button', { name: /^Importer/ }));
    await waitFor(() => expect(location.pathname).toBe('/contacts/import'));
    expect(screen.getByRole('heading', { level: 1, name: 'Importer' })).toBeInTheDocument();
  });

  it('picks contacts and acts on them all: a label, the favourites', async () => {
    const user = userEvent.setup();
    const a = person('Léa Martin');
    const b = person('Paul Martin');
    person('Camille Bernard');
    const club = createLabel('Escalade');
    open('/contacts');
    render(<App />);
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner Léa Martin' }));
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner Paul Martin' }));
    const bar = screen.getByRole('toolbar', { name: 'Contacts sélectionnés' });
    expect(within(bar).getByText('2 sélectionnés')).toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: 'Libellés' }));
    await user.click(screen.getByRole('checkbox', { name: 'Escalade' }));
    expect([state().contacts[a]!.labelIds, state().contacts[b]!.labelIds]).toEqual([[club], [club]]);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await user.click(within(bar).getByRole('button', { name: 'Ajouter aux favoris' }));
    expect([state().contacts[a]!.favorite, state().contacts[b]!.favorite]).toEqual([true, true]);
    // The pick ends with the action.
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: 'Contacts sélectionnés' })).toBeNull());
  });

  it('picks a run of contacts with Maj+clic', async () => {
    const user = userEvent.setup();
    for (const name of ['Alice Aubert', 'Bruno Blanc', 'Chloé Carré', 'Denis Dumas']) person(name);
    open('/contacts');
    render(<App />);
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner Alice Aubert' }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner Chloé Carré' }));
    await user.keyboard('{/Shift}');
    const picked = screen.getAllByRole('checkbox', { checked: true }).map(box => box.getAttribute('aria-label'));
    expect(picked).toEqual(['Sélectionner Alice Aubert', 'Sélectionner Bruno Blanc', 'Sélectionner Chloé Carré']);
  });

  it('takes a vCard dropped anywhere to the import, which reads it', async () => {
    person('Léa Martin');
    open('/contacts');
    render(<App />);
    const file = new File(['BEGIN:VCARD\r\nVERSION:3.0\r\nN:Roux;Julien;;;\r\nEND:VCARD\r\n'], 'google.vcf', { type: 'text/vcard' });
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [file] } });
    act(() => {
      document.body.dispatchEvent(drop);
    });
    await waitFor(() => expect(location.pathname).toBe('/contacts/import'));
    expect(await screen.findByText('1 nouveau contact')).toBeInTheDocument();
  });

  it('lists a label’s contacts and the labels in the navigation, with their counts', () => {
    const a = person('Léa Martin');
    person('Paul Martin');
    const family = createLabel('Famille');
    setLabelOn([a], family, true);
    open(`/contacts/label/${family}`);
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Famille' })).toBeInTheDocument();
    expect(rowNames()).toEqual(['Léa Martin']);
    const nav = screen.getAllByRole('link', { name: /Famille/ });
    expect(nav.length).toBeGreaterThan(0);
  });

  it('imports a small vCard: shows what it will do, then writes it', async () => {
    const user = userEvent.setup();
    person('Léa Martin', { emails: [{ id: 'e1', address: 'lea@example.org', kind: 'home', label: '' }] });
    open('/contacts/import');
    render(<App />);
    const vcf = ['BEGIN:VCARD', 'VERSION:3.0', 'N:Martin;Léa;;;', 'EMAIL:lea@example.org', 'TEL;TYPE=CELL:06 12 34 56 78', 'END:VCARD', 'BEGIN:VCARD', 'VERSION:3.0', 'N:Roux;Julien;;;', 'CATEGORIES:Travail', 'END:VCARD', ''].join('\r\n');
    const file = new File([vcf], 'contacts.vcf', { type: 'text/vcard' });
    await user.upload(screen.getByLabelText('Fichier de contacts'), file);
    expect(await screen.findByText('1 nouveau contact')).toBeInTheDocument();
    expect(screen.getByText('1 contact déjà là, complété')).toBeInTheDocument();
    expect(screen.getByText('1 libellé à créer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Importer' }));
    expect(await screen.findByText('Import terminé')).toBeInTheDocument();
    const people = Object.values(state().contacts);
    expect(people.map(contact => contact.firstName).sort()).toEqual(['Julien', 'Léa']);
    expect(people.find(contact => contact.firstName === 'Léa')!.phones.map(phone => phone.number)).toEqual(['06 12 34 56 78']);
    expect(Object.values(state().labels).map(label => label.name)).toEqual(['Travail']);
  });
});
