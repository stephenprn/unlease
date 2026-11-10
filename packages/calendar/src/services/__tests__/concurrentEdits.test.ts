/** Two devices changing one repeating event before they see each other's change. */
import { formatHlc } from '@unlease/core/sync/hlc';
import { mergeRecord, writeFields, type SyncRecord } from '@unlease/core/sync/record';
import { mergeValues } from '@unlease/core/sync/textMerge';
import { blankDraft, createEvent, deleteOccurrence, draftOf, exceptionId, followingId, saveOccurrence, type EventChange } from '../editing';
import { findOccurrence, occurrencesIn } from '../occurrences';
import { eventFromRecord } from '../../sync/entities';
import type { CalendarEvent } from '../../models/events';

type Records = Map<string, SyncRecord>;

/** A device's records after one of its batches, every field under the batch's clock (`writeLocal`). */
function write(records: Records, changes: readonly EventChange[], wall: number, node: string): Records {
  const out = new Map(records);
  for (const change of changes) out.set(change.id, writeFields(out.get(change.id) ?? { type: 'calendarEvent', id: change.id, fields: {}, clocks: {} }, change.patch, formatHlc(wall, 0, node)));
  return out;
}

/** Both devices' records once synced, field by field. */
function sync(a: Records, b: Records): Records {
  const out = new Map(a);
  for (const [id, record] of b) out.set(id, mergeRecord(out.get(id), record).record);
  return out;
}

const events = (records: Records): Record<string, CalendarEvent> => Object.fromEntries([...records].map(([id, record]) => [id, eventFromRecord(record)]));
const shown = (records: Records, from: string, to: string) => occurrencesIn(Object.values(events(records)), from, to).map(item => `${item.start} ${item.event.title}`);

const series = createEvent({ ...blankDraft('2026-11-02T09:00', '2026-11-02T10:00', 'Europe/Paris'), title: 'Point', rrule: 'FREQ=DAILY' }, 1, 'series');
const start = write(new Map(), [series], 1, 'phone00001');
const at = (records: Records, occurrence: string) => findOccurrence(events(records), 'series', occurrence)!;

describe('two devices changing one repeating event', () => {
  it('each taking a different day out keeps both out (the days taken out merge as a set)', () => {
    const phone = write(start, deleteOccurrence(at(start, '2026-11-03T09:00'), 'this', events(start), 2), 2, 'phone00001');
    const web = write(start, deleteOccurrence(at(start, '2026-11-05T09:00'), 'this', events(start), 3), 3, 'web0000001');
    // What the server (or the device whose push came second) writes from the base both started at.
    const merged = mergeValues('calendarEvent', 'exdates', [], phone.get('series')!.fields.exdates, web.get('series')!.fields.exdates, true);
    expect(merged).toEqual(['2026-11-03T09:00', '2026-11-05T09:00']);
    const after = write(sync(phone, web), [{ type: 'calendarEvent', id: 'series', patch: { exdates: merged } }], 4, 'srvtest001');
    expect(shown(after, '2026-11-02', '2026-11-07')).toEqual(['2026-11-02T09:00 Point', '2026-11-04T09:00 Point', '2026-11-06T09:00 Point']);
  });

  it('both changing the same day write one exception, whose fields merge', () => {
    const one = at(start, '2026-11-04T09:00');
    const phoneChange = saveOccurrence(one, { ...draftOf(one), title: 'Point (salle B)' }, 'this', events(start), 2);
    const webChange = saveOccurrence(one, { ...draftOf(one), start: '2026-11-04T11:00', end: '2026-11-04T12:00' }, 'this', events(start), 3);
    expect(phoneChange.map(change => change.id)).toEqual([exceptionId('series', '2026-11-04T09:00')]);
    expect(webChange.map(change => change.id)).toEqual(phoneChange.map(change => change.id));
    const after = sync(write(start, phoneChange, 2, 'phone00001'), write(start, webChange, 3, 'web0000001'));
    // One occurrence that day, never two.
    expect(shown(after, '2026-11-04', '2026-11-05')).toHaveLength(1);
  });

  it('shows one of two exceptions made for one day before their ids were derived, and deleting it takes both', () => {
    const one = at(start, '2026-11-04T09:00');
    const twin = (id: string, title: string): EventChange[] => saveOccurrence(one, { ...draftOf(one), title }, 'this', events(start), 2).map(change => ({ ...change, id }));
    const both = sync(write(start, twin('older', 'Avant'), 2, 'phone00001'), write(start, twin('newer', 'Après'), 3, 'web0000001'));
    expect(shown(both, '2026-11-04', '2026-11-05')).toEqual(['2026-11-04T09:00 Après']);
    expect(findOccurrence(events(both), 'series', '2026-11-04T09:00')!.event.id).toBe('newer');
    const gone = write(both, deleteOccurrence(findOccurrence(events(both), 'series', '2026-11-04T09:00')!, 'this', events(both), 4), 4, 'phone00001');
    expect(shown(gone, '2026-11-04', '2026-11-05')).toEqual([]);
  });

  it('both splitting the series at the same day make one new series', () => {
    const one = at(start, '2026-11-05T09:00');
    const phoneSplit = saveOccurrence(one, { ...draftOf(one, events(start).series), title: 'Point v2' }, 'following', events(start), 2);
    const webSplit = saveOccurrence(one, { ...draftOf(one, events(start).series), place: 'Salle B' }, 'following', events(start), 3);
    expect(phoneSplit.map(change => change.id)).toContain(followingId('series', '2026-11-05T09:00'));
    const after = sync(write(start, phoneSplit, 2, 'phone00001'), write(start, webSplit, 3, 'web0000001'));
    const days = shown(after, '2026-11-02', '2026-11-09').map(line => line.slice(0, 16));
    expect(new Set(days).size).toBe(days.length);
  });
});
