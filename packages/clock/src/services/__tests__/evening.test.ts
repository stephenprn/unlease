/** The evening check: said the evening before a morning whose first event comes too soon, kept until that alarm rings. */
import type { CalendarEvent } from '@unlease/calendar/models/events';
import { wallToInstant } from '@unlease/calendar/services/time';
import type { Alarm } from '../../models/alarm';
import { checkOn, eveningChecks, eveningWorthRinging } from '../evening';

const local = (wall: string): number => wallToInstant(wall, '');

const alarm = (extra: Partial<Alarm> = {}): Alarm =>
  ({ id: 'work', time: '07:30', days: [1, 2, 3, 4, 5], date: null, enabled: true, label: 'Travail', sound: 'melody', vibrate: true, weather: true, agenda: true, skipDay: null, offDays: false, eventId: null, eventStart: '', before: 0, createdAt: 1, deletedAt: null, editedAt: 1, ...extra }) as Alarm;

const event = (id: string, start: string, end: string): CalendarEvent =>
  ({ id, title: id, description: '', place: '', start, end, timeZone: '', rrule: '', exdates: [], recurringId: null, originalStart: '', reminders: [], labelIds: [], contactIds: [], files: [], feedId: null, uid: '', url: '', color: null, dayOff: false, trashedAt: null, createdAt: 1, deletedAt: null, editedAt: 1 }) as CalendarEvent;

const PREFS = { eveningCheck: true, eveningAt: '21:00', marginMinutes: 30 };
const input = (now: string) => ({ alarms: [alarm()], agenda: { events: [event('Train', '2026-11-17T07:45', '2026-11-17T08:15')], feeds: [] }, prefs: PREFS, now: local(now) });

describe('the evening check', () => {
  it('finds the event too soon after tomorrow’s alarm, and when to ring instead', () => {
    const check = checkOn(input('2026-11-16T12:00'), '2026-11-16')!;
    expect(check.at).toBe(local('2026-11-16T21:00'));
    expect(check.ringAt).toBe(local('2026-11-17T07:30'));
    expect(check.clash.minutes).toBe(15);
    expect(check.earlier).toMatchObject({ day: '2026-11-17', time: '07:15' });
  });

  it('keeps last evening’s check past midnight, until its alarm rings', () => {
    expect(eveningChecks(input('2026-11-16T22:00')).map(check => check.evening)).toEqual(['2026-11-16']);
    expect(eveningChecks(input('2026-11-17T00:30')).map(check => check.evening)).toEqual(['2026-11-16']);
    expect(eveningChecks(input('2026-11-17T07:31')).map(check => check.evening)).toEqual([]);
  });

  it('is said late within the evening, never in the last hour before the alarm', () => {
    const check = checkOn(input('2026-11-16T12:00'), '2026-11-16')!;
    expect(eveningWorthRinging(check, local('2026-11-16T23:30'))).toBe(true);
    expect(eveningWorthRinging(check, local('2026-11-17T00:30'))).toBe(false);
    expect(eveningWorthRinging(check, local('2026-11-17T06:45'))).toBe(false);
  });

  it('says nothing when it is off, or the morning leaves time', () => {
    expect(checkOn({ ...input('2026-11-16T12:00'), prefs: { ...PREFS, eveningCheck: false } }, '2026-11-16')).toBeNull();
    expect(checkOn({ ...input('2026-11-16T12:00'), prefs: { ...PREFS, marginMinutes: 10 } }, '2026-11-16')).toBeNull();
  });
});
