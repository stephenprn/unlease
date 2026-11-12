import { beforeEach, describe, expect, it } from 'vitest';

import { createId } from '@unlease/core/services/ids';
import { planImport, readContactsFile } from '@unlease/contacts/services/importing';

import { freshLibrary } from '@test/library';
import { getRecord, mergeRemote } from '@shared/app/store/records';
import { emptyDraft, draftOf } from '../drafts';
import { applyImport, createLabel, deleteLabel, emptyContactsBin, eraseContacts, markPhotoUploaded, restoreContacts, saveContact, setFavorite, setLabelOn, trashContacts } from '../store/actions';
import { contactsModule } from '../../module';
import { useContactsStore } from '../store/library';
import { contactsData } from '../../data';

const state = () => useContactsStore.getState();

/** Every field of the record written under one clock: one batch. */
const clocksOf = (type: string, id: string): string[] => [...new Set(Object.values(getRecord(type, id)!.clocks))];

const VCARDS = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:Martin;Léa;;;',
  'FN:Léa Martin',
  'TEL;TYPE=CELL:06 12 34 56 78',
  'EMAIL;TYPE=INTERNET;TYPE=HOME:lea@example.org',
  'BDAY:1991-03-12',
  'CATEGORIES:Famille,myContacts,starred',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:Durand;Camille;;;',
  'FN:Camille Durand',
  'ORG:Atelier Nord',
  'TEL;TYPE=WORK:01 23 45 67 89',
  'CATEGORIES:Travail,myContacts',
  'END:VCARD',
  '',
].join('\r\n');

