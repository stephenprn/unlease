import { emptyContact, type Contact } from '../../models/contacts';
import { asideKey, casedName, diffParts, cleanupCounts, cleanupWrites, findCleanups, fitsRegion, shownCleanups, tidyEmail, tidyNumber } from '../cleanup';

const person = (fields: Partial<Contact> & { id: string }): Contact => ({ ...emptyContact(fields.id, fields.createdAt ?? 0), ...fields });
const phone = (id: string, number: string) => ({ id, number, kind: 'mobile', label: '' });
const email = (id: string, address: string) => ({ id, address, kind: 'home', label: '' });
const ids = (): (() => string) => {
  let n = 0;
  return () => `n${(n += 1)}`;
};
const byId = (...contacts: Contact[]): Record<string, Contact> => Object.fromEntries(contacts.map(contact => [contact.id, contact]));

describe('cleanup: numbers', () => {
  it('writes a number one way, its country and its digits unchanged', () => {
    expect(tidyNumber('0612345678', 'FR')).toBe('06 12 34 56 78');
    expect(tidyNumber('06.12.34.56.78', null)).toBe('06 12 34 56 78');
    expect(tidyNumber('0033 6 12 34 56 78', 'FR')).toBe('+33 6 12 34 56 78');
    expect(tidyNumber('+33 (0)6 12 34 56 78', null)).toBe('+33 6 12 34 56 78');
    expect(tidyNumber('+33612345678', null)).toBe('+33 6 12 34 56 78');
    expect(tidyNumber('+1 (415) 555-0123', null)).toBe('+1 415 555 0123');
    expect(tidyNumber('+49-30-1234567', null)).toBe('+49 30 1234567');
    expect(tidyNumber('+44 7700 900123', null)).toBe('+44 7700 900123');
    expect(tidyNumber('*123#', 'FR')).toBe('*123#');
    expect(tidyNumber('3631', 'FR')).toBe('3631');
  });

  it('knows which national numbers fit a country', () => {
    expect(fitsRegion('0612345678', 'FR')).toBe(true);
    expect(fitsRegion('612345678', 'FR')).toBe(false);
    expect(fitsRegion('612345678', 'ES')).toBe(true);
    expect(fitsRegion('4155550123', 'US')).toBe(true);
    expect(fitsRegion('0612345678', 'HU')).toBe(false);
  });

  it('adds the country code where the number fits, offers it unticked where it does not, and leaves short numbers', () => {
    const lea = person({ id: 'lea', firstName: 'Léa', phones: [phone('a', '06 12 34 56 78'), phone('b', '+44 7700 900123'), phone('c', '3631'), phone('d', '061234')] });
    const found = findCleanups('countryCodes', [lea], 'FR');
    expect(found.map(finding => [finding.before, finding.after, finding.ticked])).toEqual([
      ['06 12 34 56 78', '+33 6 12 34 56 78', true],
      ['061234', '+33 61234', false],
    ]);
    expect(found[1]!.why?.params).toEqual({ code: '33' });
    expect(findCleanups('countryCodes', [lea], null)).toEqual([]);
    // A country whose trunk prefix is not a single 0: listed, never fixed here.
    expect(findCleanups('countryCodes', [lea], 'HU').every(finding => finding.edit === null && !finding.ticked)).toBe(true);
  });

  it('lists numbers to tidy and the same number twice in a contact', () => {
    const paul = person({ id: 'paul', phones: [phone('a', '06.98.76.54.32'), phone('b', '+33 6 98 76 54 32'), phone('c', 'n/a'), phone('d', '+33 4 78 12 34 56')] });
    const found = findCleanups('numbers', [paul], 'FR');
    expect(found.map(finding => [finding.before, finding.edit?.kind, finding.ticked])).toEqual([
      ['06.98.76.54.32', 'phone', true],
      ['+33 6 98 76 54 32', 'dropPhone', true],
      ['n/a', 'dropPhone', false],
    ]);
    const writes = cleanupWrites(byId(paul), found.filter(finding => finding.ticked), { now: 5, newId: ids() });
    expect(writes).toEqual([{ id: 'paul', patch: { phones: [phone('a', '06 98 76 54 32'), phone('c', 'n/a'), phone('d', '+33 4 78 12 34 56')] } }]);
  });
});

