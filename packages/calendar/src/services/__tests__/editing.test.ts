import { setLocale } from '@unlease/core/i18n';
import type { SyncRecord } from '@unlease/core/sync/record';
import { readQuickAdd } from '../quickAdd';
import { createEvent, deleteOccurrence, saveOccurrence, blankDraft, draftOf, handedDescription, handedRule, handedUrl, type EventChange } from '../editing';
import { occurrencesIn } from '../occurrences';
import { layoutDay } from '../layout';
import { eventFromRecord } from '../../sync/entities';
import type { CalendarEvent } from '../../models/events';

/** Applies a batch to a map of events, as `writeLocal` would. */
function apply(events: Record<string, CalendarEvent>, changes: readonly EventChange[]): Record<string, CalendarEvent> {
  const fields: Record<string, Record<string, unknown>> = {};
  for (const [id, event] of Object.entries(events)) fields[id] = { ...event };
  for (const change of changes) fields[change.id] = { ...(fields[change.id] ?? {}), ...change.patch };
  const out: Record<string, CalendarEvent> = {};
  for (const [id, value] of Object.entries(fields)) out[id] = eventFromRecord({ type: 'calendarEvent', id, fields: value, clocks: {} } as SyncRecord);
  return out;
}

describe('repeating events', () => {
  const start = createEvent({ ...blankDraft('2026-11-02T09:00', '2026-11-02T10:00', 'Europe/Paris'), title: 'Sport', rrule: 'FREQ=WEEKLY;BYDAY=MO' }, 1, 'series');
  const base = apply({}, [start]);

  it('shows each occurrence, minus those taken out', () => {
    const items = occurrencesIn(Object.values(base), '2026-11-01', '2026-11-30');
    expect(items.map(item => item.firstDay)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
    const after = apply(base, deleteOccurrence(items[1]!, 'this', base, 2));
    expect(occurrencesIn(Object.values(after), '2026-11-01', '2026-11-30').map(item => item.firstDay)).toEqual(['2026-11-02', '2026-11-16', '2026-11-23']);
  });

  it('changes one occurrence as an exception', () => {
    const items = occurrencesIn(Object.values(base), '2026-11-01', '2026-11-30');
    const third = items[2]!;
    const changes = saveOccurrence(third, { ...draftOf(third), title: 'Sport (salle B)', start: '2026-11-16T18:00', end: '2026-11-16T19:00' }, 'this', base, 3);
    const after = apply(base, changes);
    const shown = occurrencesIn(Object.values(after), '2026-11-01', '2026-11-30');
    expect(shown.map(item => `${item.start} ${item.event.title}`)).toEqual(['2026-11-02T09:00 Sport', '2026-11-09T09:00 Sport', '2026-11-16T18:00 Sport (salle B)', '2026-11-23T09:00 Sport']);
  });

  it('splits the series for this one and the following', () => {
    const items = occurrencesIn(Object.values(base), '2026-11-01', '2026-11-30');
    const changes = saveOccurrence(items[2]!, { ...draftOf(items[2]!, base.series), start: '2026-11-16T10:00', end: '2026-11-16T11:00' }, 'following', base, 4);
    const after = apply(base, changes);
    const shown = occurrencesIn(Object.values(after), '2026-11-01', '2026-12-01');
    expect(shown.map(item => item.start)).toEqual(['2026-11-02T09:00', '2026-11-09T09:00', '2026-11-16T10:00', '2026-11-23T10:00', '2026-11-30T10:00']);
  });

  it('moves the whole series, its days taken out with it', () => {
    const items = occurrencesIn(Object.values(base), '2026-11-01', '2026-11-30');
    const without = apply(base, deleteOccurrence(items[1]!, 'this', base, 2));
    const first = occurrencesIn(Object.values(without), '2026-11-01', '2026-11-30')[0]!;
    const after = apply(without, saveOccurrence(first, { ...draftOf(first, without.series), start: '2026-11-02T08:00', end: '2026-11-02T09:00' }, 'all', without, 5));
    expect(occurrencesIn(Object.values(after), '2026-11-01', '2026-11-30').map(item => item.start)).toEqual(['2026-11-02T08:00', '2026-11-16T08:00', '2026-11-23T08:00']);
  });

  it('carries a change to all onto the exceptions, but what one changed on its own', () => {
    const items = occurrencesIn(Object.values(base), '2026-11-01', '2026-11-30');
    // The third moved an hour later, the fourth renamed: each keeps its own change.
    let after = apply(base, saveOccurrence(items[2]!, { ...draftOf(items[2]!), start: '2026-11-16T10:00', end: '2026-11-16T11:00' }, 'this', base, 3));
    after = apply(after, saveOccurrence(items[3]!, { ...draftOf(items[3]!), title: 'Sport (piscine)' }, 'this', after, 4));
    const first = occurrencesIn(Object.values(after), '2026-11-01', '2026-11-30')[0]!;
    after = apply(after, saveOccurrence(first, { ...draftOf(first, after.series), title: 'Gym', color: 'lilac' }, 'all', after, 5));
    const shown = occurrencesIn(Object.values(after), '2026-11-01', '2026-11-30');
    expect(shown.map(item => `${item.start} ${item.event.title} ${item.event.color}`)).toEqual(['2026-11-02T09:00 Gym lilac', '2026-11-09T09:00 Gym lilac', '2026-11-16T10:00 Gym lilac', '2026-11-23T09:00 Sport (piscine) lilac']);
  });

  it('lays overlapping events side by side', () => {
    const a = createEvent({ ...blankDraft('2026-11-02T09:00', '2026-11-02T11:00', 'Europe/Paris'), title: 'A' }, 1, 'a');
    const b = createEvent({ ...blankDraft('2026-11-02T10:00', '2026-11-02T12:00', 'Europe/Paris'), title: 'B' }, 1, 'b');
    const c = createEvent({ ...blankDraft('2026-11-02T13:00', '2026-11-02T14:00', 'Europe/Paris'), title: 'C' }, 1, 'c');
    const events = apply({}, [a, b, c]);
    process.env.TZ = 'Europe/Paris';
    const boxes = layoutDay(occurrencesIn(Object.values(events), '2026-11-02', '2026-11-03'), '2026-11-02');
    const byTitle = Object.fromEntries(boxes.map(box => [box.occurrence.event.title, box]));
    expect(byTitle.A).toMatchObject({ column: 0, columns: 2 });
    expect(byTitle.B).toMatchObject({ column: 1, columns: 2 });
    expect(byTitle.C).toMatchObject({ column: 0, columns: 1 });
  });
});

describe('quick add', () => {
  beforeEach(() => setLocale('fr'));
  const today = '2026-11-02';

  it('reads French and English', () => {
    expect(readQuickAdd('Dîner chez Paul jeudi 20h', today)).toMatchObject({ title: 'Dîner chez Paul', start: '2026-11-05T20:00', end: '2026-11-05T21:00' });
    expect(readQuickAdd('Lunch with Sam at Pizzeria tomorrow 1pm', today)).toMatchObject({ title: 'Lunch with Sam', place: 'Pizzeria', start: '2026-11-03T13:00' });
    expect(readQuickAdd('Congrès du 12 au 14 mars à Lyon', today)).toMatchObject({ title: 'Congrès', place: 'Lyon', start: '2027-03-12', end: '2027-03-15' });
    expect(readQuickAdd('Réunion de 14h à 16h30 le 10/11', today)).toMatchObject({ title: 'Réunion', start: '2026-11-10T14:00', end: '2026-11-10T16:30' });
    expect(readQuickAdd('Appeler maman', today)).toMatchObject({ title: 'Appeler maman', start: today, foundDay: false, foundTime: false });
  });
});

describe('searching events', () => {
  it('finds a title whatever its accents and case', async () => {
    const { searchEvents } = await import('../search');
    const dinner = createEvent({ ...blankDraft('2026-11-04T20:00', '2026-11-04T22:00', 'Europe/Paris'), title: 'Dîner chez Paul', place: 'Lyon' }, 1, 'd');
    const events = Object.values(apply({}, [dinner]));
    expect(searchEvents(events, {}, 'diner', () => '').map(event => event.id)).toEqual(['d']);
    expect(searchEvents(events, {}, 'Dîner lyon', () => '').map(event => event.id)).toEqual(['d']);
    expect(searchEvents(events, {}, 'Lisbonne', () => '')).toEqual([]);
  });

  it('puts the coming ones first, nearest first, when asked from a day (a mention), else the latest first', async () => {
    const { searchEvents } = await import('../search');
    const christmas = (year: number, id: string) => createEvent({ ...blankDraft(`${year}-12-25`, `${year}-12-26`, 'Europe/Paris'), title: 'Noël' }, 1, id);
    const events = Object.values(apply({}, [christmas(2025, 'past'), christmas(2028, 'far'), christmas(2026, 'next')]));
    expect(searchEvents(events, {}, 'noel', () => '').map(event => event.id)).toEqual(['far', 'next', 'past']);
    expect(searchEvents(events, {}, 'noel', () => '', '2026-11-03').map(event => event.id)).toEqual(['next', 'far', 'past']);
  });
});

describe('a new event from its address', () => {
  it('reads the words it hands as words, the saved link mentioned after them', () => {
    expect(handedDescription(['Salle {a=javascript\\:alert(1):B}', '  {@page=0193}  '], 'link1')).toBe('Salle \\{a=javascript\\\\:alert(1):B\\}\n\\{@page=0193\\}\n{@link=link1}');
    expect(handedDescription([null, undefined, ''], 'not an id!')).toBe('');
    expect(handedDescription(['Apporter les partitions'], null)).toBe('Apporter les partitions');
  });

  it('keeps only a web address', () => {
    expect(handedUrl('https://example.org/soiree?utm_source=x')).toBe('https://example.org/soiree');
    expect(handedUrl('example.org/soiree')).toBe('https://example.org/soiree');
    for (const url of ['javascript:alert(1)', 'intent://x#Intent;end', 'carnet://note/1', 'tel:+33612345678', '', null]) expect(handedUrl(url)).toBe('');
  });

  it('keeps a repeat it reads, written as the form writes it', () => {
    expect(handedRule('RRULE:freq=weekly;byday=MO,WE;interval=2')).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE');
    expect(handedRule('FREQ=MONTHLY;COUNT=3')).toBe('FREQ=MONTHLY;COUNT=3');
    for (const rule of ['FREQ=SECONDLY', 'BYDAY=MO', 'nonsense', '', null, undefined]) expect(handedRule(rule)).toBe('');
  });
});
