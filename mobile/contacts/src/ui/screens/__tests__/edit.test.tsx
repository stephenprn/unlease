/**
 * Creating and editing a contact through its form: « Enregistrer » writes one batch (every field
 * under one clock), an edit writes only what changed; the star makes a favourite, which the list
 * shows above everyone; a shared card opens the import, which writes its labels and contacts in one
 * batch; another app's « Créer un contact » opens the form filled, kept only once saved.
 */
import { Linking } from 'react-native';
import { act } from 'react-test-renderer';

import { createLabel } from '@app/store/actions';
import { getRecord, useLibraryStore } from '@app/store/libraryStore';
import { navigationRef } from '@ui/navigation/navigationRef';

import { __queueShare, __reset as resetIntake, state as intake } from '../../../../../shared/__mocks__/NativeIntake';
import { HANDED_CONTACT } from '@platform/intake';
import { state as media, __reset as resetMedia } from '../../../../../shared/__mocks__/NativeMedia';
import { state as mapApps, __reset as resetMapApps } from '../../../../../shared/__mocks__/NativeMapApps';
import { boot, fakeFetch, inputs, pressableWithText, pressables, settle, textOf, unmountAll } from './harness';

jest.useFakeTimers();

const go = async (...args: unknown[]): Promise<void> => {
  await act(async () => {
    (navigationRef.navigate as (...a: unknown[]) => void)(...args);
  });
  await settle();
};

const type = async (tree: Parameters<typeof inputs>[0], label: string, text: string): Promise<void> => {
  await act(async () => {
    inputs(tree, label)[0]!.props.onChangeText(text);
  });
};

/** The clocks of a record's fields, as written. */
const clocks = (id: string): Record<string, string> => (getRecord('contact', id)?.clocks ?? {}) as Record<string, string>;

