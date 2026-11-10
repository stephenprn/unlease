import { setLocale } from '@unlease/core/i18n';
import { emptyContact, type Contact } from '../../models/contacts';
import { readBirthday } from '../birthdays';
import { reminderNear, reminderRuleWords } from '../birthdayReminders';
import { emailWishHref, smsWishHref, whatsappWishHref, wishChannelName, wishDaysLate, wishDueAfter, wishMessage, wishWays } from '../wishes';

const person = (fields: Partial<Contact>): Contact => ({ ...emptyContact(fields.id ?? 'x', fields.createdAt ?? 0), ...fields });
const phone = (id: string, number: string, kind = 'mobile') => ({ id, number, kind, label: '' });
const email = (id: string, address: string) => ({ id, address, kind: 'home', label: '' });

afterEach(() => setLocale('fr'));

describe('the wish', () => {
  it('greets by the first name, in the device’s language', () => {
    expect(wishMessage(person({ firstName: ' Léa ', lastName: 'Martin' }))).toBe('Joyeux anniversaire, Léa !');
    expect(wishMessage(person({ lastName: 'Martin' }))).toBe('Joyeux anniversaire !');
    setLocale('en');
    expect(wishMessage(person({ firstName: 'Léa' }))).toBe('Happy birthday, Léa!');
    expect(wishMessage(person({}))).toBe('Happy birthday!');
    expect(wishChannelName('sms')).toBe('Text');
  });

  it('writes it into each app’s address', () => {
    expect(smsWishHref('06 12 34 56 78', 'FR', 'Joyeux anniversaire, Léa !')).toBe('sms:+33612345678?body=Joyeux%20anniversaire%2C%20L%C3%A9a%20!');
    expect(smsWishHref('pas de numéro', 'FR', 'x')).toBeNull();
    expect(whatsappWishHref('06 12 34 56 78', 'FR', 'Bon anniversaire & bises')).toBe('https://wa.me/33612345678?text=Bon%20anniversaire%20%26%20bises');
    // A national number without a region: WhatsApp cannot be reached.
    expect(whatsappWishHref('06 12 34 56 78', null, 'x')).toBeNull();
    expect(emailWishHref(' lea@example.org ', 'Joyeux anniversaire', 'Joyeux anniversaire, Léa !')).toBe('mailto:lea@example.org?subject=Joyeux%20anniversaire&body=Joyeux%20anniversaire%2C%20L%C3%A9a%20!');
    expect(emailWishHref('pas une adresse', 's', 'b')).toBeNull();
  });

  it('goes the ways the person has, in the suite’s order, each once', () => {
    const lea = person({ firstName: 'Léa', phones: [phone('h', '04 72 00 00 00', 'home'), phone('m', '06 12 34 56 78')], emails: [email('x', 'pas une adresse'), email('e', 'lea@example.org'), email('f', 'autre@example.org')] });
    const ways = wishWays(lea, 'FR');
    expect(ways.map(way => way.channel)).toEqual(['sms', 'whatsapp', 'email']);
    // The mobile, shown with its calling code; the first address that is one.
    expect(ways[0]).toMatchObject({ to: '+33 6 12 34 56 78' });
    expect(ways[0]!.href.startsWith('sms:+33612345678?body=')).toBe(true);
    expect(ways[1]!.href.startsWith('https://wa.me/33612345678?text=')).toBe(true);
    expect(ways[2]).toMatchObject({ to: 'lea@example.org' });
    // A computer offers no SMS; a phone without WhatsApp, no WhatsApp.
    expect(wishWays(lea, 'FR', { sms: false }).map(way => way.channel)).toEqual(['whatsapp', 'email']);
    expect(wishWays(lea, 'FR', { whatsapp: false }).map(way => way.channel)).toEqual(['sms', 'email']);
    // A national number and no region: an SMS still goes, WhatsApp cannot.
    expect(wishWays(person({ phones: [phone('m', '06 12 34 56 78')] }), null).map(way => way.channel)).toEqual(['sms']);
    expect(wishWays(person({ firstName: 'Paul' }), 'FR')).toEqual([]);
  });
});

describe('when it is offered', () => {
  const at = (year: number, month: number, day: number, hour = 12): number => new Date(year, month - 1, day, hour).getTime();

  it('on the day and the day after, never before', () => {
    const birthday = readBirthday('1990-11-09')!;
    expect(wishDaysLate(birthday, at(2026, 11, 9, 0))).toBe(0);
    expect(wishDaysLate(birthday, at(2026, 11, 10, 23))).toBe(1);
    expect(wishDaysLate(birthday, at(2026, 11, 11))).toBeNull();
    expect(wishDaysLate(birthday, at(2026, 11, 8))).toBeNull();
    // Across the new year.
    expect(wishDaysLate(readBirthday('--12-31')!, at(2027, 1, 1))).toBe(1);
    // The 29th of February falls on the 28th in other years.
    expect(wishDaysLate(readBirthday('--02-29')!, at(2027, 3, 1))).toBe(1);
    expect([wishDueAfter(-1), wishDueAfter(0), wishDueAfter(1), wishDueAfter(2)]).toEqual([false, true, true, false]);
  });
});

describe('the reminder said', () => {
  it('says when the phone rings, the day before too when asked', () => {
    expect(reminderRuleWords({ dayBefore: false, hour: 9 })).toBe('Rappel le jour même à 09:00');
    expect(reminderRuleWords({ dayBefore: true, hour: 18 })).toBe('Rappel le jour même à 18:00, et la veille');
    setLocale('en');
    expect(reminderRuleWords({ dayBefore: true, hour: 9 })).toBe('Reminder on the day at 09:00, and the day before');
  });

  it('in the week before the birthday', () => {
    const birthday = readBirthday('--11-16')!;
    expect(reminderNear(birthday, new Date(2026, 10, 9, 12).getTime())).toBe(true);
    expect(reminderNear(birthday, new Date(2026, 10, 8, 12).getTime())).toBe(false);
    expect(reminderNear(birthday, new Date(2026, 10, 16, 23).getTime())).toBe(true);
  });
});
