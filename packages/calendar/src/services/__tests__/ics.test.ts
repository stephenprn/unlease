import { parseRich } from '@unlease/core/services/richText';
import { parseIcs, writeIcs } from '../ics';
import { planImport } from '../importing';
import { feedDrafts, planFeed } from '../feeds';
import { eventFromRecord } from '../../sync/entities';
import type { CalendarEvent } from '../../models/events';

const GOOGLE = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'X-WR-CALNAME:Perso',
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Paris',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Paris:20261102T143000',
  'DTEND;TZID=Europe/Paris:20261102T153000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO',
  'EXDATE;TZID=Europe/Paris:20261109T143000',
  'UID:abc@google.com',
  'SUMMARY:Cours de piano\\, salle 2',
  'DESCRIPTION:Apporter les partitions\\nEt le métronome',
  'LOCATION:12 rue de la Paix\\, Paris',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'TRIGGER:-PT15M',
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Paris:20261116T160000',
  'DTEND;TZID=Europe/Paris:20261116T170000',
  'RECURRENCE-ID;TZID=Europe/Paris:20261116T143000',
  'UID:abc@google.com',
  'SUMMARY:Cours de piano (déplacé)',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261224',
  'DTEND;VALUE=DATE:20261227',
  'UID:noel@google.com',
  'SUMMARY:Noël chez les parents',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261103T090000Z',
  'DURATION:PT45M',
  'UID:utc@google.com',
  'SUMMARY:Appel',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('iCalendar', () => {
  it('reads Google’s export', () => {
    const calendar = parseIcs(GOOGLE);
    expect(calendar.name).toBe('Perso');
    expect(calendar.events).toHaveLength(4);
    const [series, moved, christmas, call] = calendar.events;
    expect(series).toMatchObject({ uid: 'abc@google.com', title: 'Cours de piano, salle 2', place: '12 rue de la Paix, Paris', start: '2026-11-02T14:30', end: '2026-11-02T15:30', timeZone: 'Europe/Paris', rrule: 'FREQ=WEEKLY;BYDAY=MO', exdates: ['2026-11-09T14:30'], reminders: [15] });
    expect(series!.description).toBe('Apporter les partitions\nEt le métronome');
    expect(moved).toMatchObject({ recurrenceId: '2026-11-16T14:30', start: '2026-11-16T16:00' });
    expect(christmas).toMatchObject({ start: '2026-12-24', end: '2026-12-27', timeZone: '' });
    expect(call).toMatchObject({ start: '2026-11-03T09:00', end: '2026-11-03T09:45', timeZone: 'UTC' });
  });

  it('plans an import once, exceptions after their series', () => {
    const plan = planImport(parseIcs(GOOGLE), [], 1000, (() => { let n = 0; return () => `id${(n += 1)}`; })());
    expect(plan.creates).toHaveLength(4);
    const exception = plan.creates.find(entry => entry.fields.originalStart === '2026-11-16T14:30')!;
    expect(exception.fields.recurringId).toBe('id1');
    const again = planImport(parseIcs(GOOGLE), plan.creates.map(entry => eventFromRecord({ type: 'calendarEvent', id: entry.id, fields: entry.fields, clocks: {} })), 1000);
    expect(again.creates).toHaveLength(0);
    expect(again.skipped).toBe(4);
  });

  it('takes the tracking off an imported event’s link', () => {
    const file = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:diner@test', 'DTSTART:20261105T190000Z', 'DTEND:20261105T220000Z', 'SUMMARY:Dîner', 'URL:https://www.example.org/recette?id=4&utm_source=newsletter&fbclid=IwAR0', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const plan = planImport(parseIcs(file), [], 1000, () => 'e1');
    expect(plan.creates[0]!.fields.url).toBe('https://www.example.org/recette?id=4');
  });

  it('writes what it reads back', () => {
    const events: CalendarEvent[] = parseIcs(GOOGLE).events.slice(0, 1).map((event, index) => ({ ...event, id: `e${index}`, recurringId: null, originalStart: '', labelIds: [], contactIds: [], files: [], feedId: null, color: null, trashedAt: null, createdAt: 0, deletedAt: null, editedAt: 0 }));
    const text = writeIcs(events, { name: 'Agenda', productId: '-//Test//FR', now: 0, plain: event => event.description });
    expect(text).toContain('DTSTART;TZID=Europe/Paris:20261102T143000');
    expect(text).toContain('SUMMARY:Cours de piano\\, salle 2');
    expect(text).toContain('TRIGGER:-PT15M');
    expect(parseIcs(text).events[0]).toMatchObject({ start: '2026-11-02T14:30', rrule: 'FREQ=WEEKLY;BYDAY=MO', exdates: ['2026-11-09T14:30'] });
  });

  it('keeps a hostile calendar’s words as words, and only its web addresses', () => {
    const hostile = (url: string) =>
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:trap@example.org',
        'DTSTART:20261105T190000Z',
        'DTEND:20261105T200000Z',
        'SUMMARY:Réunion',
        'DESCRIPTION:Cliquez {a=javascript\\:alert(1):ici} et {@page=0193abc} \\\\',
        `URL:${url}`,
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
    const description = parseIcs(hostile('')).events[0]!.description;
    expect(parseRich(description).some(run => run.kind !== 'text' || run.marks.a)).toBe(true);
    const [draft] = feedDrafts(parseIcs(hostile('javascript:alert(1)')), 'feed1', '2026-11-01');
    expect(parseRich(draft!.fields.description as string)).toEqual([{ kind: 'text', text: description, marks: {} }]);
    expect(draft!.fields.url).toBe('');
    const [created] = planImport(parseIcs(hostile('intent://scan/#Intent;scheme=zxing;end')), [], 1000, () => 'e1').creates;
    expect(parseRich(created!.fields.description as string)).toEqual([{ kind: 'text', text: description, marks: {} }]);
    expect(created!.fields.url).toBe('');
    expect(feedDrafts(parseIcs(hostile('https://example.org/soiree')), 'feed1', '2026-11-01')[0]!.fields.url).toBe('https://example.org/soiree');
  });

  it('rewrites a kept event its calendar served as markup, once read again', () => {
    const drafts = feedDrafts(parseIcs(GOOGLE), 'feed1', '2026-11-01');
    const first = planFeed(drafts, [], () => 'f1', 5).writes.find(write => write.fields.uid === 'noel@google.com')!;
    // As an older server kept it: the calendar's words as markup, its address as served.
    const fields = { ...first.fields, description: '{a=javascript\\:x:ici}', url: 'javascript:x' };
    const stored = [{ event: eventFromRecord({ type: 'calendarEvent', id: first.id, fields, clocks: {} }), fields }];
    const again = planFeed(drafts.filter(draft => draft.uid === 'noel@google.com'), stored, () => 'never', 6);
    expect(again.writes).toEqual([{ id: first.id, fields: { description: '', url: '' }, created: false }]);
  });

  it('rewrites only what a subscription changed', () => {
    let n = 0;
    const drafts = feedDrafts(parseIcs(GOOGLE), 'feed1', '2026-11-01');
    const first = planFeed(drafts, [], () => `f${(n += 1)}`, 5);
    expect(first.writes).toHaveLength(4);
    const stored = first.writes.map(write => {
      const record = { type: 'calendarEvent', id: write.id, fields: write.fields, clocks: {} };
      return { event: eventFromRecord(record), fields: write.fields };
    });
    const second = planFeed(drafts, stored, () => 'never', 6);
    expect(second.writes).toHaveLength(0);
    expect(second.removals).toHaveLength(0);
    const third = planFeed(drafts.slice(0, 2), stored, () => 'never', 7);
    expect(third.removals).toHaveLength(2);
  });
});