describe('Contacts, its form', () => {
  beforeEach(() => {
    resetIntake();
    resetMedia();
    resetMapApps();
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterAll(unmountAll);

  it('creates a contact in one batch, edits only what changed, and stars it', async () => {
    const tree = await boot({ onboarded: true });
    await go('Edit');
    await type(tree, 'Prénom', 'Camille');
    await type(tree, 'Nom de famille', 'Lefèvre');
    await type(tree, 'Numéro', '06 11 22 33 44');
    await type(tree, 'Anniversaire', '14/07/1989');
    await act(async () => {
      pressableWithText(tree, 'Enregistrer').props.onPress();
    });
    await settle();

    const route = navigationRef.getCurrentRoute();
    expect(route?.name).toBe('Contact');
    const id = (route?.params as { id: string }).id;
    const contact = useLibraryStore.getState().contacts[id]!;
    expect(contact).toMatchObject({ firstName: 'Camille', lastName: 'Lefèvre', birthday: '1989-07-14', favorite: false });
    // A new number takes the « Indicatif par défaut » (the phone's, fr-FR here), written with its +.
    expect(contact.phones).toEqual([expect.objectContaining({ number: '+33 6 11 22 33 44', kind: 'mobile' })]);
    // One user action, one batch: every field shares one clock.
    const created = clocks(id);
    expect(new Set(Object.values(created)).size).toBe(1);
    expect(textOf(tree)).toContain('Camille Lefèvre');

    await go('Edit', { id });
    await type(tree, 'Entreprise', 'Atelier Nord');
    await act(async () => {
      pressableWithText(tree, 'Enregistrer').props.onPress();
    });
    await settle();
    const edited = clocks(id);
    expect(useLibraryStore.getState().contacts[id]!.company).toBe('Atelier Nord');
    expect(edited.company).not.toBe(created.company);
    expect(edited.firstName).toBe(created.firstName);
    expect(edited.phones).toBe(created.phones);

    await go('Contact', { id });
    await act(async () => {
      pressables(tree, 'Ajouter aux favoris')[0]!.props.onPress();
    });
    expect(useLibraryStore.getState().contacts[id]!.favorite).toBe(true);
    await go('Contacts');
    expect(textOf(tree)).toContain('Favoris');
  });

  it('splits a number from its calling code, keeps one nobody touched, and writes a code picked with its +', async () => {
    const tree = await boot({ onboarded: true });
    await go('Edit');
    await type(tree, 'Prénom', 'Inès');
    await type(tree, 'Numéro', '06 12 34 56 78');
    await act(async () => {
      pressableWithText(tree, 'Enregistrer').props.onPress();
    });
    await settle();
    const id = (navigationRef.getCurrentRoute()?.params as { id: string }).id;
    // The page shows it with its code.
    expect(textOf(tree)).toContain('+33 6 12 34 56 78');

    await go('Edit', { id });
    expect(pressables(tree, 'Indicatif : France (+33)')).toHaveLength(1);
    expect(inputs(tree, 'Numéro')[0]!.props.value).toBe('6 12 34 56 78');
    await type(tree, 'Entreprise', 'Atelier Nord');
    await act(async () => {
      pressableWithText(tree, 'Enregistrer').props.onPress();
    });
    await settle();
    expect(useLibraryStore.getState().contacts[id]!.phones.map(phone => phone.number)).toEqual(['+33 6 12 34 56 78']);

    // Another code, picked in its sheet: the number is written with it.
    await go('Edit', { id });
    await act(async () => {
      pressables(tree, 'Indicatif : France (+33)')[0]!.props.onPress();
    });
    await settle();
    await act(async () => {
      pressableWithText(tree, 'Belgique (+32)').props.onPress();
    });
    await settle();
    expect(pressables(tree, 'Indicatif : Belgique (+32)')).toHaveLength(1);
    await act(async () => {
      pressableWithText(tree, 'Enregistrer').props.onPress();
    });
    await settle();
    expect(useLibraryStore.getState().contacts[id]!.phones.map(phone => phone.number)).toEqual(['+32 6 12 34 56 78']);
  });

  it('writes the birthday’s separators as it is typed, and wears a label made in the form', async () => {
    const tree = await boot({ onboarded: true });
    await go('Edit');
    await type(tree, 'Prénom', 'Lou');
    const birthday = () => inputs(tree, 'Anniversaire')[0]!;
    expect(birthday().props.keyboardType).toBe('number-pad');
    // Key by key: two digits of the day bring their slash, a backspace over it takes the digit too.
    for (const key of ['2', '7', '0', '3']) {
      await act(async () => {
        birthday().props.onChangeText(`${birthday().props.value as string}${key}`);
      });
    }
    expect(birthday().props.value).toBe('27/03/');
    await act(async () => {
      birthday().props.onChangeText('27/03');
    });
    expect(birthday().props.value).toBe('27/0');
    await act(async () => {
      birthday().props.onChangeText('27/03');
    });
    await act(async () => {
      birthday().props.onBlur({});
    });
    expect(birthday().props.value).toBe('27/03');

    // « Nouveau libellé » names one in place; it is worn at once.
    await act(async () => {
      pressables(tree, 'Nouveau libellé')[0]!.props.onPress();
    });
    await act(async () => {
      inputs(tree, 'Nom du nouveau libellé')[0]!.props.onChangeText('Voisins');
    });
    await act(async () => {
      inputs(tree, 'Nom du nouveau libellé')[0]!.props.onSubmitEditing();
    });
    expect(pressables(tree, 'Voisins')[0]!.props.accessibilityState).toEqual({ checked: true });
    await act(async () => {
      pressableWithText(tree, 'Enregistrer').props.onPress();
    });
    await settle();
    const id = (navigationRef.getCurrentRoute()?.params as { id: string }).id;
    const { contacts, labels } = useLibraryStore.getState();
    expect(contacts[id]!.birthday).toBe('--03-27');
    expect(contacts[id]!.labelIds.map(label => labels[label]?.name)).toEqual(['Voisins']);
  });

  it('keeps an address typed in its parts, and opens it where the person picks: once, then for good', async () => {
    mapApps.apps = [{ packageName: 'com.google.android.apps.maps', label: 'Google Maps', icon: '' }];
    const tree = await boot({ onboarded: true });
    await go('Edit');
    await type(tree, 'Prénom', 'Paul');
    await act(async () => {
      pressableWithText(tree, 'Ajouter une adresse').props.onPress();
    });
    // The address just added opens the place search: the words typed are kept as written (Enter).
    await type(tree, 'Rue', '12 rue des Lilas');
    await act(async () => {
      inputs(tree, 'Rue')[0]!.props.onSubmitEditing();
    });
    expect(inputs(tree, 'Rue')).toHaveLength(0);
    await type(tree, 'Complément', 'Bâtiment B');
    await type(tree, 'Code postal', '69003');
    await type(tree, 'Ville', 'Lyon');
    await type(tree, 'Pays', 'France');
    await act(async () => {
      pressableWithText(tree, 'Enregistrer').props.onPress();
    });
    await settle();
    const id = (navigationRef.getCurrentRoute()?.params as { id: string }).id;
    expect(useLibraryStore.getState().contacts[id]!.addresses).toEqual([expect.objectContaining({ street: '12 rue des Lilas\nBâtiment B', postalCode: '69003', city: 'Lyon', country: 'France' })]);
    expect(textOf(tree)).toContain('12 rue des Lilas');
    // Nothing chosen: the phone's maps apps are offered, with OpenStreetMap in the browser.
    await act(async () => {
      pressables(tree, 'Ouvrir l’adresse')[0]!.props.onPress();
    });
    await settle();
    await act(async () => {
      pressables(tree, 'OpenStreetMap')[0]!.props.onPress();
    });
    expect(Linking.openURL).toHaveBeenLastCalledWith(expect.stringMatching(/^https:\/\/www\.openstreetmap\.org\/search\?query=12%20rue%20des%20Lilas/));
    expect(mapApps.opened).toEqual([]);
    // The way there, in Google Maps' own route, kept for the next time.
    await act(async () => {
      pressables(tree, 'Itinéraire')[0]!.props.onPress();
    });
    await settle();
    await act(async () => {
      pressables(tree, 'Toujours utiliser ce choix')[0]!.props.onPress();
    });
    await act(async () => {
      pressables(tree, 'Google Maps')[0]!.props.onPress();
    });
    await settle();
    expect(mapApps.opened).toEqual([{ uri: expect.stringMatching(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=12%20rue/), packageName: 'com.google.android.apps.maps' }]);
    // From now on the card says where it opens, and goes there at once.
    await act(async () => {
      pressables(tree, 'Ouvrir dans Google Maps')[0]!.props.onPress();
    });
    expect(mapApps.opened[1]).toEqual({ uri: expect.stringMatching(/^geo:0,0\?q=12%20rue%20des%20Lilas/), packageName: 'com.google.android.apps.maps' });
  });

  it('says an empty contact is empty, under its first name, and writes nothing', async () => {
    const tree = await boot({ onboarded: true });
    await go('Edit');
    await type(tree, 'Numéro', '  ');
    await act(async () => {
      pressableWithText(tree, 'Enregistrer').props.onPress();
    });
    await settle();
    expect(useLibraryStore.getState().liveContacts).toEqual([]);
    expect(navigationRef.getCurrentRoute()?.name).toBe('Edit');
    expect(textOf(tree)).toContain('Donnez-lui au moins un nom, un numéro ou une adresse e-mail.');
    expect(textOf(tree)).toContain('Un champ est à corriger.');
  });

  it('walks the fields with the keyboard’s « Suivant », says what is wrong once a field is left, and asks before leaving with changes', async () => {
    const tree = await boot({ onboarded: true });
    await go('Edit');
    /** The native field itself, as the keyboard and the focus reach it. */
    const field = (label: string) => tree.root.findAll(node => (node.type as unknown) === 'TextInput' && typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(label))[0]!;
    expect(field('Prénom').props.returnKeyType).toBe('next');
    expect(field('Prénom').props.submitBehavior).toBe('submit');
    expect(field('Prénom').props.autoCapitalize).toBe('words');
    expect(field('Numéro').props.keyboardType).toBe('phone-pad');
    await type(tree, 'Prénom', 'Inès');
    await act(async () => {
      pressableWithText(tree, 'Ajouter un e-mail').props.onPress();
    });
    await act(async () => {
      field('Adresse e-mail').props.onChangeText('ines');
    });
    expect(textOf(tree)).not.toContain('Une adresse e-mail complète');
    await act(async () => {
      field('Adresse e-mail').props.onBlur({});
    });
    expect(textOf(tree)).toContain('Une adresse e-mail complète, comme nom@exemple.fr.');
    await act(async () => {
      field('Adresse e-mail').props.onChangeText('ines@example.org');
    });
    expect(textOf(tree)).not.toContain('Une adresse e-mail complète');

    // Leaving with all that asks; « Continuer à modifier » stays.
    await act(async () => {
      navigationRef.goBack();
    });
    await settle();
    expect(textOf(tree)).toContain('Abandonner les modifications ?');
    await act(async () => {
      pressableWithText(tree, 'Continuer à modifier').props.onPress();
    });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Edit');
    await act(async () => {
      navigationRef.goBack();
    });
    await settle();
    await act(async () => {
      pressableWithText(tree, 'Abandonner').props.onPress();
    });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).not.toBe('Edit');
    expect(useLibraryStore.getState().liveContacts).toEqual([]);
  });

  it('opens a shared card on the import, then writes it in one batch', async () => {
    media.texts['/cache/shared-in/card.vcf'] = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Garnier;Hugo;;;',
      'FN:Hugo Garnier',
      'TEL;TYPE=CELL:+33 6 98 76 54 32',
      'EMAIL;TYPE=HOME:hugo@example.org',
      'BDAY:1992-02-29',
      'CATEGORIES:Amis',
      'END:VCARD',
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Faure;Nina;;;',
      'FN:Nina Faure',
      'TEL;TYPE=WORK:01 23 45 67 89',
      'CATEGORIES:Amis',
      'END:VCARD',
    ].join('\r\n');
    __queueShare({ files: ['/cache/shared-in/card.vcf'], mimeType: 'text/x-vcard' });
    const tree = await boot({ onboarded: true });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Import');
    // Straight to its preview: everyone read, with what becomes of them.
    expect(textOf(tree)).toMatch(/2\spersonnes lues/);
    expect(textOf(tree)).toContain('Hugo Garnier');
    expect(media.removed).toContain('/cache/shared-in/card.vcf');

    await act(async () => {
      pressableWithText(tree, 'Continuer').props.onPress();
    });
    await settle();
    expect(textOf(tree)).toContain('Amis');
    await act(async () => {
      pressableWithText(tree, 'Importer 2\u00a0contacts').props.onPress();
    });
    await settle();
    expect(textOf(tree)).toContain('Vos contacts sont là');
    const { contacts, labels, liveContacts } = useLibraryStore.getState();
    expect(liveContacts).toHaveLength(2);
    const friends = Object.values(labels).find(label => label.name === 'Amis')!;
    const hugo = Object.values(contacts).find(contact => contact.firstName === 'Hugo')!;
    expect(hugo).toMatchObject({ lastName: 'Garnier', birthday: '1992-02-29', labelIds: [friends.id] });
    expect(hugo.emails[0]?.address).toBe('hugo@example.org');
    // The labels and the contacts: one batch, one clock.
    const all = [...liveContacts.map(id => clocks(id)), (getRecord('contactLabel', friends.id)?.clocks ?? {}) as Record<string, string>].flatMap(fields => Object.values(fields));
    expect(new Set(all).size).toBe(1);
  });

  it('opens another app’s « Créer un contact » filled, and leaves it without a trace', async () => {
    const handed = { name: 'Inès Morel', phone: '06 55 44 33 22', phone_type: 3, email: 'ines@example.org', company: 'Boulangerie Morel', notes: 'Voisine' };
    __queueShare({ id: 'insert-1', mimeType: HANDED_CONTACT, text: JSON.stringify(handed) });
    const tree = await boot({ onboarded: true });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Edit');
    expect(inputs(tree, 'Prénom')[0]!.props.value).toBe('Inès');
    expect(inputs(tree, 'Nom de famille')[0]!.props.value).toBe('Morel');
    expect(inputs(tree, 'Entreprise')[0]!.props.value).toBe('Boulangerie Morel');
    expect(textOf(tree)).toContain('Travail');
    // × leaves at once (nothing typed here), and nothing was kept.
    await act(async () => {
      pressables(tree, 'Fermer')[0]!.props.onPress();
    });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Contacts');
    expect(useLibraryStore.getState().liveContacts).toHaveLength(0);

    __queueShare({ id: 'insert-2', mimeType: HANDED_CONTACT, text: JSON.stringify(handed) });
    const again = await boot({ onboarded: true });
    await settle();
    await act(async () => {
      pressableWithText(again, 'Enregistrer').props.onPress();
    });
    await settle();
    const id = (navigationRef.getCurrentRoute()?.params as { id: string }).id;
    const contact = useLibraryStore.getState().contacts[id]!;
    expect(contact).toMatchObject({ firstName: 'Inès', lastName: 'Morel', company: 'Boulangerie Morel', note: 'Voisine' });
    // A number nobody touched is kept as it was handed.
    expect(contact.phones).toEqual([expect.objectContaining({ number: '06 55 44 33 22', kind: 'work' })]);
    expect(contact.emails).toEqual([expect.objectContaining({ address: 'ines@example.org' })]);
  });

  it('says a label name already worn under its field, keeping what was typed, when making one and renaming one', async () => {
    let work = '';
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        createLabel('Famille');
        work = createLabel('Travail');
      },
    });
    await go('Labels');
    const taken = 'Ce libellé existe déjà : choisissez un autre nom.';
    // Making one: refused under the strip, the name kept, until it is free.
    await type(tree, 'Nom du nouveau libellé', 'Famille');
    await act(async () => {
      inputs(tree, 'Nom du nouveau libellé')[0]!.props.onSubmitEditing();
    });
    expect(textOf(tree)).toContain(taken);
    expect(inputs(tree, 'Nom du nouveau libellé, ' + taken)[0]!.props.value).toBe('Famille');
    expect(Object.values(useLibraryStore.getState().labels).filter(label => label?.name === 'Famille')).toHaveLength(1);
    await type(tree, 'Nom du nouveau libellé, ' + taken, 'Voisins');
    expect(textOf(tree)).not.toContain(taken);
    // Renaming one: the same, under its row, nothing saved.
    const field = () => tree.root.findAll(node => typeof node.props.onChangeText === 'function' && String(node.props.accessibilityLabel ?? '').startsWith('Renommer Travail'), { deep: false })[0]!;
    await act(async () => {
      field().props.onChangeText('Famille');
    });
    await act(async () => {
      field().props.onBlur();
    });
    expect(useLibraryStore.getState().labels[work]!.name).toBe('Travail');
    expect(field().props.value).toBe('Famille');
    expect(textOf(tree)).toContain(taken);
    await act(async () => {
      field().props.onChangeText('Bureau');
    });
    expect(textOf(tree)).not.toContain(taken);
    await act(async () => {
      field().props.onBlur();
    });
    expect(useLibraryStore.getState().labels[work]!.name).toBe('Bureau');
  });

  it('keeps another app’s new contact waiting until the first run is done', async () => {
    __queueShare({ id: 'insert-3', mimeType: HANDED_CONTACT, text: JSON.stringify({ name: 'Inès Morel' }) });
    await boot({ onboarded: false });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Setup');
    expect(intake.pending?.id).toBe('insert-3');
  });
});
