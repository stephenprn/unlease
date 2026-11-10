import { emptyContact, type Contact } from '../../models/contacts';
import { geoUri, mapsUrl } from '../addresses';
import { birthdayAlerts, birthdayAlertWords } from '../birthdays';
import { findDuplicates, mergeContacts, resolveContact } from '../duplicates';

const person = (fields: Partial<Contact> & { id: string }): Contact => ({ ...emptyContact(fields.id, fields.createdAt ?? 0), ...fields });
const ids = (): (() => string) => {
  let n = 0;
  return () => `n${(n += 1)}`;
};

describe('duplicates', () => {
  const lea = person({ id: 'lea', firstName: 'Léa', lastName: 'Martin', phones: [{ id: 'p', number: '06 12 34 56 78', kind: 'mobile', label: '' }], createdAt: 1 });
  const leaWork = person({ id: 'leaw', firstName: 'Lea', lastName: 'Martin', emails: [{ id: 'e', address: 'lea@example.org', kind: 'work', label: '' }], birthday: '--03-12', labelIds: ['fam'], photoId: 'ph', photoUploaded: true, photoMime: 'image/jpeg', createdAt: 2 });
  const leaPhone = person({ id: 'leap', firstName: 'L.', phones: [{ id: 'q', number: '+33 6 12 34 56 78', kind: 'mobile', label: '' }], createdAt: 3 });
  const mum = person({ id: 'mum', firstName: 'Maman', createdAt: 4 });
  const mum2 = person({ id: 'mum2', firstName: 'Maman', createdAt: 5 });

  it('groups by e-mail, number or full name, never by a first name alone', () => {
    const groups = findDuplicates([lea, leaWork, leaPhone, mum, mum2, person({ id: 'gone', firstName: 'Léa', lastName: 'Martin', trashedAt: 1 })]);
    expect(groups).toHaveLength(1);
    expect([...groups[0]!.ids].sort()).toEqual(['lea', 'leap', 'leaw']);
    expect(groups[0]!.ids[0]).toBe('leaw');
    expect(groups[0]!.reasons).toEqual(['name', 'phone']);
  });

  it('never joins two countries’ numbers that end alike', () => {
    const jose = person({ id: 'jose', firstName: 'José', lastName: 'García', phones: [{ id: 'j', number: '+34 612 345 678', kind: 'mobile', label: '' }] });
    expect(findDuplicates([lea, jose], 'FR')).toEqual([]);
    expect(findDuplicates([leaPhone, jose])).toEqual([]);
    expect(findDuplicates([lea, leaPhone, jose], 'FR').map(group => [...group.ids].sort())).toEqual([['lea', 'leap']]);
  });

  it('merges into one, the others in the bin pointing at it, and follows them', () => {
    const writes = mergeContacts(lea, [lea, leaWork, leaPhone], { now: 9, newId: ids() });
    const kept = writes.find(write => write.id === 'lea')!.patch;
    expect(kept).toMatchObject({ birthday: '--03-12', labelIds: ['fam'], photoId: 'ph', photoUploaded: true });
    expect((kept.emails as unknown[]).length).toBe(1);
    expect(kept.phones).toBeUndefined();
    expect(kept.firstName).toBeUndefined();
    expect(writes.filter(write => write.id !== 'lea').map(write => write.patch)).toEqual([
      { mergedInto: 'lea', trashedAt: 9, favorite: false },
      { mergedInto: 'lea', trashedAt: 9, favorite: false },
    ]);
    const all = { lea, leaw: { ...leaWork, mergedInto: 'lea', trashedAt: 9 }, old: person({ id: 'old', mergedInto: 'leaw' }), gone: person({ id: 'gone', deletedAt: 3 }) };
    expect(resolveContact(all, 'old')?.id).toBe('lea');
    expect(resolveContact(all, 'gone')).toBeNull();
  });
});

describe('maps', () => {
  const address = { street: '12 rue des Lilas', postalCode: '69003', city: 'Lyon', region: '', country: 'France' };
  it('opens an address in the phone’s maps app or on the web', () => {
    expect(geoUri(address)).toBe('geo:0,0?q=12%20rue%20des%20Lilas%2C%2069003%20Lyon%2C%20France');
    expect(mapsUrl(address, 'openstreetmap')).toBe('https://www.openstreetmap.org/search?query=12%20rue%20des%20Lilas%2C%2069003%20Lyon%2C%20France');
    expect(geoUri({ street: '', postalCode: '', city: '', region: '', country: '' })).toBeNull();
  });
});

describe('birthday alerts', () => {
  const now = new Date(2026, 2, 10, 15).getTime();
  it('arms the coming ones at the hour, none already past', () => {
    const contacts = [person({ id: 'today', birthday: '1990-03-10' }), person({ id: 'soon', birthday: '--03-12' }), person({ id: 'far', birthday: '--09-01' }), person({ id: 'bin', birthday: '--03-11', trashedAt: 1 })];
    const alerts = birthdayAlerts(contacts, now, { hour: 9, before: [0, 1], horizon: 45 });
    expect(alerts.map(alert => [alert.contactId, alert.before, new Date(alert.at).getDate()])).toEqual([
      ['soon', 1, 11],
      ['soon', 0, 12],
    ]);
    const words = birthdayAlertWords('Léa', alerts[1]!);
    expect(words).toEqual({ title: 'Anniversaire de Léa', body: 'Aujourd’hui' });
  });

  it('brings those gone by since a moment, for a phone that rings them late', () => {
    const morning = new Date(now);
    morning.setHours(0, 0, 0, 0);
    const alerts = birthdayAlerts([person({ id: 'today', birthday: '1990-03-10' })], now, { hour: 9, before: [0], horizon: 45, since: morning.getTime() });
    expect(alerts.map(alert => [alert.contactId, new Date(alert.at).getDate(), new Date(alert.at).getHours()])).toEqual([['today', 10, 9]]);
  });
});
