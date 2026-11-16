/** What Clock takes from Agenda: an alarm that follows its event, alarms quiet on holidays and days off. Times on the device's clock. */
import { HOLIDAYS_FEED_ID, type CalendarEvent } from '@unlease/calendar/models/events';
import { wallToInstant } from '@unlease/calendar/services/time';
import type { Alarm } from '../../models/alarm';
import { minutesBefore, offDaysFrom, ringBefore, ringingAlarms } from '../agenda';
import { nextRing } from '../schedule';

const local = (wall: string): number => wallToInstant(wall, '');

const alarm = (extra: Partial<Alarm> = {}): Alarm => ({
  id: 'a',
  time: '07:30',
  days: [1, 2, 3, 4, 5],
  date: null,
  enabled: true,
  label: '',
  sound: 'melody',
  vibrate: true,
  weather: true,
  agenda: true,
  skipDay: null,
  offDays: false,
  eventId: null,
  eventStart: '',
  before: 0,
  createdAt: 1,
  deletedAt: null,
  editedAt: 1,
  ...extra,
});

const event = (id: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, title: id, description: '', place: '', start, end, timeZone: '', rrule: '', exdates: [], recurringId: null, originalStart: '', reminders: [], labelIds: [], contactIds: [], files: [], feedId: null, uid: '', url: '', color: null, dayOff: false, trashedAt: null, createdAt: 1, deletedAt: null, editedAt: 1, ...extra }) as CalendarEvent;

const agenda = (...events: CalendarEvent[]) => ({ events, feeds: [] });
const now = local('2026-11-09T21:00');

describe('an alarm for an event', () => {
  it('rings that long before it, and follows it when it moves', () => {
    const linked = alarm({ days: [], date: '2026-11-17', time: '06:45', eventId: 'train', before: 60 });
    const [at] = ringingAlarms([linked], agenda(event('train', '2026-11-17T07:45', '2026-11-17T09:00')), now);
    expect(at).toMatchObject({ time: '06:45', date: '2026-11-17', days: [] });
    const [moved] = ringingAlarms([linked], agenda(event('train', '2026-11-18T06:10', '2026-11-18T08:00')), now);
    expect(moved).toMatchObject({ time: '05:10', date: '2026-11-18' });
  });

  it('keeps its own ring once the event is gone', () => {
    const linked = alarm({ days: [], date: '2026-11-17', time: '06:45', eventId: 'train', before: 60 });
    expect(ringingAlarms([linked], agenda(), now)[0]).toMatchObject({ time: '06:45', date: '2026-11-17' });
    expect(ringingAlarms([linked], agenda(event('train', '2026-11-18T06:10', '2026-11-18T08:00', { trashedAt: 5 })), now)[0]).toMatchObject({ date: '2026-11-17' });
  });

  it('counts how long before an event a time rings, the evening before if need be', () => {
    const start = local('2026-11-17T07:45');
    expect(minutesBefore(start, '06:45')).toBe(60);
    expect(minutesBefore(local('2026-11-17T06:00'), '23:30')).toBe(390);
    expect(ringBefore(start, 90)).toEqual({ day: '2026-11-17', time: '06:15' });
  });
});

describe('holidays and days off', () => {
  const armistice = event('armistice', '2026-11-11', '2026-11-12', { feedId: HOLIDAYS_FEED_ID });
  const away = event('away', '2026-11-12', '2026-11-14', { dayOff: true });
  const meeting = event('meeting', '2026-11-16T09:00', '2026-11-16T10:00', { dayOff: true });

  it('reads the public holidays and the all-day days off', () => {
    expect([...offDaysFrom(agenda(armistice, away, meeting), '2026-11-09')].sort()).toEqual(['2026-11-11', '2026-11-12', '2026-11-13']);
  });

  it('keeps an alarm that asks for it quiet on them', () => {
    const [quiet] = ringingAlarms([alarm({ offDays: true })], agenda(armistice, away), local('2026-11-10T21:00'));
    expect(nextRing(quiet!, local('2026-11-10T21:00'))?.day).toBe('2026-11-16');
    const [plain] = ringingAlarms([alarm()], agenda(armistice, away), local('2026-11-10T21:00'));
    expect(nextRing(plain!, local('2026-11-10T21:00'))?.day).toBe('2026-11-11');
  });
});
