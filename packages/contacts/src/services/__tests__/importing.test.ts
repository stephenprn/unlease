import { setLocale } from '@unlease/core/i18n';
import { createId } from '@unlease/core/services/ids';
import type { SyncRecord } from '@unlease/core/sync/record';
import { emptyContact, type Contact, type ContactLabel } from '../../models/contacts';
import { contactFromRecord } from '../../sync/entities';
import { isValidField } from '@unlease/core/sync/schema';
import { parseGoogleCsv } from '../googleCsv';
import { planImport, readContactsFile } from '../importing';
import { parseVCards, toVCard } from '../vcard';

const GOOGLE_VCF = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Léa Martin',
  'N:Martin;Léa;;;',
  'EMAIL;TYPE=INTERNET;TYPE=HOME:lea@example.org',
  'TEL;TYPE=CELL:06 12 34 56 78',
  'item1.TEL:+33 4 72 00 00 00',
  'item1.X-ABLabel:Atelier',
  'ADR;TYPE=HOME:;;12 rue des Lilas;Lyon;;69003;France',
  'BDAY:--03-12',
  'ORG:Atelier Nord',
  'TITLE:Architecte',
  'NOTE:Aime le thé\\, pas le café.\\nVoisine.',
  'CATEGORIES:myContacts,starred,Famille',
  'PHOTO:https://lh3.googleusercontent.com/abc',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:2.1',
  'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Dupr=C3=A9;Jean;;;',
  'TEL;CELL;PREF:+33698765432',
  'BDAY:19800521',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'NOTE:nothing to hold',
  'END:VCARD',
].join('\r\n');

describe('vCard', () => {
  it('reads Google’s export: names, kinds, own labels, address, birthday, categories, photo', () => {
    const [lea, jean, ...rest] = parseVCards(GOOGLE_VCF);
    expect(rest).toHaveLength(0);
    expect(lea).toMatchObject({ firstName: 'Léa', lastName: 'Martin', company: 'Atelier Nord', jobTitle: 'Architecte', birthday: '--03-12', favorite: true, labels: ['Famille'] });
    expect(lea!.note).toBe('Aime le thé, pas le café.\nVoisine.');
    expect(lea!.phones).toEqual([
      { value: '06 12 34 56 78', kind: 'mobile', label: '' },
      { value: '+33 4 72 00 00 00', kind: 'other', label: 'Atelier' },
    ]);
    expect(lea!.emails).toEqual([{ value: 'lea@example.org', kind: 'home', label: '' }]);
    expect(lea!.addresses[0]).toMatchObject({ street: '12 rue des Lilas', city: 'Lyon', postalCode: '69003', country: 'France' });
    expect(lea!.photo).toEqual({ kind: 'url', url: 'https://lh3.googleusercontent.com/abc' });
    expect(jean).toMatchObject({ firstName: 'Jean', lastName: 'Dupré', birthday: '1980-05-21' });
    expect(jean!.phones[0]).toMatchObject({ value: '+33698765432', kind: 'mobile' });
  });

  it('unfolds long lines and reads embedded photos', () => {
    const cards = parseVCards('BEGIN:VCARD\nVERSION:3.0\nFN:Ana\nPHOTO;ENCODING=b;TYPE=PNG:iVBOR\n w0KGgo=\nEND:VCARD\n');
    expect(cards[0]!.photo).toEqual({ kind: 'data', mime: 'image/png', base64: 'iVBORw0KGgo=' });
    expect(cards[0]!.firstName).toBe('Ana');
  });

  it('writes a card that reads back the same', () => {
    const contact: Contact = {
      ...emptyContact('c1', 0),
      firstName: 'Léa',
      lastName: 'Martin',
      company: 'Atelier; Nord',
      phones: [{ id: 'p1', number: '06 12 34 56 78', kind: 'mobile', label: '' }],
      emails: [{ id: 'e1', address: 'lea@example.org', kind: 'work', label: 'Pro' }],
      birthday: '--03-12',
      favorite: true,
      labelIds: ['l1'],
    };
    const labels: Record<string, ContactLabel> = { l1: { id: 'l1', name: 'Famille', color: 'green', position: 'a0', createdAt: 0, deletedAt: null } };
    const [back] = parseVCards(toVCard(contact, labels));
    expect(back).toMatchObject({ firstName: 'Léa', lastName: 'Martin', company: 'Atelier; Nord', birthday: '--03-12', favorite: true, labels: ['Famille'] });
    expect(back!.emails).toEqual([{ value: 'lea@example.org', kind: 'work', label: 'Pro' }]);
  });
});

