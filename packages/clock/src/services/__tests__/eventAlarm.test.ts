/** « Ajouter une alarme » for a morning's event: its hour on this phone's clock, its title, and its repetition as an alarm's days. */
import type { CalendarEvent } from '@unlease/calendar/models/events';
import { occurrencesIn, type Occurrence } from '@unlease/calendar/services/occurrences';
import { addDays, wallToInstant } from '@unlease/calendar/services/time';
import { EVERY_DAY } from '../../models/alarm';
import { draftDate, newAlarmFields } from '../editing';
import { draftRing } from '../editor';
import { eventAlarmDays, eventAlarmDraft } from '../eventAlarm';

const PARIS = 'Europe/Paris';
const PREFS = { defaultSound: 'birdsong', weatherDefault: false, agendaDefault: true };

const event = (id: string, start: string, rrule = '', extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    id, title: id, description: '', place: '', start, end: start.length > 10 ? `${start.slice(0, 11)}23:30` : addDays(start, 1), timeZone: start.length > 10 ? PARIS : '', rrule, exdates: [], recurringId: null, originalStart: '',
    reminders: [], labelIds: [], contactIds: [], files: [], feedId: null, uid: '', url: '', color: null, dayOff: false, trashedAt: null, createdAt: 1, deletedAt: null, editedAt: 1, ...extra,
  }) as CalendarEvent;

/** The occurrence of `events`' first series starting at `start` (in its zone), as Agenda draws it. */
function occurrence(events: CalendarEvent[], start: string): Occurrence {
  const day = start.slice(0, 10);
  const found = occurrencesIn(events, addDays(day, -2), addDays(day, 3)).find(item => item.start === start);
  if (!found) throw new Error(`no occurrence at ${start}`);
  return found;
}

/** The days an alarm takes from the series `rrule` started on Tuesday 3 November 2026 at 07:15, at its occurrence `start`. */
function daysOf(rrule: string, start = '2026-11-17T07:15', first = '2026-11-03T07:15') {
  const series = event('Yoga', first, rrule);
  return eventAlarmDays(occurrence([series], start), series, PARIS);
}

describe('an event’s repetition as an alarm’s days', () => {
  it('rings once on its day when it does not repeat', () => {
    expect(daysOf('', '2026-11-03T07:15')).toEqual({ days: [], date: '2026-11-03' });
  });

  it('rings every day for a daily event, and on its weekdays for one kept to some', () => {
    expect(daysOf('FREQ=DAILY')).toEqual({ days: EVERY_DAY, date: null });
    expect(daysOf('FREQ=DAILY;BYDAY=MO,WE,FR', '2026-11-18T07:15')).toEqual({ days: [1, 3, 5], date: null });
  });

  it('rings on a weekly event’s days, or its start’s weekday when it names none', () => {
    expect(daysOf('FREQ=WEEKLY;BYDAY=TU,TH')).toEqual({ days: [2, 4], date: null });
    expect(daysOf('FREQ=WEEKLY')).toEqual({ days: [2], date: null });
    expect(daysOf('FREQ=WEEKLY;WKST=SU;BYDAY=SA,TU')).toEqual({ days: [2, 6], date: null });
  });

  it('reads a position in a weekly rule’s BYDAY as its weekday alone, as Agenda does', () => {
    // `1TU` means nothing in a weekly rule (RFC 5545): Agenda shows every Tuesday.
    expect(daysOf('FREQ=WEEKLY;BYDAY=1TU')).toEqual({ days: [2], date: null });
    expect(daysOf('FREQ=DAILY;BYDAY=-1TU,TH')).toEqual({ days: [2, 4], date: null });
  });

  it('rings once for what an alarm’s weekly days cannot say', () => {
    const once = { days: [], date: '2026-11-17' };
    expect(daysOf('FREQ=WEEKLY;INTERVAL=2')).toEqual(once);
    expect(daysOf('FREQ=DAILY;INTERVAL=2;BYDAY=TU', '2026-11-17T07:15')).toEqual(once);
    expect(daysOf('FREQ=MONTHLY;BYDAY=3TU')).toEqual(once);
    expect(daysOf('FREQ=MONTHLY;BYMONTHDAY=17', '2026-11-17T07:15', '2026-10-17T07:15')).toEqual(once);
    expect(daysOf('FREQ=YEARLY', '2026-11-17T07:15', '2025-11-17T07:15')).toEqual(once);
    // Kept to some months, or to some days of the month: not every week.
    expect(daysOf('FREQ=DAILY;BYMONTH=11')).toEqual(once);
    expect(daysOf('FREQ=WEEKLY;BYDAY=TU;BYMONTHDAY=17,18,19')).toEqual(once);
  });

  it('rings once on a series’ last occurrence, and on its days before', () => {
    // Three Tuesdays from 3 November: the 17th is the last.
    expect(daysOf('FREQ=WEEKLY;COUNT=3')).toEqual({ days: [], date: '2026-11-17' });
    expect(daysOf('FREQ=WEEKLY;COUNT=3', '2026-11-10T07:15')).toEqual({ days: [2], date: null });
    expect(daysOf('FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261117T235959Z')).toEqual({ days: [], date: '2026-11-17' });
    expect(daysOf('FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261119')).toEqual({ days: [2, 4], date: null });
    // An end still ahead: the alarm repeats (its days cannot say when to stop).
    expect(daysOf('FREQ=DAILY;UNTIL=20261231')).toEqual({ days: EVERY_DAY, date: null });
  });

  it('moves the days with the start when this phone’s day is another', () => {
    // Monday 23:00 in New York is Tuesday 05:00 in Paris.
    const series = event('Call', '2026-11-16T23:00', 'FREQ=WEEKLY;BYDAY=MO,WE', { timeZone: 'America/New_York', end: '2026-11-16T23:30' });
    const item = occurrence([series], '2026-11-16T23:00');
    expect(eventAlarmDays(item, series, PARIS)).toEqual({ days: [2, 4], date: null });
    expect(eventAlarmDraft(item, series, PREFS, PARIS)).toMatchObject({ time: '05:00', days: [2, 4], date: null, label: 'Call' });
    // Saturday 01:00 in Paris is Friday evening in New York.
    const early = event('Early', '2026-11-21T01:00', 'FREQ=WEEKLY', { end: '2026-11-21T02:00' });
    expect(eventAlarmDays(occurrence([early], '2026-11-21T01:00'), early, 'America/New_York')).toEqual({ days: [5], date: null });
  });

  it('rings once for an occurrence moved on its own, and keeps the days of one only retitled', () => {
    const series = event('Yoga', '2026-11-03T07:15', 'FREQ=WEEKLY');
    const moved = event('moved', '2026-11-18T08:00', '', { recurringId: 'Yoga', originalStart: '2026-11-17T07:15', end: '2026-11-18T09:00' });
    expect(eventAlarmDays(occurrence([series, moved], '2026-11-18T08:00'), series, PARIS)).toEqual({ days: [], date: '2026-11-18' });
    const retitled = event('retitled', '2026-11-17T07:15', '', { recurringId: 'Yoga', originalStart: '2026-11-17T07:15' });
    expect(eventAlarmDays(occurrence([series, retitled], '2026-11-17T07:15'), series, PARIS)).toEqual({ days: [2], date: null });
    // The series out of reach (not synced here): once.
    expect(eventAlarmDays(occurrence([series], '2026-11-17T07:15'), null, PARIS)).toEqual({ days: [], date: '2026-11-17' });
  });
});

