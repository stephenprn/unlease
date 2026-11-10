import { setLocale } from '@unlease/core/i18n';
import { isValidField } from '@unlease/core/sync/schema';
import '../../sync/types';
import { emptyContact, type Contact } from '../../models/contacts';
import { addressLine, mapsUrl } from '../addresses';
import { ageToday, birthdayFieldText, birthdayGroups, birthdayMonthFirst, birthdayWhen, formatBirthday, readBirthday, readTypedBirthday, upcomingBirthdays } from '../birthdays';
import { contactName, groupLetter, initials, sortContacts } from '../names';
import { callNumber, composeNumber, dialNumber, internationalDigits, numberParts, regionOf, samePhone, shownNumber, smsHref, telHref, whatsappUrl, writtenNumber } from '../phones';
import { searchContacts } from '../search';

const person = (fields: Partial<Contact>): Contact => ({ ...emptyContact(fields.id ?? 'x', fields.createdAt ?? 0), ...fields });

afterEach(() => setLocale('fr'));

describe('names', () => {
  it('names, initials and letters', () => {
    expect(contactName(person({ firstName: 'Léa', lastName: 'Martin' }))).toBe('Léa Martin');
    expect(contactName(person({ company: 'Acme' }))).toBe('Acme');
    expect(contactName(person({}))).toBe('Sans nom');
    expect(initials(person({ firstName: 'élise', lastName: 'roy' }))).toBe('ÉR');
    expect(initials(person({ emails: [{ id: 'e', address: '42@example.org', kind: 'home', label: '' }] }))).toBe('4');
    expect(groupLetter(person({ firstName: 'Élise' }), 'firstName')).toBe('E');
    expect(groupLetter(person({ firstName: '+33' }), 'firstName')).toBe('#');
  });

  it('sorts by first or last name, the # group last', () => {
    const all = [person({ id: 'a', firstName: 'Zoé', lastName: 'Abel' }), person({ id: 'b', firstName: 'Anna', lastName: 'Zola' }), person({ id: 'c', phones: [{ id: 'p', number: '0600', kind: 'mobile', label: '' }] })];
    expect(sortContacts(all, 'firstName').map(c => c.id)).toEqual(['b', 'a', 'c']);
    expect(sortContacts(all, 'lastName').map(c => c.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('phones', () => {
  it('reads international numbers for WhatsApp from the region', () => {
    expect(regionOf('fr-FR')).toBe('FR');
    expect(regionOf('en')).toBeNull();
    expect(internationalDigits('06 12 34 56 78', 'FR')).toBe('33612345678');
    expect(internationalDigits('+33 6 12 34 56 78', null)).toBe('33612345678');
    expect(internationalDigits('0033 6 12 34 56 78', null)).toBe('33612345678');
    expect(internationalDigits('06 12 34 56 78', null)).toBeNull();
    expect(internationalDigits('(415) 555-0100', 'US')).toBe('14155550100');
    expect(internationalDigits('06 1234 5678', 'IT')).toBe('390612345678');
    expect(whatsappUrl('06 12 34 56 78', 'FR')).toBe('https://wa.me/33612345678');
    expect(telHref('06 12 34 56 78')).toBe('tel:0612345678');
    expect(telHref('*#06#')).toBe('tel:*%2306%23');
  });

  it('compares numbers however typed, and picks the one to call', () => {
    expect(samePhone('06 12 34 56 78', '+33612345678')).toBe(true);
    expect(samePhone('06 12 34 56 78', '06 12 34 56 79')).toBe(false);
    expect(samePhone('+33 (0)6 12 34 56 78', '0033 6 12 34 56 78')).toBe(true);
    // Two countries' numbers ending alike are two people: by their codes, or a national one in the person's country.
    expect(samePhone('+34 612 345 678', '+33 6 12 34 56 78')).toBe(false);
    expect(samePhone('+34 612 345 678', '06 12 34 56 78', 'FR')).toBe(false);
    expect(samePhone('+33 6 12 34 56 78', '06 12 34 56 78', 'FR')).toBe(true);
    // A French number on an American device: its country unknown, its last digits decide.
    expect(samePhone('+33 6 12 34 56 78', '06 12 34 56 78', 'US')).toBe(true);
    expect(telHref('+33 (0)6 12 34 56 78')).toBe('tel:+33612345678');
    const contact = person({ phones: [{ id: '1', number: '04 72', kind: 'work', label: '' }, { id: '2', number: '06 12', kind: 'mobile', label: '' }] });
    expect(callNumber(contact)?.id).toBe('2');
  });

  it('shows and dials a national number with the default code', () => {
    expect(shownNumber('06 12 34 56 78', 'FR')).toBe('+33 6 12 34 56 78');
    expect(shownNumber('06 12 34 56 78', null)).toBe('06 12 34 56 78');
    expect(shownNumber('+44 20 7946 0958', 'FR')).toBe('+44 20 7946 0958');
    expect(shownNumber('0044 20 7946 0958', 'FR')).toBe('+44 20 7946 0958');
    expect(shownNumber('(415) 555-0100', 'US')).toBe('+1 (415) 555-0100');
    expect(shownNumber('06 1234 5678', 'IT')).toBe('+39 06 1234 5678');
    // A short number has no international form: as typed.
    expect(shownNumber('3631', 'FR')).toBe('3631');
    expect(shownNumber('*#06#', 'FR')).toBe('*#06#');
    expect(dialNumber('06 12 34 56 78', 'FR')).toBe('+33612345678');
    expect(dialNumber('3631', 'FR')).toBe('3631');
    expect(telHref('06 12 34 56 78', 'FR')).toBe('tel:+33612345678');
    expect(smsHref('06 12 34 56 78', 'FR')).toBe('sms:+33612345678');
  });

  it('splits a number for the form and writes it back with its code', () => {
    expect(numberParts('+33 6 12 34 56 78', 'FR')).toEqual({ region: 'FR', rest: '6 12 34 56 78' });
    expect(numberParts('0033 6 12 34 56 78', null)).toEqual({ region: 'FR', rest: '6 12 34 56 78' });
    expect(numberParts('+352 621 123 456', 'FR')).toEqual({ region: 'LU', rest: '621 123 456' });
    expect(numberParts('+1 (416) 555-0100', 'FR')).toEqual({ region: 'US', rest: '(416) 555-0100' });
    // Canada shares the United States' code: the default decides between them.
    expect(numberParts('+1 (416) 555-0100', 'CA')).toEqual({ region: 'CA', rest: '(416) 555-0100' });
    expect(numberParts('06 12 34 56 78', 'FR')).toEqual({ region: 'FR', rest: '06 12 34 56 78' });
    expect(numberParts('', 'BE')).toEqual({ region: 'BE', rest: '' });
    // A code the list does not know stays in the field, whole.
    expect(numberParts('+376 312 345', 'FR')).toEqual({ region: null, rest: '+376 312 345' });

    expect(composeNumber('FR', '06 12 34 56 78')).toBe('+33 6 12 34 56 78');
    expect(composeNumber('FR', '(0)6 12 34 56 78')).toBe('+33 6 12 34 56 78');
    expect(composeNumber('FR', '6 12 34 56 78')).toBe('+33 6 12 34 56 78');
    expect(composeNumber('US', '1 415 555 0100')).toBe('+1 415 555 0100');
    expect(composeNumber('FR', '+44 20 7946 0958')).toBe('+44 20 7946 0958');
    expect(composeNumber(null, '06 12 34 56 78')).toBe('06 12 34 56 78');
    expect(composeNumber('FR', '  ')).toBe('');
    expect(composeNumber('FR', '3631')).toBe('3631');
    // Split and written again, a number keeps what it dials.
    for (const number of ['+33 6 12 34 56 78', '+1 (416) 555-0100', '+39 06 1234 5678', '+376 312 345']) {
      const parts = numberParts(number, 'FR');
      expect(dialNumber(composeNumber(parts.region, parts.rest))).toBe(dialNumber(number));
    }
    // A number nobody touched is written back as it was stored; one edited or given a code, with its code.
    const opened = { number: '06 12 34 56 78', ...numberParts('06 12 34 56 78', 'FR') };
    expect(writtenNumber(opened, 'FR', '06 12 34 56 78')).toBe('06 12 34 56 78');
    expect(writtenNumber(opened, 'FR', '06 12 34 56 79')).toBe('+33 6 12 34 56 79');
    expect(writtenNumber(opened, 'BE', '06 12 34 56 78')).toBe('+32 6 12 34 56 78');
    expect(writtenNumber(undefined, 'FR', '07 00 00 00 01')).toBe('+33 7 00 00 00 01');
  });
});

describe('birthdays', () => {
  const now = new Date(2026, 2, 10, 15).getTime();

  it('reads, writes and counts to the next one', () => {
    expect(readBirthday('--02-30')).toBeNull();
    expect(readBirthday('2000-02-29')).toEqual({ year: 2000, month: 2, day: 29 });
    expect(formatBirthday(readBirthday('1990-03-01')!)).toBe('1er mars 1990');
    setLocale('en');
    expect(formatBirthday(readBirthday('--03-12')!)).toBe('March 12');
    setLocale('fr');
    expect(birthdayWhen(readBirthday('1990-03-10')!, now)).toBe('Aujourd’hui · 36 ans');
    expect(birthdayWhen(readBirthday('--03-11')!, now)).toBe('Demain');
    expect(ageToday(readBirthday('1990-03-11')!, now)).toBe(35);
    expect(readTypedBirthday('12/03/1990')).toEqual({ year: 1990, month: 3, day: 12 });
    expect(readTypedBirthday('12/03')).toEqual({ year: null, month: 3, day: 12 });
    expect(readTypedBirthday('31/02')).toBeNull();
  });

  it('reads month first in American English only, on both clients', () => {
    expect(birthdayMonthFirst('US')).toBe(false);
    setLocale('en');
    expect(birthdayMonthFirst('US')).toBe(true);
    expect(birthdayMonthFirst('GB')).toBe(false);
    expect(birthdayMonthFirst('FR')).toBe(false);
    expect(birthdayMonthFirst(null)).toBe(false);
    expect(birthdayFieldText(readBirthday('1990-03-27'), true)).toBe('03/27/1990');
    expect(birthdayFieldText(readBirthday('--03-27'), false)).toBe('27/03');
    expect(birthdayFieldText(null)).toBe('');
  });

  it('lists the coming ones, nearest first', () => {
    const all = [person({ id: 'a', birthday: '--04-01' }), person({ id: 'b', birthday: '1990-03-12' }), person({ id: 'c', birthday: '--12-01' }), person({ id: 'd', birthday: '--03-11', trashedAt: 1 })];
    expect(upcomingBirthdays(all, now).map(entry => [entry.contact.id, entry.days])).toEqual([
      ['b', 2],
      ['a', 22],
    ]);
  });

  it('groups the year to come as both clients show it: today, this week, then by month', () => {
    const all = [person({ id: 'a', birthday: '--03-10' }), person({ id: 'b', birthday: '1990-03-12' }), person({ id: 'c', birthday: '--04-01' }), person({ id: 'd', birthday: '--02-01' })];
    expect(birthdayGroups(upcomingBirthdays(all, now, 366), now).map(group => [group.title, group.entries.map(entry => entry.contact.id)])).toEqual([
      ['Aujourd’hui', ['a']],
      ['Cette semaine', ['b']],
      ['Avril 2026', ['c']],
      ['Février 2027', ['d']],
    ]);
  });
});

describe('addresses and search', () => {
  it('writes an address in its country’s order', () => {
    expect(addressLine({ street: '12 rue des Lilas', postalCode: '69003', city: 'Lyon', region: '', country: 'France' })).toBe('12 rue des Lilas, 69003 Lyon, France');
    expect(addressLine({ street: '1 Main St', postalCode: '94105', city: 'San Francisco', region: 'CA', country: 'USA' })).toBe('1 Main St, San Francisco, CA 94105, USA');
    expect(mapsUrl({ street: '', postalCode: '', city: '', region: '', country: '' })).toBeNull();
  });

  it('finds by name, company and digits', () => {
    const all = [person({ id: 'a', firstName: 'Léa', company: 'Nord' }), person({ id: 'b', firstName: 'Paul', lastName: 'Léandre', phones: [{ id: 'p', number: '06 12 34 56 78', kind: 'mobile', label: '' }] })];
    expect(searchContacts(all, {}, 'lea').map(c => c.id)).toEqual(['a', 'b']);
    expect(searchContacts(all, {}, 'nord').map(c => c.id)).toEqual(['a']);
    expect(searchContacts(all, {}, '0612').map(c => c.id)).toEqual(['b']);
    // As a call shows it: the national number read in the person's country.
    expect(searchContacts(all, {}, '+33612', 'FR').map(c => c.id)).toEqual(['b']);
    expect(searchContacts(all, {}, '+33612').map(c => c.id)).toEqual([]);
  });
});

describe('record checks', () => {
  it('refuses a birthday that is no day, an entry without its id, an unknown label colour', () => {
    expect(isValidField('contact', 'birthday', '1990-13-40')).toBe(false);
    expect(isValidField('contact', 'birthday', '--02-29')).toBe(true);
    expect(isValidField('contact', 'phones', [{ id: 'p', number: '06', kind: 'mobile', label: '' }])).toBe(true);
    expect(isValidField('contact', 'phones', [{ number: '06', kind: 'mobile', label: '' }])).toBe(false);
    expect(isValidField('contact', 'phones', [{ id: 'p', number: '06', kind: 'mobile', label: '' }, { id: 'p', number: '07', kind: 'mobile', label: '' }])).toBe(false);
    expect(isValidField('contactLabel', 'color', 'chartreuse')).toBe(false);
  });
});
