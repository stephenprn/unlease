/** The calendar as Android's calendar holds it: calendars, times in zones, repeats, exceptions, what goes. */
import { mirrorChanges } from '@unlease/core/services/mirror';
import type { CalendarEvent, CalendarFeed, CalendarLabel } from '../../models/events';
import { mirroredCalendars, mirroredEvents, OWN_CALENDAR, pigmentHex, utcStamp } from '../phoneMirror';

function event(id: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    title: id,
    description: '',
    place: '',
    start,
    end,
    timeZone: 'Europe/Paris',
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
    createdAt: 0,
    deletedAt: null,
    editedAt: 0,
    ...extra,
  };
}

const feed = (id: string, extra: Partial<CalendarFeed> = {}): CalendarFeed => ({
  id,
  kind: 'ics',
  name: id,
  url: 'https://example.org/cal.ics',
  account: '',
  color: 'blue',
  hidden: false,
  position: 'a',
  refreshedAt: null,
  error: '',
  createdAt: 0,
  deletedAt: null,
  ...extra,
});

const label: CalendarLabel = { id: 'work', name: 'Work', color: 'green', position: 'a', createdAt: 0, deletedAt: null };
const OPTIONS = { deviceZone: 'America/New_York' };
const byId = <T extends { readonly id: string }>(rows: readonly T[]): Map<string, T> => new Map(rows.map(row => [row.id, row]));

describe('mirroredCalendars', () => {
  it('holds one’s own calendar, then each followed one alive, hidden ones off at first', () => {
    const rows = mirroredCalendars([feed('subs', { hidden: true }), feed('gone', { deletedAt: 1 }), feed('holidays', { kind: 'holidays', name: 'Holidays', color: 'red' })], { name: 'Agenda', color: '#5b8a32' });
    expect(rows.map(row => [row.id, row.visible])).toEqual([
      [OWN_CALENDAR, true],
      ['subs', false],
      ['holidays', true],
    ]);
    expect(rows[0]!.color).toBe('#5B8A32');
    expect(rows[2]!.color).toBe(pigmentHex('red'));
  });

  it('writes a calendar again for its name or colour, never for being hidden', () => {
    const [, before] = mirroredCalendars([feed('subs')], { name: 'Agenda', color: '#000000' });
    const [, hidden] = mirroredCalendars([feed('subs', { hidden: true })], { name: 'Agenda', color: '#000000' });
    const [, renamed] = mirroredCalendars([feed('subs', { name: 'Other' })], { name: 'Agenda', color: '#000000' });
    expect(hidden!.fingerprint).toBe(before!.fingerprint);
    expect(renamed!.fingerprint).not.toBe(before!.fingerprint);
  });
});

