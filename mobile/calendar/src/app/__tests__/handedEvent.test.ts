/**
 * Another app's « Ajouter à l'agenda » (Android's INSERT with CalendarContract's extras, as IntakeModule
 * hands them): instants as wall times in the zone named or the device's, all-day days as Android keeps
 * them (or as another app's local midnights mean them), the end exclusive, a repeat kept when it
 * reads, guests matched to contacts by their address.
 */
import { emptyContact, type Contact } from '@unlease/contacts/models/contacts';

import { handedEvent, handedGuests } from '../handedEvent';

const person = (id: string, emails: readonly string[], patch: Partial<Contact> = {}): Contact => ({
  ...emptyContact(id, 1),
  firstName: id,
  emails: emails.map((address, index) => ({ id: `${id}-${index}`, address, kind: 'home', label: '' })),
  ...patch,
});

const people = {
  lea: person('lea', ['Lea@Example.org']),
  old: person('old', ['paul@example.org'], { mergedInto: 'paul' }),
  paul: person('paul', ['paul@example.org']),
  gone: person('gone', ['gone@example.org'], { trashedAt: 5 }),
};

const paris = { zone: 'Europe/Paris', people };

describe('another app’s new event', () => {
  it('reads its instants as wall times in the device’s zone, or the zone it names', () => {
    const begin = Date.UTC(2026, 10, 20, 19, 0);
    const extras = { title: 'Dîner chez Léa', description: 'Apporter le dessert', eventLocation: '3 quai Rambaud, Lyon', beginTime: begin, endTime: begin + 2 * 3_600_000, availability: 0, accessLevel: 2 };
    expect(handedEvent(extras, paris)).toEqual({ title: 'Dîner chez Léa', description: 'Apporter le dessert', place: '3 quai Rambaud, Lyon', start: '2026-11-20T20:00', end: '2026-11-20T22:00', tz: 'Europe/Paris' });
    expect(handedEvent({ ...extras, eventTimezone: 'America/New_York' }, paris)).toMatchObject({ start: '2026-11-20T14:00', end: '2026-11-20T16:00', tz: 'America/New_York' });
    // A zone the platform does not know is the device's.
    expect(handedEvent({ ...extras, eventTimezone: 'Mars/Olympus' }, paris)).toMatchObject({ start: '2026-11-20T20:00', tz: 'Europe/Paris' });
    // Digits as text are an instant too.
    expect(handedEvent({ beginTime: String(begin) }, paris)).toMatchObject({ start: '2026-11-20T20:00' });
  });

  it('leaves a missing end, or one before the start, to the form', () => {
    const begin = Date.UTC(2026, 10, 20, 19, 0);
    expect(handedEvent({ beginTime: begin }, paris)).toEqual({ start: '2026-11-20T20:00', tz: 'Europe/Paris' });
    expect(handedEvent({ beginTime: begin, endTime: begin - 1 }, paris)).toEqual({ start: '2026-11-20T20:00', tz: 'Europe/Paris' });
    expect(handedEvent({ title: 'Sans date' }, paris)).toEqual({ title: 'Sans date' });
  });

  it('reads all-day days as Android keeps them, midnight UTC with the end the day after', () => {
    expect(handedEvent({ allDay: true, beginTime: Date.UTC(2026, 11, 24), endTime: Date.UTC(2026, 11, 26) }, paris)).toEqual({ start: '2026-12-24', end: '2026-12-26' });
    // West of Greenwich too: Android's midnight UTC is the day, never the evening before.
    expect(handedEvent({ allDay: true, beginTime: Date.UTC(2026, 11, 24), endTime: Date.UTC(2026, 11, 25) }, { zone: 'America/Los_Angeles', people })).toEqual({ start: '2026-12-24', end: '2026-12-25' });
    // No end: the one day.
    expect(handedEvent({ allDay: 'true', beginTime: Date.UTC(2026, 11, 24) }, paris)).toEqual({ start: '2026-12-24', end: '2026-12-25' });
  });

  it('reads another app’s local midnights as its days, and an end within a day as that day kept', () => {
    // Midnight in Paris is 23:00 UTC the day before.
    expect(handedEvent({ allDay: true, beginTime: Date.UTC(2026, 11, 23, 23), endTime: Date.UTC(2026, 11, 24, 23) }, paris)).toEqual({ start: '2026-12-24', end: '2026-12-25' });
    expect(handedEvent({ allDay: true, beginTime: Date.UTC(2026, 11, 23, 23), endTime: Date.UTC(2026, 11, 25, 17) }, paris)).toEqual({ start: '2026-12-24', end: '2026-12-26' });
  });

  it('keeps a repeat Agenda reads, and none it does not', () => {
    const begin = Date.UTC(2026, 10, 20, 17, 0);
    expect(handedEvent({ beginTime: begin, rrule: 'FREQ=WEEKLY;BYDAY=FR;COUNT=10' }, paris)).toMatchObject({ rrule: 'FREQ=WEEKLY;BYDAY=FR;COUNT=10' });
    expect(handedEvent({ beginTime: begin, rrule: 'FREQ=HOURLY' }, paris)).not.toHaveProperty('rrule');
  });

  it('makes guests of the contacts with their address, and writes the others at the description’s end', () => {
    const handed = handedEvent({ description: 'Réunion de chantier', 'android.intent.extra.EMAIL': 'Léa <lea@example.org>, paul@example.org; gone@example.org, nina@example.org, not an address' }, paris);
    expect(handed.guests).toBe('lea,paul');
    expect(handed.description).toBe('Réunion de chantier\n\ngone@example.org, nina@example.org');
    // A list, as a mail's EXTRA_EMAIL, reads the same.
    expect(handedEvent({ 'android.intent.extra.EMAIL': ['nina@example.org', 'NINA@example.org'] }, paris)).toEqual({ description: 'nina@example.org' });
  });

  it('reads nothing from what is no extras', () => {
    expect(handedEvent(null, paris)).toEqual({});
    expect(handedEvent(['title'], paris)).toEqual({});
    expect(handedEvent({ title: 42, beginTime: 'tomorrow', allDay: true }, paris)).toEqual({});
  });
});

describe('the guests a link hands the form', () => {
  it('keeps the contacts still in the address book, a merged one as the one kept', () => {
    expect(handedGuests('lea, old,gone,unknown,lea,', people)).toEqual(['lea', 'paul']);
    expect(handedGuests(undefined, people)).toEqual([]);
  });
});
