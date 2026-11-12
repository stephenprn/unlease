/**
 * Contacts' root in the real app: a fresh install opens on the suite's first run with Contacts' brand
 * (a sibling's connection offered in one tap), an onboarded one on the list (its letters, its
 * favourites, its search), covered by « Activer Contacts » when the server does not run it;
 * `unlease-contacts://` links open a contact, the form, the favourites and a label.
 */
import { Linking } from 'react-native';
import { act, type ReactTestInstance } from 'react-test-renderer';
import type { NavigationState, PartialState } from '@react-navigation/native';

import { syncedTypes } from '@shared/app/store/library';
import { setServer, setServerApps, useSettingsStore } from '@shared/app/store/settingsStore';
import { createContact, createLabel, type ContactDraft } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { linking, listPath } from '@ui/navigation/RootNavigator';
import { navigationRef } from '@ui/navigation/navigationRef';
import { SettingsScroll } from '@shared/ui/features/settings/SettingsScroll';

import { state as suite, __reset as resetSuite } from '../../../../../shared/__mocks__/NativeSuiteLink';
import { answer, boot, fakeFetch, inputs, pressableWithText, pressables, SETTINGS, settle, textOf, unmountAll } from './harness';

jest.useFakeTimers();

/** The text inside one element (Réglages' scroll: the drawer under the list names the Administration too). */
function textIn(node: ReactTestInstance): string {
  return node.children.map(child => (typeof child === 'string' ? child : textIn(child))).join(' ');
}

const person = (firstName: string, lastName: string, more: Partial<ContactDraft> = {}): ContactDraft => ({
  firstName,
  lastName,
  company: '',
  jobTitle: '',
  phones: [],
  emails: [],
  addresses: [],
  birthday: null,
  labelIds: [],
  favorite: false,
  photoId: null,
  photoMime: '',
  photoUploaded: false,
  ...more,
});

/** The route a state leads to, nested or not. */
function leaf(state: PartialState<NavigationState> | NavigationState | undefined): { name: string; params?: object } | undefined {
  const route = state?.routes[state.index ?? state.routes.length - 1];
  return route?.state ? leaf(route.state) : (route as { name: string; params?: object } | undefined);
}