describe('mirroredEvents', () => {
  it('writes a timed event as instants in its zone', () => {
    const [row] = mirroredEvents([event('a', '2026-11-02T14:30', '2026-11-02T16:00', { place: 'Lyon' })], {}, {}, OPTIONS);
    expect(row).toMatchObject({
      calendarId: OWN_CALENDAR,
      allDay: false,
      start: Date.UTC(2026, 10, 2, 13, 30),
      end: Date.UTC(2026, 10, 2, 15, 0),
      timeZone: 'Europe/Paris',
      location: 'Lyon',
      rrule: null,
      duration: null,
      color: null,
    });
  });

  it('reads a floating time in the phone’s zone', () => {
    const [row] = mirroredEvents([event('a', '2026-11-02T09:00', '2026-11-02T10:00', { timeZone: '' })], {}, {}, OPTIONS);
    expect(row!.timeZone).toBe('America/New_York');
    expect(row!.start).toBe(Date.UTC(2026, 10, 2, 14, 0));
  });

  it('writes an all-day event at midnight UTC, its end the day after', () => {
    const [row] = mirroredEvents([event('a', '2026-11-02', '2026-11-04', { timeZone: '' })], {}, {}, OPTIONS);
    expect(row).toMatchObject({ allDay: true, timeZone: 'UTC', start: Date.UTC(2026, 10, 2), end: Date.UTC(2026, 10, 4) });
  });

  it('writes a series with its rule, its length, UNTIL in UTC and its days taken out', () => {
    const [row] = mirroredEvents(
      [event('s', '2026-11-02T09:00', '2026-11-02T10:30', { rrule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T090000', exdates: ['2026-11-09T09:00'] })],
      {},
      {},
      OPTIONS,
    );
    expect(row).toMatchObject({ end: null, duration: 'P5400S', rrule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T080000Z', exdate: '20261109T080000Z' });
  });

  it('ends a timed series on a day after that day, and an all-day series on a day', () => {
    const [timed] = mirroredEvents([event('s', '2026-11-02T09:00', '2026-11-02T10:00', { rrule: 'FREQ=DAILY;UNTIL=20261105' })], {}, {}, OPTIONS);
    expect(timed!.rrule).toBe('FREQ=DAILY;UNTIL=20261105T225959Z');
    const [allDay] = mirroredEvents([event('y', '2026-03-12', '2026-03-13', { rrule: 'FREQ=YEARLY;UNTIL=20300312T000000Z' })], {}, {}, OPTIONS);
    expect(allDay).toMatchObject({ duration: 'P1D', rrule: 'FREQ=YEARLY;UNTIL=20300312', exdate: null });
  });

  it('writes an exception as its own event and takes its occurrence out of the series', () => {
    const rows = byId(
      mirroredEvents(
        [
          event('s', '2026-11-02T09:00', '2026-11-02T10:00', { rrule: 'FREQ=WEEKLY' }),
          event('moved', '2026-11-10T11:00', '2026-11-10T12:00', { recurringId: 's', originalStart: '2026-11-09T09:00', title: 'Moved' }),
          // Taken out through an exception in the bin: no event, the day still out.
          event('cancelled', '2026-11-16T09:00', '2026-11-16T10:00', { recurringId: 's', originalStart: '2026-11-16T09:00', trashedAt: 1 }),
        ],
        {},
        {},
        OPTIONS,
      ),
    );
    expect([...rows.keys()]).toEqual(['s', 'moved']);
    expect(rows.get('s')!.exdate).toBe('20261109T080000Z,20261116T080000Z');
    expect(rows.get('moved')).toMatchObject({ rrule: null, start: Date.UTC(2026, 10, 10, 10, 0), title: 'Moved', open: 'event/s?at=2026-11-09T09%3A00' });
    expect(rows.get('s')!.open).toBe('event/s');
  });

  it('leaves out the bin, the deleted, an exception whose series is gone and a gone calendar’s events', () => {
    const rows = mirroredEvents(
      [
        event('binned', '2026-11-02T09:00', '2026-11-02T10:00', { trashedAt: 1 }),
        event('gone', '2026-11-02T09:00', '2026-11-02T10:00', { deletedAt: 1 }),
        event('orphan', '2026-11-02T09:00', '2026-11-02T10:00', { recurringId: 'nothing', originalStart: '2026-11-02T09:00' }),
        event('sub', '2026-11-02T09:00', '2026-11-02T10:00', { feedId: 'old' }),
        event('kept', '2026-11-02T09:00', '2026-11-02T10:00', { feedId: 'subs' }),
      ],
      {},
      { old: feed('old', { deletedAt: 1 }), subs: feed('subs') },
      OPTIONS,
    );
    expect(rows.map(row => [row.id, row.calendarId])).toEqual([['kept', 'subs']]);
  });

  it('paints an event its own colour or its label’s, else leaves it its calendar’s', () => {
    const rows = byId(
      mirroredEvents(
        [event('own', '2026-11-02', '2026-11-03', { color: 'red', labelIds: ['work'] }), event('labelled', '2026-11-02', '2026-11-03', { labelIds: ['work'] }), event('plain', '2026-11-02', '2026-11-03')],
        { work: label },
        {},
        OPTIONS,
      ),
    );
    expect(rows.get('own')!.color).toBe(pigmentHex('red'));
    expect(rows.get('labelled')!.color).toBe(pigmentHex('green'));
    expect(rows.get('plain')!.color).toBeNull();
  });

  it('writes a description as plain words, its mentions named', () => {
    const [row] = mirroredEvents([event('a', '2026-11-02', '2026-11-03', { description: 'With {@contact=lea} {b:now}' })], {}, {}, { ...OPTIONS, nameOf: () => 'Léa' });
    expect(row!.description).toBe('With Léa now');
  });

  it('writes an event again only when what the phone shows changed', () => {
    const before = mirroredEvents([event('a', '2026-11-02', '2026-11-03', { reminders: [10] })], {}, {}, OPTIONS);
    const written = before.map(row => ({ id: row.id, fingerprint: row.fingerprint }));
    expect(mirrorChanges(mirroredEvents([event('a', '2026-11-02', '2026-11-03', { reminders: [30] })], {}, {}, OPTIONS), written).upserts).toEqual([]);
    expect(mirrorChanges(mirroredEvents([event('a', '2026-11-02', '2026-11-03', { title: 'New' })], {}, {}, OPTIONS), written).upserts).toHaveLength(1);
  });

  it('writes stamps in UTC', () => {
    expect(utcStamp(Date.UTC(2026, 0, 5, 7, 3, 9))).toBe('20260105T070309Z');
  });
});