describe('Google CSV', () => {
  it('reads today’s layout, several values in a cell, starred and system labels', () => {
    const csv = [
      'First Name,Middle Name,Last Name,Organization Name,Organization Title,Birthday,Notes,Photo,Labels,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Phone 2 - Label,Phone 2 - Value,Address 1 - Label,Address 1 - Formatted,Address 1 - Street,Address 1 - City,Address 1 - Postal Code,Address 1 - Country',
      'Léa,,Martin,Atelier Nord,Architecte,1990-03-12,"Ligne 1\nLigne, 2",https://lh3.googleusercontent.com/x,* myContacts ::: * starred ::: Famille,* Home,lea@example.org,Mobile,06 12 34 56 78 ::: 07 00 00 00 00,Work,04 72 00 00 00,Home,,12 rue des Lilas,Lyon,69003,France',
      ',,,,,,,,,,,,,,,,,,,,',
    ].join('\n');
    const [lea, ...rest] = parseGoogleCsv(csv);
    expect(rest).toHaveLength(0);
    expect(lea).toMatchObject({ firstName: 'Léa', lastName: 'Martin', company: 'Atelier Nord', jobTitle: 'Architecte', birthday: '1990-03-12', favorite: true, labels: ['Famille'], note: 'Ligne 1\nLigne, 2' });
    expect(lea!.phones.map(phone => [phone.value, phone.kind])).toEqual([
      ['06 12 34 56 78', 'mobile'],
      ['07 00 00 00 00', 'mobile'],
      ['04 72 00 00 00', 'work'],
    ]);
    expect(lea!.emails).toEqual([{ value: 'lea@example.org', kind: 'home', label: '' }]);
    expect(lea!.addresses[0]).toMatchObject({ kind: 'home', street: '12 rue des Lilas', city: 'Lyon', postalCode: '69003' });
    expect(lea!.photo).toEqual({ kind: 'url', url: 'https://lh3.googleusercontent.com/x' });
  });

  it('reads the older layout', () => {
    const csv = 'Name,Given Name,Family Name,Birthday,Group Membership,E-mail 1 - Type,E-mail 1 - Value,Phone 1 - Type,Phone 1 - Value\nJean Dupré,Jean,Dupré,--05-21,* My Contacts ::: Club,* Work,jean@example.org,Mobile,+33698765432\n';
    const [jean] = parseGoogleCsv(csv);
    expect(jean).toMatchObject({ firstName: 'Jean', lastName: 'Dupré', birthday: '--05-21', labels: ['Club'] });
    expect(jean!.emails[0]).toMatchObject({ kind: 'work' });
    expect(readContactsFile('contacts.csv', csv)).toHaveLength(1);
    expect(readContactsFile('notes.txt', 'hello')).toBeNull();
  });
});

describe('planImport', () => {
  const ids = (): (() => string) => {
    let n = 0;
    return () => `id${(n += 1)}`;
  };

  it('adds new people, completes those already here without overwriting, makes the labels once', () => {
    const here: Contact = { ...emptyContact('lea', 0), firstName: 'Léa', lastName: 'Martin', company: 'Ici', phones: [{ id: 'p', number: '+33 6 12 34 56 78', kind: 'mobile', label: '' }] };
    const labels: ContactLabel[] = [{ id: 'fam', name: 'famille', color: 'green', position: 'a0', createdAt: 0, deletedAt: null }];
    const imported = [...parseVCards(GOOGLE_VCF), ...parseVCards(GOOGLE_VCF)];
    const plan = planImport([here], labels, imported, { now: 5, newId: ids() });
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]!.fields).toMatchObject({ firstName: 'Jean', lastName: 'Dupré', createdAt: 5 });
    expect(plan.updates).toHaveLength(1);
    const update = plan.updates[0]!;
    expect(update.id).toBe('lea');
    expect(update.fields.company).toBeUndefined();
    expect(update.fields).toMatchObject({ jobTitle: 'Architecte', birthday: '--03-12', favorite: true, labelIds: ['fam'] });
    expect((update.fields.phones as unknown[]).length).toBe(2);
    expect(update.photo).toEqual({ kind: 'url', url: 'https://lh3.googleusercontent.com/abc' });
    expect(plan.labels).toHaveLength(0);
    expect(plan.photos).toBe(1);
    // Every field written passes the sync's checks.
    for (const write of [...plan.creates, ...plan.updates]) for (const [field, value] of Object.entries(write.fields)) expect([field, isValidField('contact', field, value)]).toEqual([field, true]);
  });

  it('keeps apart two countries’ numbers that end alike, in the file and against the address book', () => {
    const here: Contact = { ...emptyContact('lea', 0), firstName: 'Léa', lastName: 'Martin', phones: [{ id: 'p', number: '06 12 34 56 78', kind: 'mobile', label: '' }] };
    const card = (name: string, tel: string): string => ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`, `N:${name.split(' ')[1]};${name.split(' ')[0]};;;`, `TEL;TYPE=CELL:${tel}`, 'END:VCARD'].join('\r\n');
    const imported = parseVCards([card('José García', '+34 612 345 678'), card('Léa Martin', '+33 6 12 34 56 78'), card('Pablo Ruiz', '+34 612 345 678')].join('\r\n'));
    const plan = planImport([here], [], imported, { now: 5, newId: ids(), region: 'FR' });
    // Léa's number is hers already; José and Pablo share one Spanish number, so they are one person.
    expect(plan.creates.map(write => write.fields.firstName)).toEqual(['José']);
    expect(plan.unchanged).toBe(1);
  });

  it('reads back what it planned', () => {
    const plan = planImport([], [], parseVCards(GOOGLE_VCF), { now: 1, newId: createId });
    expect(plan.labels).toHaveLength(1);
    const record: SyncRecord = { type: 'contact', id: plan.creates[0]!.id, fields: plan.creates[0]!.fields, clocks: {} };
    const contact = contactFromRecord(record);
    expect(contact.labelIds).toEqual([plan.labels[0]!.id]);
    expect(contact.phones).toHaveLength(2);
    setLocale('fr');
  });
});
