/** The morning digest: its words in both languages, the day gathered in another zone, its moment across a change of the clocks. */
import { setLocale } from '@unlease/core/i18n';
import type { Contact } from '@unlease/contacts/models/contacts';
import type { Note } from '@unlease/notes/models/entities';
import type { CalendarEvent } from '../../models/events';
import { CALENDAR_PREFS_DEFAULTS, readCalendarPrefs } from '../../models/prefs';
import { DIGEST_LATE_MS, DIGEST_LINES, digestEntries, digestMoment, digestWorthRinging, nextDigest, writeDigest, zonedDigest, type DigestEntry } from '../digest';
import { birthdaysIn } from '../layers';
import { occurrencesIn } from '../occurrences';
import { addDays, wallToInstant } from '../time';
import { planToday, type DayItem } from '../today';

const DAY = '2026-11-09';
/** `plural` puts a no-break space between the number and its word. */
const plain = (text: string): string => text.replace(/\u00a0/g, ' ');

function event(id: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    title: id,
    description: '',
    place: '',
    start,
    end,
    timeZone: '',
    rrule: '',
    exdates: [],
    recurringId: null,
    originalStart: '',
    reminders: [],
    labelIds: [],
    contactIds: [],
    files: [],
    feedId: null,
    uid: '',
    url: '',
    color: null,
    trashedAt: null,
    createdAt: 1,
    deletedAt: null,
    editedAt: 1,
    ...extra,
  };
}

function note(id: string, reminderAt: number | null, extra: Partial<Note> = {}): Note {
  return {
    id,
    kind: 'text',
    title: id,
    body: '',
    rich: false,
    drawing: '',
    color: null,
    pattern: null,
    pinned: false,
    archived: false,
    trashedAt: null,
    labelIds: [],
    position: 'a0',
    reminderAt,
    code: '',
    emblem: null,
    hint: '',
    modules: null,
    contactIds: [],
    createdAt: 1,
    deletedAt: null,
    editedAt: 1,
    ...extra,
  };
}

function contact(id: string, firstName: string, birthday: string): Contact {
  return {
    id,
    firstName,
    lastName: '',
    company: '',
    jobTitle: '',
    phones: [],
    emails: [],
    addresses: [],
    birthday,
    note: '',
    labelIds: [],
    favorite: false,
    photoId: null,
    photoUploaded: false,
    photoMime: '',
    mergedInto: null,
    trashedAt: null,
    createdAt: 1,
    deletedAt: null,
    editedAt: 1,
  };
}

const entry = (kind: DigestEntry['kind'], title: string, time = ''): DigestEntry => ({ kind, title, time });

describe('the morning digest’s words', () => {
  beforeEach(() => setLocale('fr'));

  it('counts the day in its title and lists it, whole days first', () => {
    const digest = writeDigest([entry('birthday', 'Anniversaire de Léa (30 ans)'), entry('event', 'Dentiste', '09:00 – 09:30'), entry('reminder', 'Appeler la banque', '12:00'), entry('event', 'Dîner', '20:00 – 22:00')], 0)!;
    expect(plain(digest.title)).toBe('Aujourd’hui : 2 événements, Anniversaire de Léa (30 ans), 1 rappel');
    expect(digest.body.split('\n')).toEqual(['Anniversaire de Léa (30 ans)', '09:00 – 09:30 · Dentiste', '12:00 · Appeler la banque', '20:00 – 22:00 · Dîner']);
  });

  it('counts several birthdays, pages and the reminders missed', () => {
    const digest = writeDigest([entry('birthday', 'A'), entry('birthday', 'B'), entry('page', 'Voyage')], 2)!;
    expect(plain(digest.title)).toBe('Aujourd’hui : 2 anniversaires, 1 page, 2 rappels en retard');
    expect(plain(digest.body).split('\n').at(-1)).toBe('2 rappels en retard');
  });

  it('keeps to a few lines, and says how many more', () => {
    const many = Array.from({ length: DIGEST_LINES + 3 }, (_, index) => entry('event', `E${index}`, `${String(8 + index).padStart(2, '0')}:00`));
    const lines = writeDigest(many, 0)!.body.split('\n');
    expect(lines).toHaveLength(DIGEST_LINES + 1);
    expect(plain(lines.at(-1)!)).toBe('Et 3 autres éléments');
    expect(plain(writeDigest(many.slice(0, DIGEST_LINES + 1), 0)!.body.split('\n').at(-1)!)).toBe('Et 1 autre élément');
  });

  it('rings on a day with nothing only when asked', () => {
    expect(writeDigest([], 0)).toBeNull();
    expect(writeDigest([], 0, { empty: true })).toEqual({ title: 'Rien de prévu aujourd’hui', body: 'La journée est à vous.' });
    // Reminders missed alone are worth the morning.
    expect(plain(writeDigest([], 1)!.title)).toBe('Aujourd’hui : 1 rappel en retard');
  });

  it('speaks English', () => {
    setLocale('en');
    const digest = writeDigest([entry('event', 'Dentist', '9:00'), entry('event', 'Lunch', '12:30')], 1)!;
    expect(plain(digest.title)).toBe('Today: 2 events, 1 reminder overdue');
  });
});

