import { setLocale } from '@unlease/core/i18n';
import type { CalendarEvent, CalendarFeed, CalendarLabel } from '../../models/events';
import { HOLIDAYS_FEED_ID } from '../../models/events';
import { erasedCount } from '@unlease/core/services/erase';
import { calendarEraseChanges, calendarEraseParts, type CalendarEraseLibrary } from '../erase';

const event = (id: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title: id,
  description: '',
  place: '',
  start: '2026-11-12T10:00',
  end: '2026-11-12T11:00',
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
});

const feed = (id: string, extra: Partial<CalendarFeed> = {}): CalendarFeed => ({ id, kind: 'ics', name: id, url: 'https://example.org/cal.ics', account: '', color: 'green', hidden: false, position: 'a0', refreshedAt: null, error: '', createdAt: 0, deletedAt: null, ...extra });
const label = (id: string, extra: Partial<CalendarLabel> = {}): CalendarLabel => ({ id, name: id, color: 'green', position: 'a0', createdAt: 0, deletedAt: null, ...extra });

const byId = <T extends { id: string }>(items: T[]): Record<string, T> => Object.fromEntries(items.map(item => [item.id, item]));

const LIBRARY: CalendarEraseLibrary = {
  events: byId([
    // Made here: a series with an exception, one in the bin, one tombstoned already.
    event('mine', { rrule: 'FREQ=WEEKLY', labelIds: ['work'] }),
    event('mine-moved', { recurringId: 'mine', originalStart: '2026-11-19T10:00' }),
    event('binned', { trashedAt: 5 }),
    event('gone', { deletedAt: 3 }),
    // From a file: a series and the occurrence moved here since (it carries the series' UID).
    event('imported', { uid: 'a@google.com', rrule: 'FREQ=DAILY', labelIds: ['work', 'home'] }),
    event('imported-moved', { uid: 'a@google.com', recurringId: 'imported', originalStart: '2026-11-13T10:00' }),
    // A subscription's and the holidays': the server's.
    event('served', { feedId: 'club', uid: 'club-1' }),
    event('holiday', { feedId: HOLIDAYS_FEED_ID, uid: 'h-1', start: '2026-12-25', end: '2026-12-26', timeZone: '' }),
  ]),
  labels: byId([label('work'), label('home'), label('old', { deletedAt: 1 })]),
  feeds: byId([feed('club', { name: 'Club de foot' }), feed(HOLIDAYS_FEED_ID, { kind: 'holidays', url: '' }), feed('left', { deletedAt: 2 })]),
};

const ids = (changes: readonly { id: string }[]): string[] => changes.map(change => change.id).sort();

describe('erasing Agenda', () => {
  beforeEach(() => setLocale('fr'));

  it('counts four parts apart: the records a tick erases, its line a series once', () => {
    const parts = calendarEraseParts(LIBRARY);
    expect(parts.map(part => [part.id, part.count])).toEqual([
      ['events', 3],
      ['imported', 2],
      ['subscriptions', 1],
      ['labels', 2],
    ]);
    const detail = (id: string) => parts.find(part => part.id === id)!.detail.replace(/\u00a0/g, ' ');
    expect(detail('events')).toBe('2 événements, dont 1 qui se répète et 1 dans la corbeille');
    expect(detail('imported')).toBe('1 événement venu d’un fichier ou d’une invitation, dont 1 qui se répète');
    expect(detail('subscriptions')).toBe('1 agenda (Club de foot), 1 événement en tout. Les jours fériés restent : ils se règlent dans l’Administration.');
    expect(detail('labels')).toBe('2 libellés · les événements qui les portent restent, sans eux');
  });

  it('erases one’s own events with their exceptions, the bin’s too, never a subscription’s', () => {
    const changes = calendarEraseChanges(LIBRARY, new Set(['events']), 9);
    expect(ids(changes)).toEqual(['binned', 'mine', 'mine-moved']);
    expect(changes.every(change => change.type === 'calendarEvent' && change.patch.deletedAt === 9)).toBe(true);
    expect(ids(calendarEraseChanges(LIBRARY, new Set(['imported']), 9))).toEqual(['imported', 'imported-moved']);
    // What the slip counts is what the row counted.
    expect(erasedCount(calendarEraseChanges(LIBRARY, new Set(['events', 'imported', 'labels']), 9))).toBe(3 + 2 + 2);
  });

  it('unsubscribes: the calendar’s record only, the holidays kept', () => {
    expect(calendarEraseChanges(LIBRARY, new Set(['subscriptions']), 9)).toEqual([{ type: 'calendarFeed', id: 'club', patch: { deletedAt: 9 } }]);
  });

  it('erases the labels as deleting one does: the events that stay lose them', () => {
    const changes = calendarEraseChanges(LIBRARY, new Set(['labels']), 9);
    expect(changes.filter(change => change.type === 'calendarLabel')).toEqual([
      { type: 'calendarLabel', id: 'work', patch: { deletedAt: 9 } },
      { type: 'calendarLabel', id: 'home', patch: { deletedAt: 9 } },
    ]);
    expect(changes.filter(change => change.type === 'calendarEvent')).toEqual([
      { type: 'calendarEvent', id: 'mine', patch: { labelIds: [] } },
      { type: 'calendarEvent', id: 'imported', patch: { labelIds: [] } },
    ]);
    // Erased with their events, those have nothing to lose.
    const both = calendarEraseChanges(LIBRARY, new Set(['labels', 'events', 'imported']), 9);
    expect(both.filter(change => change.type === 'calendarEvent' && 'labelIds' in change.patch)).toEqual([]);
  });

  it('has nothing to count in an empty agenda', () => {
    const parts = calendarEraseParts({ events: {}, labels: {}, feeds: {} });
    expect(parts.every(part => part.count === 0)).toBe(true);
    expect(calendarEraseChanges({ events: {}, labels: {}, feeds: {} }, new Set(['events', 'imported', 'subscriptions', 'labels']), 9)).toEqual([]);
  });
});
