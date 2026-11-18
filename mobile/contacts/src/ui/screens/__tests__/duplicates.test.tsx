/**
 * The address book once it already holds people: « Doublons » with several groups (why each one is
 * there, said as one sentence; every member read whole by TalkBack, the one kept said; « Ignorer »
 * taken back from its slip), a merged contact's line in the bin, and an import over contacts already
 * here (each person's fate, the fate filters, a person unticked, « Compléter les contacts déjà là »
 * turned off, and the report).
 */
import { Linking } from 'react-native';
import { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { useUiStore } from '@shared/app/store/uiStore';
import { createContact, mergeDuplicates, type ContactDraft } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { navigationRef } from '@ui/navigation/navigationRef';

import { __queueShare, __reset as resetIntake } from '../../../../../shared/__mocks__/NativeIntake';
import { state as media, __reset as resetMedia } from '../../../../../shared/__mocks__/NativeMedia';
import { boot, fakeFetch, pressableWithText, pressables, settle, textOf, unmountAll } from './harness';

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

const press = async (node: ReactTestInstance): Promise<void> => {
  await act(async () => {
    node.props.onPress();
  });
  await settle();
};

/** What TalkBack names each pressable drawn. */
const labels = (tree: ReactTestRenderer): string[] =>
  tree.root
    .findAll(node => typeof node.props.onPress === 'function' && typeof node.props.accessibilityLabel === 'string', { deep: false })
    .map(node => node.props.accessibilityLabel as string);

describe('Contacts, with people already here', () => {
  beforeEach(() => {
    resetIntake();
    resetMedia();
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterAll(unmountAll);

  it('says why each group is there in one sentence, reads every member whole, and takes « Ignorer » back from its slip', async () => {
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        createContact(person('Léa', 'Martin', { emails: [{ id: 'e1', address: 'lea@example.org', kind: 'home', label: '' }], phones: [{ id: 'p1', number: '+33 6 12 34 56 78', kind: 'mobile', label: '' }], company: 'Atelier Nord' }));
        createContact(person('Léa', 'Martin', { emails: [{ id: 'e2', address: 'lea@example.org', kind: 'work', label: '' }] }));
        createContact(person('Paul', 'Roux', { phones: [{ id: 'p2', number: '+33 6 98 76 54 32', kind: 'mobile', label: '' }] }));
        createContact(person('Paolo', 'Rossi', { phones: [{ id: 'p3', number: '+33 6 98 76 54 32', kind: 'home', label: '' }] }));
      },
    });
    await go('Duplicates');
    const text = textOf(tree);
    // One sentence: only its first word takes a capital (as on the web).
    expect(text).toContain('Même e-mail · même nom');
    expect(text).toContain('Même numéro');
    expect(text).not.toContain('Même nom ·');
    expect(text).toContain('Gardé');

    // The most complete is kept, and TalkBack hears it, with what tells each one apart.
    const said = labels(tree);
    expect(said).toContain('Léa Martin, Atelier Nord · +33 6 12 34 56 78 · lea@example.org, Gardé');
    expect(said).toContain('Léa Martin, lea@example.org');

    // « Ignorer » sets the group aside on this phone; its slip offers it again.
    const groups = (): number => tree.root.findAll(node => node.props.label === 'Fusionner' && typeof node.props.onPress === 'function', { deep: false }).length;
    expect(groups()).toBe(2);
    await press(pressables(tree, 'Ignorer')[0]!);
    expect(groups()).toBe(1);
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Ces doublons ne seront plus proposés sur ce téléphone', action: { label: 'Annuler' } });
    await act(async () => {
      useUiStore.getState().snack!.action!.run();
    });
    await settle();
    expect(groups()).toBe(2);
  });

  it('says in the bin into whom a merged contact went', async () => {
    let keep = '';
    let other = '';
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        keep = createContact(person('Léa', 'Martin', { company: 'Atelier Nord' }));
        other = createContact(person('Léa', 'Martin'));
        mergeDuplicates(keep, [keep, other]);
      },
    });
    expect(useLibraryStore.getState().contacts[other]!.mergedInto).toBe(keep);
    await go('Trash');
    expect(textOf(tree)).toMatch(/Fusionné dans Léa Martin /);
    expect(textOf(tree)).not.toContain('Mis à la corbeille');
  });

  it('imports over the contacts already here: each one’s fate, its filter, a person unticked, and the report', async () => {
    let lea = '';
    let paul = '';
    media.texts['/cache/shared-in/friends.vcf'] = [
      // Léa is here with her number: the file adds her e-mail.
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Martin;Léa;;;',
      'FN:Léa Martin',
      'TEL;TYPE=CELL:+33 6 12 34 56 78',
      'EMAIL;TYPE=HOME:lea@example.org',
      'END:VCARD',
      // Paul is here as he is in the file: nothing to add.
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Roux;Paul;;;',
      'FN:Paul Roux',
      'TEL;TYPE=CELL:+33 6 98 76 54 32',
      'END:VCARD',
      // Hugo and Nina are new.
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Garnier;Hugo;;;',
      'FN:Hugo Garnier',
      'TEL;TYPE=CELL:+33 6 11 22 33 44',
      'END:VCARD',
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Faure;Nina;;;',
      'FN:Nina Faure',
      'EMAIL;TYPE=HOME:nina@example.org',
      'END:VCARD',
    ].join('\r\n');
    __queueShare({ files: ['/cache/shared-in/friends.vcf'], mimeType: 'text/x-vcard' });
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        lea = createContact(person('Léa', 'Martin', { phones: [{ id: 'p1', number: '+33 6 12 34 56 78', kind: 'mobile', label: '' }] }));
        paul = createContact(person('Paul', 'Roux', { phones: [{ id: 'p2', number: '+33 6 98 76 54 32', kind: 'mobile', label: '' }] }));
      },
    });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Import');

    // The counts, then each person with what becomes of them.
    let text = textOf(tree);
    expect(text).toMatch(/4\spersonnes lues/);
    expect(text).toMatch(/2\snouveaux contacts/);
    expect(text).toMatch(/Complète Léa Martin : /);
    expect(text).toContain('Déjà là : Paul Roux, rien à ajouter');
    expect(text).toContain('Nouveau');
    expect(text).toContain('Complété');
    expect(text).toContain('Déjà là');

    // The fate filters: « Déjà là » alone shows Paul.
    const chip = (name: string): ReactTestInstance => tree.root.findAll(node => node.props.accessibilityRole === 'radio' && typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(`${name}, `) && typeof node.props.onPress === 'function', { deep: false })[0]!;
    await press(chip('Déjà là'));
    text = textOf(tree);
    expect(text).toContain('Paul Roux');
    expect(text).not.toContain('Hugo Garnier');
    await press(chip('Tout'));

    // Nina unticked: left out, said so.
    await act(async () => {
      tree.root.findAll(node => node.props.label === 'Importer Nina Faure' && typeof node.props.onToggle === 'function', { deep: false })[0]!.props.onToggle();
    });
    await settle();
    expect(textOf(tree)).toContain('Décoché : ne sera pas importé');

    // The choices: those here completed, unless turned off.
    await press(pressableWithText(tree, 'Continuer'));
    expect(textOf(tree)).toContain('Un contact déjà là gagne ce qui lui manque ; rien de ce qu’il a n’est remplacé.');
    await press(pressableWithText(tree, 'Importer 1 contact'));

    // The report: what came in, what was left aside and why.
    text = textOf(tree);
    expect(text).toContain('Vos contacts sont là');
    expect(text).toMatch(/1\scontact ajouté/);
    expect(text).toMatch(/1\scontact complété/);
    expect(text).toMatch(/1\scontact déjà là, rien à ajouter/);
    expect(text).toMatch(/1\spersonne décochée/);
    const { contacts, liveContacts } = useLibraryStore.getState();
    expect(liveContacts).toHaveLength(3);
    expect(contacts[lea]!.emails.map(email => email.address)).toEqual(['lea@example.org']);
    expect(contacts[paul]!.emails).toEqual([]);
    expect(Object.values(contacts).some(contact => contact.firstName === 'Nina')).toBe(false);
  });
});
