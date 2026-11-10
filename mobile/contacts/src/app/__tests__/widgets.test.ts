/**
 * What « Appels rapides » is handed (`callsPayload`), a form's save writing its note in the same batch,
 * and a photo dropped once no contact wears it before it was sent.
 */
import { formatHlc } from '@unlease/core/sync/hlc';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { loadLocalFiles } from '@shared/data/repositories/fileRepository';
import { bootstrap, resetBootstrap } from '@app/bootstrap';
import { dropPhoto, keepPhoto, photoReplaced } from '@app/photos';
import { createContact, createLabel, deleteLabel, setContactPhoto, updateContact, type ContactDraft } from '@app/store/actions';
import { getRecord, mergeRemote, resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { callsPayload } from '@app/widgetPayloads';

import { state as media, __reset as resetMedia } from '../../../../shared/__mocks__/NativeMedia';

const draft = (firstName: string, lastName: string, more: Partial<ContactDraft> = {}): ContactDraft => ({
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

const phone = (number: string, kind = 'mobile') => ({ id: `p${number.replace(/\D/g, '')}`, number, kind, label: '' });

beforeEach(() => {
  resetMedia();
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'app.sqlite' });
  bootstrap();
});

describe('callsPayload', () => {
  it('hands the favourites in the list’s order, each with the number a tap calls', () => {
    const lea = createContact(draft('Léa', 'Martin', { favorite: true, phones: [phone('01 23 45 67 89', 'home'), phone('06 12 34 56 78')] }));
    createContact(draft('Bruno', 'Petit', { favorite: true }));
    createContact(draft('Zoé', 'Roux'));
    const kept = keepPhoto('/data/files/photos/lea.jpg', 'image/jpeg');
    setContactPhoto(lea, { id: kept.id, mime: kept.mime, uploaded: false });

    const payload = callsPayload('favorites', useLibraryStore.getState(), 'firstName', new Map([[kept.id, '/data/files/photos/lea.jpg']]));
    expect(payload).toMatchObject({ id: 'favorites', kind: 'favorites', title: 'Favoris', open: 'favorites', gone: false });
    expect(payload.people.map(person => person.name)).toEqual(['Bruno', 'Léa']);
    const first = payload.people[1]!;
    expect(first).toMatchObject({ initials: 'LM', call: '0612345678', photo: kept.id, local: '/data/files/photos/lea.jpg', said: 'Appeler Léa Martin' });
    // No number: the tap opens them.
    expect(payload.people[0]).toMatchObject({ call: '', said: 'Bruno Petit' });
  });

  it('hands a label’s contacts, and says when the label is gone', () => {
    const family = createLabel('Famille');
    createContact(draft('Paul', 'Durand', { labelIds: [family], phones: [phone('+33 6 98 76 54 32')] }));
    createContact(draft('Anne', 'Morel'));
    const payload = callsPayload(`label:${family}`, useLibraryStore.getState(), 'lastName');
    expect(payload).toMatchObject({ kind: 'label', title: 'Famille', open: `label/${family}`, gone: false });
    expect(payload.people.map(person => person.call)).toEqual(['+33698765432']);
    deleteLabel(family);
    expect(callsPayload(`label:${family}`, useLibraryStore.getState(), 'lastName').gone).toBe(true);
  });
});

describe('saving the form', () => {
  it('writes the fields and the note in one batch', () => {
    const id = createContact(draft('Camille', 'Roy'), 'Aime le thé');
    const before = getRecord('contact', id)!.clocks as Record<string, string>;
    expect(updateContact(id, draft('Camille', 'Roy', { company: 'Atelier' }), { since: 'Aime le thé', typed: 'Aime le thé vert' })).toBe(true);
    const after = getRecord('contact', id)!.clocks as Record<string, string>;
    expect(useLibraryStore.getState().contacts[id]).toMatchObject({ company: 'Atelier', note: 'Aime le thé vert' });
    expect(after.note).toBe(after.company);
    expect(after.note).not.toBe(before.note);
    expect(after.firstName).toBe(before.firstName);
  });

  it('merges the note with an edit that landed while the form was open', () => {
    const id = createContact(draft('Camille', 'Roy'), 'Thé');
    const record = getRecord('contact', id)!;
    // Another device added a line meanwhile.
    mergeRemote([{ ...record, fields: { ...record.fields, note: 'Thé\nCafé' }, clocks: { ...record.clocks, note: formatHlc(Date.now() + 60_000, 0, 'othernode') } }]);
    updateContact(id, draft('Camille', 'Roy'), { since: 'Thé', typed: 'Thé vert' });
    const note = useLibraryStore.getState().contacts[id]!.note;
    expect(note).toContain('vert');
    expect(note).toContain('Café');
  });
});

describe('photos never sent', () => {
  it('drops one no contact wears, and keeps one that is worn', () => {
    const id = createContact(draft('Inès', 'Moreau'));
    const first = keepPhoto('/data/files/photos/a.jpg', 'image/jpeg');
    const second = keepPhoto('/data/files/photos/b.jpg', 'image/jpeg');
    setContactPhoto(id, { id: first.id, mime: first.mime, uploaded: false });
    dropPhoto(first.id);
    expect(loadLocalFiles().map(file => file.id)).toContain(first.id);

    // Replaced by the second before it was sent: the first goes.
    setContactPhoto(id, { id: second.id, mime: second.mime, uploaded: false });
    photoReplaced(first.id, second.id);
    expect(loadLocalFiles().map(file => file.id)).toEqual([second.id]);
    expect(media.removed).toContain('/data/files/photos/a.jpg');
  });
});