describe('Contacts’ actions', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('creates a contact whole in one batch, its empty rows left out', () => {
    const draft = { ...emptyDraft('Léa Martin'), phones: [{ id: createId(), number: ' 06 12 34 56 78 ', kind: 'mobile', label: '' }] };
    const id = saveContact(null, draft, { since: null, typed: 'Allergique aux noix' });
    const contact = state().contacts[id]!;
    expect(contact).toMatchObject({ firstName: 'Léa', lastName: 'Martin', note: 'Allergique aux noix', emails: [], trashedAt: null });
    expect(contact.phones.map(phone => phone.number)).toEqual(['06 12 34 56 78']);
    expect(clocksOf('contact', id)).toHaveLength(1);
  });

  it('saves only what changed of a contact, and merges its note with an edit made elsewhere', () => {
    const id = saveContact(null, emptyDraft('Léa Martin'), { since: null, typed: 'Aime le thé.' });
    const before = getRecord('contact', id)!.clocks;
    // Another device adds a sentence to the note while the form is open here.
    mergeRemote([{ type: 'contact', id, fields: { note: 'Aime le thé. Joue du violon.' }, clocks: { note: '9999999999999:0000:other' } }]);
    saveContact(id, { ...draftOf(state().contacts[id]!), company: 'Atelier Nord' }, { since: 'Aime le thé.', typed: 'Aime beaucoup le thé.' });
    const after = getRecord('contact', id)!;
    expect(after.fields.company).toBe('Atelier Nord');
    expect(after.fields.note).toContain('beaucoup');
    expect(after.fields.note).toContain('violon');
    // Untouched fields keep the clock they had.
    expect(after.clocks.firstName).toBe(before.firstName);
    expect(after.clocks.company).not.toBe(before.company);
  });

  it('stars contacts and takes it back', () => {
    const a = saveContact(null, emptyDraft('Léa'), { since: null, typed: '' });
    const b = saveContact(null, emptyDraft('Paul'), { since: null, typed: '' });
    const undo = setFavorite([a, b], true);
    expect([state().contacts[a]!.favorite, state().contacts[b]!.favorite]).toEqual([true, true]);
    undo();
    expect([state().contacts[a]!.favorite, state().contacts[b]!.favorite]).toEqual([false, false]);
  });

  it('puts a label on and off, and deleting it takes it off everyone (undone in one go)', () => {
    const a = saveContact(null, emptyDraft('Léa'), { since: null, typed: '' });
    const b = saveContact(null, emptyDraft('Paul'), { since: null, typed: '' });
    const family = createLabel('Famille');
    expect(state().labels[family]).toMatchObject({ name: 'Famille', deletedAt: null });
    setLabelOn([a, b], family, true);
    expect(state().contacts[b]!.labelIds).toEqual([family]);
    setLabelOn([b], family, false);
    expect(state().contacts[b]!.labelIds).toEqual([]);
    const undo = deleteLabel(family);
    expect(state().labels[family]!.deletedAt).not.toBeNull();
    expect(state().contacts[a]!.labelIds).toEqual([]);
    undo();
    expect(state().labels[family]!.deletedAt).toBeNull();
    expect(state().contacts[a]!.labelIds).toEqual([family]);
  });

  it('sends contacts to the bin, back, and empties it for good', () => {
    const a = saveContact(null, emptyDraft('Léa'), { since: null, typed: 'Une note' });
    trashContacts([a]);
    expect(state().contacts[a]!.trashedAt).not.toBeNull();
    restoreContacts([a]);
    expect(state().contacts[a]!.trashedAt).toBeNull();
    trashContacts([a]);
    expect(emptyContactsBin()).toBe(1);
    expect(state().contacts[a]).toMatchObject({ note: '' });
    expect(state().contacts[a]!.deletedAt).not.toBeNull();
  });

  it('imports a Google vCard in one batch, its labels and favourites, and a second time doubles nobody', () => {
    const imported = readContactsFile('contacts.vcf', VCARDS)!;
    const plan = planImport(Object.values(state().contacts), Object.values(state().labels), imported, { now: Date.now(), newId: () => createId() });
    expect(plan.creates).toHaveLength(2);
    applyImport(plan);
    const people = Object.values(state().contacts);
    const lea = people.find(contact => contact.firstName === 'Léa')!;
    expect(lea).toMatchObject({ lastName: 'Martin', birthday: '1991-03-12', favorite: true });
    expect(lea.labelIds.map(id => state().labels[id]!.name)).toEqual(['Famille']);
    expect(Object.values(state().labels).map(label => label.name).sort()).toEqual(['Famille', 'Travail']);
    // One batch: every record of the import shares one clock.
    const clocks = new Set([...people.flatMap(contact => clocksOf('contact', contact.id)), ...Object.keys(state().labels).flatMap(id => clocksOf('contactLabel', id))]);
    expect(clocks.size).toBe(1);
    const again = planImport(Object.values(state().contacts), Object.values(state().labels), readContactsFile('contacts.vcf', VCARDS)!, { now: Date.now(), newId: () => createId() });
    expect(again).toMatchObject({ creates: [], updates: [], labels: [], unchanged: 2 });
  });

  it('erases the parts chosen in one batch: the contacts but the favourites, the labels off those who stay', () => {
    const lea = saveContact(null, emptyDraft('Léa Martin'), { since: null, typed: '' });
    const paul = saveContact(null, { ...emptyDraft('Paul Martin'), favorite: true }, { since: null, typed: '' });
    const family = createLabel('Famille', [lea, paul]);
    expect(contactsModule.erase!.parts().map(part => [part.id, part.count])).toEqual([
      ['contacts', 1],
      ['favorites', 1],
      ['labels', 1],
    ]);
    expect(eraseContacts(new Set(['contacts', 'labels']))).toBe(2);
    expect(state().contacts[lea]!.deletedAt).not.toBeNull();
    expect(state().contacts[paul]).toMatchObject({ deletedAt: null, labelIds: [] });
    expect(state().labels[family]!.deletedAt).not.toBeNull();
    // One batch: what it wrote shares one clock.
    const clock = (type: string, id: string, field: string): unknown => (getRecord(type, id)!.clocks as Record<string, unknown>)[field];
    expect(new Set([clock('contact', lea, 'deletedAt'), clock('contact', paul, 'labelIds'), clock('contactLabel', family, 'deletedAt')]).size).toBe(1);
  });

  it('keeps a photo waiting for its upload as the contact’s, then marks it sent', () => {
    const id = saveContact(null, { ...emptyDraft('Léa'), photoId: 'photo-1', photoMime: 'image/jpeg' }, { since: null, typed: '' });
    expect(contactsData.fileOwner!('photo-1')).toMatchObject({ done: false, mime: 'image/jpeg', image: true });
    expect(contactsData.fileOwner!('other')).toBeNull();
    markPhotoUploaded('photo-1');
    expect(state().contacts[id]!.photoUploaded).toBe(true);
    expect(contactsData.fileOwner!('photo-1')!.done).toBe(true);
  });
});
