/**
 * The screens of this round: « Doublons » merging a group (undone from the slip), a link to a merged
 * contact opening the one kept, and « Mentionné dans » listing the pages and notes that mention a
 * person, each opening in its app.
 */
import { Linking } from 'react-native';
import { act } from 'react-test-renderer';

import { setServer, setServerApps } from '@shared/app/store/settingsStore';
import { useUiStore } from '@shared/app/store/uiStore';
import { createContact, trashContacts, type ContactDraft } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { navigationRef } from '@ui/navigation/navigationRef';

import { answer, boot, fakeFetch, pressables, pressableWithText, settle, textOf, unmountAll } from './harness';

jest.useFakeTimers();

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

const go = async (...args: unknown[]): Promise<void> => {
  await act(async () => {
    (navigationRef.navigate as (...a: unknown[]) => void)(...args);
  });
  await settle();
};

describe('Contacts, across the suite', () => {
  beforeEach(() => {
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => setServer(null));
  });

  afterAll(unmountAll);

  it('merges duplicates, and opens a merged contact as the one kept', async () => {
    let keep = '';
    let other = '';
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        keep = createContact(person('Léa', 'Martin', { phones: [{ id: 'p1', number: '06 12 34 56 78', kind: 'mobile', label: '' }], company: 'Atelier Nord' }));
        other = createContact(person('Léa', 'Martin', { emails: [{ id: 'e1', address: 'lea@example.org', kind: 'home', label: '' }] }));
      },
    });
    await go('Duplicates');
    expect(textOf(tree)).toContain('Même nom');
    await act(async () => {
      pressableWithText(tree, 'Fusionner').props.onPress();
    });
    expect(useLibraryStore.getState().liveContacts).toEqual([keep]);
    expect(useUiStore.getState().snack?.message).toBe('Fusionnés en Léa Martin');
    expect(textOf(tree)).toContain('Aucun doublon');

    await go('Contact', { id: other });
    expect(textOf(tree)).toContain('Atelier Nord');
    expect(textOf(tree)).toContain('lea@example.org');
  });

  it('merges every group at once, in one batch the slip takes back', async () => {
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        createContact(person('Léa', 'Martin'));
        createContact(person('Léa', 'Martin'));
        createContact(person('Paul', 'Roux'));
        createContact(person('Paul', 'Roux'));
      },
    });
    await go('Duplicates');
    await act(async () => {
      pressables(tree, 'Tout fusionner')[0]!.props.onPress();
    });
    expect(useLibraryStore.getState().liveContacts).toHaveLength(2);
    expect(useUiStore.getState().snack).toMatchObject({ message: expect.stringMatching(/^2\scontacts fusionnés$/), tone: 'success' });
    await act(async () => {
      useUiStore.getState().snack!.action!.run();
    });
    expect(useLibraryStore.getState().liveContacts).toHaveLength(4);
  });

  it('keeps the bin as the web’s: a restore undone from the slip, a deletion asked and said, and a binned page that brings it back', async () => {
    let lea = '';
    let paul = '';
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        lea = createContact(person('Léa', 'Martin'));
        paul = createContact(person('Paul', 'Roux'));
        trashContacts([lea, paul]);
      },
    });
    await go('Trash');
    expect(textOf(tree)).toMatch(/Les contacts de la corbeille sont supprimés au bout de 7\sjours\./);
    await act(async () => {
      pressables(tree, 'Restaurer Léa Martin')[0]!.props.onPress();
    });
    expect(useLibraryStore.getState().contacts[lea]!.trashedAt).toBeNull();
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Contact restauré', tone: 'success' });
    await act(async () => {
      useUiStore.getState().snack!.action!.run();
    });
    expect(useLibraryStore.getState().contacts[lea]!.trashedAt).not.toBeNull();
    await act(async () => {
      pressables(tree, 'Supprimer définitivement Paul Roux')[0]!.props.onPress();
    });
    await settle();
    expect(textOf(tree)).toContain('Ce contact disparaîtra de tous vos appareils. Cette action est irréversible.');
    await act(async () => {
      pressableWithText(tree, 'Supprimer').props.onPress();
    });
    await settle();
    expect(useLibraryStore.getState().contacts[paul]!.deletedAt).not.toBeNull();
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Contact supprimé définitivement', tone: 'success' });

    // Léa's own page says she is in the bin, and brings her back.
    await go('Contact', { id: lea });
    expect(textOf(tree)).toContain('Ce contact est dans la corbeille.');
    await act(async () => {
      pressableWithText(tree, 'Restaurer').props.onPress();
    });
    expect(useLibraryStore.getState().contacts[lea]!.trashedAt).toBeNull();
    expect(useUiStore.getState().snack?.message).toBe('Contact restauré');
    // Live again, the star says what it did and takes it back.
    await settle();
    await act(async () => {
      pressables(tree, 'Ajouter aux favoris')[0]!.props.onPress();
    });
    expect(useLibraryStore.getState().contacts[lea]!.favorite).toBe(true);
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Ajouté aux favoris', tone: 'success' });
    await act(async () => {
      useUiStore.getState().snack!.action!.run();
    });
    expect(useLibraryStore.getState().contacts[lea]!.favorite).toBe(false);
  });

  it('lists where a person is mentioned, and opens each place in its app', async () => {
    let lea = '';
    const asked: string[] = [];
    global.fetch = jest.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === '/api/pages/mentions') {
        asked.push(`${url.pathname}?${url.searchParams.get('ids')}`);
        return answer({ places: [{ app: 'pages', type: 'page', id: 'page1', title: 'Voyage à Lisbonne', within: 'Vacances', icon: null, editedAt: 2 }] });
      }
      if (url.pathname === '/api/notes/mentions') return answer({ places: [{ app: 'notes', type: 'note', id: 'note1', title: '', within: '', icon: null, editedAt: 1 }] });
      return fakeFetch(input);
    }) as unknown as typeof fetch;
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        setServer({ url: 'https://suite.test', token: 'jeton' });
        setServerApps(['notes', 'pages', 'contacts']);
        lea = createContact(person('Léa', 'Martin'));
      },
    });
    await go('Contact', { id: lea });
    expect(asked).toEqual([`/api/pages/mentions?${lea}`]);
    expect(textOf(tree)).toContain('Mentionné dans');
    expect(textOf(tree)).toContain('Voyage à Lisbonne');
    expect(textOf(tree)).toContain('Sans titre');
    await act(async () => {
      pressableWithText(tree, 'Voyage à Lisbonne').props.onPress();
    });
    expect(Linking.openURL).toHaveBeenCalledWith('unlease-pages://page/page1');
  });
});
