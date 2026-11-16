/** The week of mornings both homes show. Events and alarms on the device's clock, as Agenda's tests write them. */
import type { CalendarEvent } from '@unlease/calendar/models/events';
import { wallToInstant } from '@unlease/calendar/services/time';
import type { Alarm } from '../../models/alarm';
import { chosenMorning, morningAlarmAt, stillToRing, weekOfMornings } from '../week';

const local = (wall: string): number => wallToInstant(wall, '');

function alarm(id: string, extra: Partial<Alarm> = {}): Alarm {
  return { id, time: '07:30', days: [1, 2, 3, 4, 5], date: null, enabled: true, label: '', sound: 'melody', vibrate: true, weather: true, agenda: true, skipDay: null, offDays: false, eventId: null, eventStart: '', before: 0, createdAt: 1, deletedAt: null, editedAt: 1, ...extra };
}

function event(id: string, start: string, end: string): CalendarEvent {
  return { id, title: id, description: '', place: '', start, end, timeZone: '', rrule: '', exdates: [], recurringId: null, originalStart: '', reminders: [], labelIds: [], contactIds: [], files: [], feedId: null, uid: '', url: '', color: null, dayOff: false, trashedAt: null, createdAt: 1, deletedAt: null, editedAt: 1 } as CalendarEvent;
}

describe('the week of mornings', () => {
  const alarms = [alarm('weekdays'), alarm('saturday', { time: '09:00', days: [6] }), alarm('skipping', { time: '06:00', days: [3], skipDay: '2026-11-18' }), alarm('off', { time: '05:00', days: [0, 1, 2, 3, 4, 5, 6], enabled: false })];
  const events = [event('Standup', '2026-11-17T07:45', '2026-11-17T08:00'), event('Dentist', '2026-11-17T09:30', '2026-11-17T10:00'), event('Market', '2026-11-21T11:00', '2026-11-21T12:00'), event('Day off', '2026-11-22', '2026-11-23')];
  // Monday 16 November 2026, in the evening.
  const now = local('2026-11-16T21:00');
  const week = weekOfMornings({ alarms, agenda: { events, feeds: [] }, now, margin: 30 });

  it('names what wakes the person each day, from today', () => {
    expect(week.map(morning => morning.day)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    expect(week.map(morning => morning.waking?.alarm.id ?? null)).toEqual(['weekdays', 'weekdays', 'weekdays', 'weekdays', 'weekdays', 'saturday', null]);
    expect(week[1]!.waking!.at).toBe(local('2026-11-17T07:30'));
  });

  it('says what is skipped, the first event and a clash', () => {
    expect(week[2]!.skipped.map(item => item.id)).toEqual(['skipping']);
    expect(week[1]!.first?.event.id).toBe('Standup');
    expect(week[1]!.events).toBe(2);
    expect(week[1]!.clash?.minutes).toBe(15);
    expect(week[5]!.clash).toBeNull();
    expect(week[6]!.first).toBeNull();
  });

  it('keeps a day’s all-day events apart, for a day with nothing timed', () => {
    expect(week[6]!.allDay.map(item => item.event.id)).toEqual(['Day off']);
    expect(week[6]!.events).toBe(0);
    expect(week[1]!.allDay).toEqual([]);
  });

  it('shows on today what still rings today, else what rang', () => {
    const evening = alarm('evening', { time: '22:30', days: [1] });
    const lunch = event('Lunch', '2026-11-16T12:30', '2026-11-16T13:30');
    const today = weekOfMornings({ alarms: [alarm('weekdays'), evening], agenda: { events: [lunch], feeds: [] }, now: local('2026-11-16T11:00'), margin: 30 })[0]!;
    expect(today.waking?.alarm.id).toBe('evening');
    // The evening's ring is no wake-up: the lunch before it is not its first event.
    expect(today.later).toBe(true);
    expect(today.first).toBeNull();
    const late = weekOfMornings({ alarms: [alarm('weekdays'), evening], agenda: { events: [], feeds: [] }, now: local('2026-11-16T23:00'), margin: 30 })[0]!;
    expect(late.waking?.alarm.id).toBe('weekdays');
  });

  it('opens on the next alarm’s morning, else today', () => {
    expect(chosenMorning(week, alarms, now)).toBe('2026-11-17');
    expect(chosenMorning(week, [], now)).toBe('2026-11-16');
    expect(stillToRing(week[0]!, now)).toBe(false);
    expect(stillToRing(week[1]!, now)).toBe(true);
    expect(morningAlarmAt('2026-11-16', '07:00', now)).toBeNull();
    expect(morningAlarmAt('2026-11-17', '07:00', now)).toBe(local('2026-11-17T07:00'));
  });
});
