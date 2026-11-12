/**
 * The phone's own contacts imported (the PhoneContacts module mocked): read a page at a time, matched
 * with those already here, written in one batch, then their photos taken into the app's storage and
 * written in one batch more, kept until the sync sends them.
 */
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { loadLocalFiles } from '@shared/data/repositories/fileRepository';
import { bootstrap, resetBootstrap } from '@app/bootstrap';
import { fromPhoneRow, planFor, readPhoneBook, runImport, undoImport } from '@app/importing';
import { createContact, createLabel, eraseContacts, setFavorite, setLabel } from '@app/store/actions';
import { getRecord, resetLibrary, useLibraryStore } from '@app/store/libraryStore';

import { state as phone, __reset as resetPhone } from '../../../../shared/__mocks__/NativePhoneContacts';

const row = (firstName: string, lastName: string, more: Record<string, unknown> = {}) => ({
  firstName,
  lastName,
  company: '',
  jobTitle: '',
  note: '',
  birthday: '',
  favorite: false,
  photo: '',
  phones: [],
  emails: [],
  addresses: [],
  labels: [],
  ...more,
});

describe('importing the phone’s contacts', () => {
  beforeEach(() => {
    resetPhone();
    closeDatabase();
    resetLibrary();
    resetBootstrap();
    openDatabase({ name: 'app.sqlite' });
    bootstrap();
  });

  it('reads Android’s rows as an import does', () => {
    const read = fromPhoneRow(row('Jeanne', 'Roy', { birthday: '--05-04', favorite: true, photo: 'content://com.android.contacts/contacts/7/display_photo', labels: ['Voisins'], phones: [{ value: '0612345678', kind: 'mobile', label: '' }, { value: ' ', kind: 'home', label: '' }] }));
    expect(read).toMatchObject({ firstName: 'Jeanne', birthday: '--05-04', favorite: true, labels: ['Voisins'], photo: { kind: 'file', uri: 'content://com.android.contacts/contacts/7/display_photo' } });
    expect(read.phones).toEqual([{ value: '0612345678', kind: 'mobile', label: '' }]);
  });

  it('pages through the address book, completes who is here, and takes the photos after', async () => {
    const here = createContact({ firstName: 'Marc', lastName: 'Blanc', company: '', jobTitle: '', phones: [{ id: 'p1', number: '06 00 00 00 01', kind: 'mobile', label: '' }], emails: [], addresses: [], birthday: null, labelIds: [], favorite: false, photoId: null, photoMime: '', photoUploaded: false });
    phone.contacts = [
      ...Array.from({ length: 250 }, (_, index) => row(`Personne${index}`, 'Test', { phones: [{ value: `07 00 00 ${String(index).padStart(4, '0')}`, kind: 'mobile', label: '' }] })),
      row('Marc', 'Blanc', { phones: [{ value: '+33 6 00 00 00 01', kind: 'mobile', label: '' }], emails: [{ value: 'marc@example.org', kind: 'work', label: '' }], photo: 'content://photo/marc', labels: ['Travail'] }),
    ];
    const progress: number[] = [];
    const read = await readPhoneBook(done => progress.push(done));
    expect(read).toHaveLength(251);
    expect(progress).toEqual([200, 251]);

    const plan = planFor(read);
    expect(plan.creates).toHaveLength(250);
    expect(plan.updates).toHaveLength(1);
    const report = await runImport(plan);
    expect(report).toMatchObject({ created: 250, updated: 1, labels: 1, photos: 1, photosMissed: 0 });

    const marc = useLibraryStore.getState().contacts[here]!;
    expect(marc.emails.map(entry => entry.address)).toEqual(['marc@example.org']);
    expect(marc.photoId).not.toBeNull();
    expect(marc.photoUploaded).toBe(false);
    expect(phone.imported).toEqual(['content://photo/marc']);
    expect(loadLocalFiles().map(file => file.id)).toContain(marc.photoId);
    // The photo came in a batch of its own, after the contacts'.
    const clocks = getRecord('contact', here)!.clocks as Record<string, string>;
    expect(clocks.photoId).not.toBe(clocks.emails);
  });

  it('takes an import back: what it made goes, who it completed gets back what they had', async () => {
    const here = createContact({ firstName: 'Marc', lastName: 'Blanc', company: '', jobTitle: '', phones: [{ id: 'p1', number: '06 00 00 00 01', kind: 'mobile', label: '' }], emails: [], addresses: [], birthday: null, labelIds: [], favorite: false, photoId: null, photoMime: '', photoUploaded: false });
    phone.contacts = [row('Inès', 'Morel', { phones: [{ value: '07 11 11 11 11', kind: 'mobile', label: '' }], labels: ['Voisins'] }), row('Marc', 'Blanc', { emails: [{ value: 'marc@example.org', kind: 'work', label: '' }], photo: 'content://photo/marc' })];
    const plan = planFor(await readPhoneBook());
    const report = await runImport(plan);
    expect(useLibraryStore.getState().liveContacts).toHaveLength(2);
    undoImport(plan, report.worn);
    const { contacts, labels, liveContacts } = useLibraryStore.getState();
    expect(liveContacts).toEqual([here]);
    expect(contacts[here]).toMatchObject({ emails: [], photoId: null });
    expect(Object.values(labels).every(label => label.deletedAt !== null)).toBe(true);
  });

  it('erases the contacts but the favourites, and the labels off those who stay', () => {
    const blank = { company: '', jobTitle: '', phones: [], emails: [], addresses: [], birthday: null, labelIds: [], favorite: false, photoId: null, photoMime: '', photoUploaded: false };
    const lea = createContact({ ...blank, firstName: 'Léa', lastName: 'Martin' });
    const paul = createContact({ ...blank, firstName: 'Paul', lastName: 'Roy' });
    setFavorite(paul, true);
    const club = createLabel('Club');
    setLabel([lea, paul], club, true);
    expect(eraseContacts(new Set(['contacts', 'labels']))).toBe(2);
    const { contacts, labels } = useLibraryStore.getState();
    expect(contacts[lea]!.deletedAt).not.toBeNull();
    expect(contacts[paul]).toMatchObject({ deletedAt: null, labelIds: [] });
    expect(labels[club]!.deletedAt).not.toBeNull();
  });
});