describe('the day a digest reads', () => {
  beforeEach(() => setLocale('fr'));

  it('reads « Aujourd’hui » as the phone plans it', () => {
    const events = [event('Réunion', `${DAY}T10:00`, `${DAY}T11:00`), event('Congés', DAY, addDays(DAY, 1))];
    const items: DayItem[] = occurrencesIn(events, DAY, addDays(DAY, 2)).map(occurrence => ({ kind: 'event', key: occurrence.key, occurrence, color: null }));
    for (const birthday of birthdaysIn([contact('c', 'Léa', '1996-11-09')], DAY, addDays(DAY, 1))) items.push({ kind: 'birthday', key: birthday.key, birthday });
    const plan = planToday({ today: DAY, now: wallToInstant(`${DAY}T07:30`, ''), items });
    expect(digestEntries(plan).map(each => [each.kind, plain(each.title), each.time])).toEqual([
      ['birthday', 'Anniversaire de Léa (30 ans)', ''],
      ['event', 'Congés', ''],
      ['event', 'Réunion', '10:00 – 11:00'],
    ]);
  });

  it('gathers a browser’s day in its own zone, whatever the server’s', () => {
    const zone = 'America/New_York';
    const events = [
      // 23:30 in New York is the next day in Europe: still the 9th there.
      event('Late', `${DAY}T23:30`, `${addDays(DAY, 1)}T00:30`, { timeZone: zone }),
      // 01:00 in Paris on the 10th is 19:00 on the 9th in New York.
      event('Call', `${addDays(DAY, 1)}T01:00`, `${addDays(DAY, 1)}T02:00`, { timeZone: 'Europe/Paris' }),
      // The 8th's evening in New York: not that day.
      event('Before', `${addDays(DAY, -1)}T20:00`, `${addDays(DAY, -1)}T21:00`, { timeZone: zone }),
      event('Holiday', DAY, addDays(DAY, 1)),
      event('Hidden', `${DAY}T12:00`, `${DAY}T13:00`, { timeZone: zone, feedId: 'f' }),
    ];
    const notes = [note('Call back', wallToInstant(`${DAY}T08:15`, zone)), note('Missed', wallToInstant(`${addDays(DAY, -2)}T08:00`, zone)), note('Archived', wallToInstant(`${addDays(DAY, -1)}T08:00`, zone), { archived: true })];
    const { entries, overdue } = zonedDigest({
      events,
      filter: { hiddenFeeds: new Set(['f']) },
      contacts: [contact('c', 'Léa', '--11-09')],
      notes,
      pages: [{ key: 'p', pageId: 'p', title: 'Plan', icon: null, day: DAY, time: '18:00' }, { key: 'q', pageId: 'q', title: 'Other day', icon: null, day: addDays(DAY, 1), time: null }],
      day: DAY,
      zone,
      twelveHours: false,
    });
    expect(entries.map(each => [each.kind, plain(each.title), each.time])).toEqual([
      ['birthday', 'Anniversaire de Léa', ''],
      ['event', 'Holiday', ''],
      ['reminder', 'Call back', '08:15'],
      ['page', 'Plan', '18:00'],
      ['event', 'Call', '19:00 – 20:00'],
      ['event', 'Late', 'À partir de 23:30'],
    ]);
    expect(overdue).toBe(1);
    // The layers left off read nothing.
    expect(zonedDigest({ events: [], contacts: null, notes: null, pages: [], day: DAY, zone, twelveHours: false })).toEqual({ entries: [], overdue: 0 });
  });
});

describe('when a digest rings', () => {
  it('rings today while to come or still worth it, else tomorrow', () => {
    const zone = 'Europe/Paris';
    const moment = digestMoment(DAY, '07:30', zone);
    expect(nextDigest(moment - 60_000, '07:30', zone)).toEqual({ day: DAY, at: moment });
    expect(nextDigest(moment + 60_000, '07:30', zone)).toEqual({ day: DAY, at: moment });
    expect(digestWorthRinging(moment, moment + DIGEST_LATE_MS - 1)).toBe(true);
    expect(digestWorthRinging(moment, moment + DIGEST_LATE_MS)).toBe(false);
    expect(nextDigest(moment + DIGEST_LATE_MS, '07:30', zone)).toEqual({ day: addDays(DAY, 1), at: digestMoment(addDays(DAY, 1), '07:30', zone) });
  });

  it('keeps its hour across a change of the clocks', () => {
    const zone = 'Europe/Paris';
    // The night the clocks go forward (29 March 2026): 07:30 is 05:30 UTC, not 06:30.
    const evening = wallToInstant('2026-03-28T22:00', zone);
    expect(nextDigest(evening, '07:30', zone)).toEqual({ day: '2026-03-29', at: Date.UTC(2026, 2, 29, 5, 30) });
    expect(nextDigest(wallToInstant('2026-10-24T22:00', zone), '07:30', zone).at).toBe(Date.UTC(2026, 9, 25, 6, 30));
  });

  it('is off until chosen, at a time offered', () => {
    expect(CALENDAR_PREFS_DEFAULTS.digest).toBe(false);
    expect(readCalendarPrefs({ digest: true, digestAt: '06:30' })).toMatchObject({ digest: true, digestAt: '06:30', digestEmpty: false });
    expect(readCalendarPrefs({ digestAt: '03:00' }).digestAt).toBe(CALENDAR_PREFS_DEFAULTS.digestAt);
  });
});