describe('the draft for a morning’s event', () => {
  it('takes its hour on this phone’s clock, its title and the phone’s defaults; nothing for an all-day event', () => {
    const train = event('Train', '2026-11-18T09:30', '', { title: '  Train   pour Lyon ' });
    expect(eventAlarmDraft(occurrence([train], '2026-11-18T09:30'), train, PREFS, PARIS)).toEqual({
      time: '09:30', days: [], date: '2026-11-18', label: 'Train pour Lyon', sound: 'birdsong', vibrate: true, weather: false, agenda: true, offDays: true, link: null,
    });
    const long = event('Long', '2026-11-18T09:30', '', { title: 'x'.repeat(120) });
    expect(eventAlarmDraft(occurrence([long], '2026-11-18T09:30'), long, PREFS, PARIS)?.label).toHaveLength(80);
    const holiday = event('Holiday', '2026-11-18');
    expect(eventAlarmDraft(occurrence([holiday], '2026-11-18'), holiday, PREFS, PARIS)).toBeNull();
  });

  it('rings once on the event’s day, not the next day its time comes', () => {
    // Monday 16 November at 21:00; the event is on Wednesday.
    const now = wallToInstant('2026-11-16T21:00', PARIS);
    const draft = { time: '09:30', days: [], date: '2026-11-18' };
    expect(draftDate(draft, now, PARIS)).toBe('2026-11-18');
    expect(draftRing(draft, now, PARIS)).toEqual({ day: '2026-11-18', at: wallToInstant('2026-11-18T09:30', PARIS) });
    expect(newAlarmFields({ ...eventAlarmDraft(occurrence([event('Dentist', '2026-11-18T09:30')], '2026-11-18T09:30'), null, PREFS, PARIS)! }, now, PARIS)).toMatchObject({ time: '09:30', days: [], date: '2026-11-18' });
    // Its moment gone by (the wheels turned back on today's event): the next time it comes.
    expect(draftDate({ time: '20:00', date: '2026-11-16' }, now, PARIS)).toBe('2026-11-17');
    // Repeating, it has no day.
    expect(newAlarmFields({ ...eventAlarmDraft(occurrence([event('Yoga', '2026-11-17T07:15', 'FREQ=WEEKLY')], '2026-11-17T07:15'), event('Yoga', '2026-11-17T07:15', 'FREQ=WEEKLY'), PREFS, PARIS)! }, now, PARIS)).toMatchObject({ days: [2], date: null });
  });
});