describe('Contacts, its root', () => {
  beforeEach(() => {
    resetSuite();
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => setServer(null));
  });

  afterAll(unmountAll);

  it('opens on the first run on a fresh install, a sibling’s connection offered in one tap', async () => {
    suite.siblings = [{ packageName: 'com.stephenprn.pages', server: 'https://suite.test', token: 'jeton', appearance: '', grain: '', locale: '' }];
    const tree = await boot({ onboarded: false });
    expect(navigationRef.getCurrentRoute()?.name).toBe('Setup');
    expect(suite.asked[0]).toEqual(['com.stephenprn.carnet', 'com.stephenprn.pages', 'com.stephenprn.agenda']);
    expect(textOf(tree)).toContain('Contacts');
    await act(async () => {
      pressables(tree, 'Utiliser la connexion de Pages')[0]!.props.onPress();
    });
    await settle();
    expect(useSettingsStore.getState().server).toEqual({ url: 'https://suite.test', token: 'jeton' });
    // The app's import is offered (« Vos données »), and can wait.
    expect(textOf(tree)).toContain('Vos données');
    await act(async () => {
      pressableWithText(tree, 'Plus tard').props.onPress();
    });
    await settle();
    await act(async () => {
      pressableWithText(tree, 'Commencer').props.onPress();
    });
    await settle();
    expect(useSettingsStore.getState().onboarded).toBe(true);
    expect(navigationRef.getCurrentRoute()?.name).toBe('Contacts');
  });

  it('lists everyone under their letter, the favourites above, and finds them by name or number', async () => {
    const tree = await boot({ onboarded: true });
    expect(textOf(tree)).toContain('Aucun contact pour l’instant');
    await act(async () => {
      createContact(person('Léa', 'Martin', { favorite: true, phones: [{ id: 'p1', number: '06 12 34 56 78', kind: 'mobile', label: '' }] }));
      createContact(person('Bruno', 'Petit'));
      createContact(person('Bérénice', 'Albert'));
    });
    const text = textOf(tree);
    expect(text).toContain('Favoris');
    expect(text).toContain('B');
    expect(text).toContain('L');
    expect(text.indexOf('Bruno Petit')).toBeLessThan(text.indexOf('Léa Martin'));
    expect(syncedTypes()).toEqual(['contact', 'contactLabel']);

    await act(async () => {
      inputs(tree, 'Rechercher')[0]!.props.onChangeText('0612');
    });
    expect(textOf(tree)).toMatch(/1\srésultat/);
    expect(textOf(tree)).toContain('Léa Martin');
    expect(textOf(tree)).not.toContain('Bruno Petit');
  });

  it('narrows the list to a label from the drawer’s place', async () => {
    let family = '';
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        family = createLabel('Famille');
        createContact(person('Paul', 'Durand', { labelIds: [family] }));
        createContact(person('Zoé', 'Roux'));
      },
    });
    await act(async () => {
      (navigationRef.navigate as (...args: unknown[]) => void)('Contacts', { label: family });
    });
    const text = textOf(tree);
    expect(text).toContain('Famille');
    expect(text).toContain('Paul Durand');
    expect(text).not.toContain('Zoé Roux');
  });

  it('says so when the server does not run Contacts, and turns it on there', async () => {
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        setServer({ url: 'https://suite.test', token: 'jeton' });
        setServerApps(['notes', 'pages']);
      },
    });
    expect(textOf(tree)).toContain('Contacts n’est pas activé sur ce serveur');
    global.fetch = jest.fn((input: string, init?: { method?: string; body?: string }) => {
      if (new URL(input).pathname === '/api/settings' && init?.method === 'PUT') return Promise.resolve(answer({ ...SETTINGS, apps: { enabled: JSON.parse(init.body!).apps } }));
      return fakeFetch(input);
    }) as unknown as typeof fetch;
    await act(async () => {
      pressableWithText(tree, 'Activer Contacts').props.onPress();
    });
    await settle();
    expect(useSettingsStore.getState().apps).toEqual(['notes', 'pages', 'contacts']);
  });

  it('keeps its look to itself, and sends it to the apps ticked from the slip that follows a change', async () => {
    // Carnet and Agenda are on this phone, Pages is not.
    jest.spyOn(Linking, 'canOpenURL').mockImplementation(async url => url.startsWith('carnet:') || url.startsWith('unlease-agenda:'));
    const tree = await boot({ onboarded: true });
    await act(async () => {
      (navigationRef.navigate as (...args: unknown[]) => void)('Settings');
    });
    await settle();
    // Réglages: the address book's own first, the look one row, the Administration last.
    const overview = textIn(tree.root.findByType(SettingsScroll));
    const order = ['Trier par', 'Anniversaires', 'Apparence', 'Langue', 'Données', 'Administration'].map(words => overview.indexOf(words));
    expect(order.every(at => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(overview).not.toContain('Palettes');
    // The row opens « Apparence »'s page: the theme there, the colours and the ground under it.
    await act(async () => {
      pressables(tree, 'Apparence')[0]!.props.onPress();
    });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Appearance');
    for (const words of ['Grain du papier', 'Palettes', 'Couleurs unies']) expect(textOf(tree)).toContain(words);
    await act(async () => {
      pressables(tree, 'Sombre')[0]!.props.onPress();
    });
    expect(useSettingsStore.getState()).toMatchObject({ theme: 'dark', lookOffer: null });
    await settle(1300);
    expect(textOf(tree)).toContain('Apparence changée dans Contacts');
    await act(async () => {
      pressableWithText(tree, 'Appliquer aux autres').props.onPress();
    });
    await settle();
    // Both ticked; Agenda left out, then Carnet alone gets it.
    expect(tree.root.findAll(node => node.props.accessibilityRole === 'checkbox' && node.props.accessibilityState?.checked === true && typeof node.props.onPress === 'function', { deep: false }).map(node => node.props.accessibilityLabel)).toEqual(['Carnet', 'Agenda']);
    await act(async () => {
      pressables(tree, 'Agenda').find(node => node.props.accessibilityRole === 'checkbox')!.props.onPress();
    });
    await act(async () => {
      pressableWithText(tree, 'Appliquer').props.onPress();
    });
    expect(useSettingsStore.getState().lookOffer).toMatchObject({ theme: 'dark', to: ['notes'] });
    expect(JSON.parse(suite.shared!.look)).toMatchObject({ theme: 'dark', to: ['notes'] });
    expect(textOf(tree)).toContain('Carnet prendra cette apparence à sa prochaine ouverture.');
  });

  it('reads unlease-contacts:// links: a contact, the form, the favourites, a label', async () => {
    expect(listPath('favorites')).toBe('?filter=favorites');
    expect(leaf(linking.getStateFromPath!('contact/abc', linking.config))).toMatchObject({ name: 'Contact', params: { id: 'abc' } });
    expect(leaf(linking.getStateFromPath!('new', linking.config))).toMatchObject({ name: 'Edit' });
    expect(leaf(linking.getStateFromPath!('new?phone=0612', linking.config))).toMatchObject({ name: 'Edit', params: { phone: '0612' } });
    expect(leaf(linking.getStateFromPath!('edit/abc', linking.config))).toMatchObject({ name: 'Edit', params: { id: 'abc' } });
    expect(leaf(linking.getStateFromPath!('favorites', linking.config))).toMatchObject({ name: 'Contacts', params: { filter: 'favorites' } });
    expect(leaf(linking.getStateFromPath!('label/xyz', linking.config))).toMatchObject({ name: 'Contacts', params: { label: 'xyz' } });
    expect(leaf(linking.getStateFromPath!('', linking.config))).toMatchObject({ name: 'Contacts' });
    // The launcher's shortcut « Rechercher »: the list, its search strip taking the keyboard.
    expect(leaf(linking.getStateFromPath!('search', linking.config))).toMatchObject({ name: 'Contacts', params: { capture: 'search' } });

    let id = '';
    jest.spyOn(Linking, 'getInitialURL').mockImplementation(async () => `unlease-contacts://contact/${id}`);
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        id = createContact(person('Inès', 'Moreau', { jobTitle: 'Architecte', company: 'Atelier Nord' }));
      },
    });
    expect(navigationRef.getCurrentRoute()).toMatchObject({ name: 'Contact', params: { id } });
    expect(textOf(tree)).toContain('Inès Moreau');
    expect(textOf(tree)).toContain('Architecte, Atelier Nord');
  });

  it('erases from Réglages › Données, its last row: the parts counted, the word typed, one batch', async () => {
    let lea = '';
    let paul = '';
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        lea = createContact(person('Léa', 'Martin'));
        paul = createContact(person('Paul', 'Roy', { favorite: true }));
      },
    });
    await act(async () => {
      (navigationRef.navigate as (...a: unknown[]) => void)('Settings');
    });
    await settle();
    await act(async () => {
      pressableWithText(tree, 'Effacer des données').props.onPress();
    });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Erase');
    const text = textOf(tree);
    expect(text).toContain('1\u00a0contact hors favoris');
    expect(text).toContain('1\u00a0contact en favori');
    // The favourites kept: their box unticked.
    await act(async () => {
      pressableWithText(tree, 'Favoris').props.onPress();
    });
    await act(async () => {
      inputs(tree, 'Pour confirmer, tapez SUPPRIMER')[0]!.props.onChangeText('SUPPRIMER');
    });
    await act(async () => {
      pressableWithText(tree, 'Effacer 1\u00a0élément').props.onPress();
    });
    await settle();
    const { contacts } = useLibraryStore.getState();
    expect(contacts[lea]!.deletedAt).not.toBeNull();
    expect(contacts[paul]!.deletedAt).toBeNull();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Contacts');
  });
});