describe('cleanup: names', () => {
  it('writes names in their usual case', () => {
    expect(casedName('JEAN-PIERRE', true)).toBe('Jean-Pierre');
    expect(casedName('DE LA FONTAINE', false)).toBe('de la Fontaine');
    expect(casedName('LE PEN', false)).toBe('Le Pen');
    expect(casedName("O'BRIEN", false)).toBe("O'Brien");
    expect(casedName('d’artagnan', false)).toBe('d’Artagnan');
    expect(casedName('MCDONALD', false)).toBe('McDonald');
    expect(casedName('van gogh', false)).toBe('van Gogh');
    expect(casedName('JB', true)).toBe('JB');
  });

  it('fixes capitals, lower case and spaces, and offers a split unticked', () => {
    const shout = person({ id: 'shout', firstName: 'JEAN', lastName: 'DUPONT' });
    const quiet = person({ id: 'quiet', firstName: 'léa', lastName: 'martin' });
    const spaces = person({ id: 'spaces', firstName: ' Noah ', lastName: 'Bernard  Petit' });
    const whole = person({ id: 'whole', firstName: 'Chloé Petit' });
    const fine = person({ id: 'fine', firstName: 'Inès', lastName: 'Lefèvre' });
    const acronym = person({ id: 'acronym', firstName: 'EDF' });
    const found = findCleanups('names', [shout, quiet, spaces, whole, fine, acronym], null);
    const of = (id: string) => found.find(finding => finding.contactId === id);
    expect(of('shout')).toMatchObject({ after: 'Jean Dupont', ticked: true, why: { key: 'In capitals.' } });
    expect(of('quiet')).toMatchObject({ after: 'Léa Martin', ticked: true });
    expect(of('spaces')).toMatchObject({ after: 'Noah Bernard Petit', ticked: true, why: { key: 'Extra spaces.' } });
    expect(of('whole')).toMatchObject({ after: 'Chloé Petit', ticked: false, edit: { kind: 'name', firstName: 'Chloé', lastName: 'Petit' } });
    expect(of('fine')).toBeUndefined();
    expect(of('acronym')).toMatchObject({ after: 'Edf', ticked: false });
  });

  it('moves an e-mail or a number written as the name to its place', () => {
    const mail = person({ id: 'mail', firstName: 'Hugo.Moreau@example.org' });
    const number = person({ id: 'number', firstName: '06 11 22 33 44', phones: [phone('a', '+33 6 11 22 33 44')] });
    const found = findCleanups('names', [mail, number], 'FR');
    const writes = cleanupWrites(byId(mail, number), found, { now: 5, newId: ids() });
    expect(writes).toEqual([
      { id: 'mail', patch: { firstName: '', emails: [{ id: 'n1', address: 'hugo.moreau@example.org', kind: 'other', label: '' }] } },
      { id: 'number', patch: { firstName: '' } },
    ]);
  });
});

describe('cleanup: e-mails and empty contacts', () => {
  it('tidies addresses, offers a typo’s fix, flags what is no address and drops a repeat', () => {
    expect(tidyEmail(' Léa <LEA@Example.org> ')).toBe('lea@example.org');
    expect(tidyEmail('mailto:noah @example.org')).toBe('noah@example.org');
    const sarah = person({ id: 'sarah', firstName: 'Sarah', emails: [email('a', 'Sarah.Cohen@Example.org'), email('b', 'sarah.cohen@example.org'), email('c', 'sarah@gmial.com'), email('d', 'sarah at home'), email('e', 'ok@example.org')] });
    const found = findCleanups('emails', [sarah], null);
    expect(found.map(finding => [finding.before, finding.after, finding.ticked, finding.edit?.kind ?? null])).toEqual([
      ['Sarah.Cohen@Example.org', 'sarah.cohen@example.org', true, 'email'],
      ['sarah.cohen@example.org', { key: 'Removed' }, true, 'dropEmail'],
      ['sarah@gmial.com', 'sarah@gmail.com', false, 'email'],
      ['sarah at home', null, false, null],
    ]);
  });

  it('sends empty contacts to the bin, those holding something else unticked; never the bin’s or a merged one', () => {
    const blank = person({ id: 'blank', phones: [phone('a', '')] });
    const noted = person({ id: 'noted', note: 'Met at the market' });
    const binned = person({ id: 'binned', trashedAt: 1 });
    const named = person({ id: 'named', jobTitle: 'Plumber' });
    const found = findCleanups('empty', [blank, noted, binned, named], null);
    expect(found.map(finding => [finding.contactId, finding.ticked])).toEqual([
      ['blank', true],
      ['noted', false],
    ]);
    expect(cleanupWrites(byId(blank, noted, binned), found, { now: 7, newId: ids() })).toEqual([
      { id: 'blank', patch: { trashedAt: 7 } },
      { id: 'noted', patch: { trashedAt: 7 } },
    ]);
  });
});

describe('cleanup: the place', () => {
  it('counts each tool’s findings, those set aside left out', () => {
    const lea = person({ id: 'lea', firstName: 'LÉA', lastName: 'MARTIN', phones: [phone('a', '0612345678')], emails: [email('e', 'LEA@example.org')] });
    expect(cleanupCounts([lea], 'FR')).toEqual({ countryCodes: 1, numbers: 1, names: 1, emails: 1, empty: 0 });
    const names = findCleanups('names', [lea], 'FR');
    expect(shownCleanups('names', [lea], 'FR', new Set(names.map(asideKey)))).toEqual([]);
    // Set aside while it reads the same: changed, it is offered again.
    expect(shownCleanups('names', [{ ...lea, lastName: 'DURAND' }], 'FR', new Set(names.map(asideKey)))).toHaveLength(1);
  });

  it('composes several findings on one contact into one write, and skips a contact gone since', () => {
    const lea = person({ id: 'lea', phones: [phone('a', '0612345678'), phone('b', '06 12 34 56 78')] });
    const found = [...findCleanups('numbers', [lea], 'FR'), ...findCleanups('countryCodes', [lea], 'FR')];
    const writes = cleanupWrites(byId(lea), found, { now: 1, newId: ids() });
    expect(writes).toHaveLength(1);
    expect(writes[0]!.patch.phones).toEqual([phone('a', '+33 6 12 34 56 78')]);
    expect(cleanupWrites(byId({ ...lea, trashedAt: 3 }), found, { now: 1, newId: ids() })).toEqual([]);
  });

  it('marks what changed between two values, letter by letter', () => {
    expect(diffParts('06 12 34 56 78', '+33 6 12 34 56 78')).toEqual([
      { text: '+33 ', changed: true },
      { text: '6 12 34 56 78', changed: false },
    ]);
    expect(diffParts('lucas girard', 'Lucas Girard').filter(part => part.changed).map(part => part.text)).toEqual(['L', 'G']);
    expect(diffParts('Lucas Girard', 'lucas girard').filter(part => part.changed).map(part => part.text)).toEqual(['l', 'g']);
    expect(diffParts('same', 'same')).toEqual([{ text: 'same', changed: false }]);
  });
});
