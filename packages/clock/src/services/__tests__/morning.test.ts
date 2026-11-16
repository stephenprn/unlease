/** The day after an alarm, the evening check and what each change of an alarm writes. Events are floating (the device's zone), as Agenda's tests write them. */
import { setLocale } from '@unlease/core/i18n';
import type { CalendarEvent, CalendarFeed } from '@unlease/calendar/models/events';
import { wallToInstant } from '@unlease/calendar/services/time';
import type { Alarm } from '../../models/alarm';
import { CLOCK_PREFS_DEFAULTS, readClockPrefs } from '../../models/prefs';
import { blankDraft, draftChanged, editFields, newAlarmFields, ringEarlierWrites } from '../editing';
import { engineAlarms } from '../engine';
import { checkOn, eveningChecks, eveningWords, eveningWorthRinging } from '../evening';
import { clashWith, dayAhead, earlierTime, firstEvent } from '../morning';

const local = (wall: string): number => wallToInstant(wall, '');
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
  } as CalendarEvent;
}

function alarm(extra: Partial<Alarm> = {}): Alarm {
  return {
    id: 'weekdays',
    time: '07:30',
    days: [1, 2, 3, 4, 5],
    date: null,
    enabled: true,
    label: 'Semaine',
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
  };
}

const feeds: CalendarFeed[] = [];

describe('the day after an alarm', () => {
  const events = [
    event('dentist', '2026-11-17T09:30', '2026-11-17T10:00'),
    event('standup', '2026-11-17T07:45', '2026-11-17T08:00'),
    event('trip', '2026-11-17', '2026-11-19'),
    event('night', '2026-11-16T23:00', '2026-11-17T01:00'),
    event('binned', '2026-11-17T06:00', '2026-11-17T06:30', { trashedAt: 5 }),
  ];

  it('lists the timed events starting that day, all-day ones and the night before apart', () => {
    const ahead = dayAhead({ events, feeds }, '2026-11-17');
    expect(ahead.timed.map(item => item.event.id)).toEqual(['standup', 'dentist']);
    expect(ahead.allDay.map(item => item.event.id).sort()).toEqual(['night', 'trip']);
    expect(firstEvent(ahead)?.event.id).toBe('standup');
    expect(firstEvent(ahead, local('2026-11-17T08:30'))?.event.id).toBe('dentist');
  });

  it('finds an event too close after the alarm, or before it', () => {
    const ahead = dayAhead({ events, feeds }, '2026-11-17');
    expect(clashWith(ahead, local('2026-11-17T07:30'), 30)).toMatchObject({ minutes: 15, occurrence: { event: { id: 'standup' } } });
    expect(clashWith(ahead, local('2026-11-17T07:00'), 30)).toBeNull();
    expect(clashWith(ahead, local('2026-11-17T08:00'), 30)).toMatchObject({ minutes: -15 });
    expect(clashWith(dayAhead({ events: [], feeds }, '2026-11-17'), local('2026-11-17T07:30'), 30)).toBeNull();
  });

  it('leaves out a calendar hidden on every device', () => {
    const hidden: CalendarFeed = { id: 'work', hidden: true, deletedAt: null } as CalendarFeed;
    const ahead = dayAhead({ events: [event('feed', '2026-11-17T07:40', '2026-11-17T08:00', { feedId: 'work' })], feeds: [hidden] }, '2026-11-17');
    expect(ahead.timed).toEqual([]);
  });

  it('proposes a time that leaves the margin, down to five minutes', () => {
    const ahead = dayAhead({ events: [event('early', '2026-11-17T07:47', '2026-11-17T08:00')], feeds }, '2026-11-17');
    const clash = clashWith(ahead, local('2026-11-17T07:30'), 30)!;
    expect(earlierTime(clash, 30)).toEqual({ day: '2026-11-17', time: '07:15', at: local('2026-11-17T07:15') });
  });
});

describe('the evening check', () => {
  afterEach(() => setLocale('fr'));
  const prefs = { eveningCheck: true, eveningAt: '21:00', marginMinutes: 30 };

  it('says at 21:00 that tomorrow’s first event comes too soon after the alarm', () => {
    const events = [event('Réunion', '2026-11-17T07:45', '2026-11-17T08:30')];
    const checks = eveningChecks({ alarms: [alarm()], agenda: { events, feeds }, prefs, now: local('2026-11-16T12:00') });
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ evening: '2026-11-16', day: '2026-11-17', at: local('2026-11-16T21:00'), ringAt: local('2026-11-17T07:30'), earlier: { time: '07:15' } });
    setLocale('fr');
    const words = eveningWords(checks[0]!);
    expect(plain(words.title)).toBe('Demain, « Réunion » commence 15 min après votre réveil');
    expect(words.body).toBe('Votre réveil sonne à 07:30 ; « Réunion » commence à 07:45.');
    expect(words.action).toBe('Sonner à 07:15');
    setLocale('en');
    expect(plain(eveningWords(checks[0]!).title)).toBe('Tomorrow, “Réunion” starts 15 min after your alarm');
  });

  it('says an event before the alarm', () => {
    const events = [event('Train', '2026-11-17T06:40', '2026-11-17T09:00')];
    const check = checkOn({ alarms: [alarm()], agenda: { events, feeds }, prefs, now: local('2026-11-16T12:00') }, '2026-11-16')!;
    expect(check.clash.minutes).toBe(-50);
    expect(check.earlier?.time).toBe('06:10');
    setLocale('en');
    expect(eveningWords(check).title).toBe('Tomorrow, “Train” starts before your alarm');
  });

  it('says nothing with room to get ready, no alarm, or the check off', () => {
    const events = [event('Late', '2026-11-17T09:00', '2026-11-17T10:00')];
    expect(eveningChecks({ alarms: [alarm()], agenda: { events, feeds }, prefs, now: local('2026-11-16T12:00') })).toEqual([]);
    const close = [event('Close', '2026-11-17T07:40', '2026-11-17T08:00')];
    expect(eveningChecks({ alarms: [alarm({ enabled: false })], agenda: { events: close, feeds }, prefs, now: local('2026-11-16T12:00') })).toEqual([]);
    expect(eveningChecks({ alarms: [alarm()], agenda: { events: close, feeds }, prefs: { ...prefs, eveningCheck: false }, now: local('2026-11-16T12:00') })).toEqual([]);
    // Saturday: no alarm rings on Sunday.
    expect(checkOn({ alarms: [alarm()], agenda: { events: [event('Brunch', '2026-11-22T07:40', '2026-11-22T09:00')], feeds }, prefs, now: local('2026-11-21T12:00') }, '2026-11-21')).toBeNull();
  });

  it('keeps tonight’s check found late, said within the evening only', () => {
    const events = [event('Close', '2026-11-17T07:40', '2026-11-17T08:00')];
    const now = local('2026-11-16T22:30');
    const [tonight] = eveningChecks({ alarms: [alarm()], agenda: { events, feeds }, prefs, now });
    expect(tonight?.evening).toBe('2026-11-16');
    expect(eveningWorthRinging(tonight!, now)).toBe(true);
    expect(eveningWorthRinging(tonight!, local('2026-11-17T00:30'))).toBe(false);
    expect(eveningWorthRinging(tonight!, local('2026-11-17T06:45'))).toBe(false);
  });

  it('offers no earlier time already gone by', () => {
    const events = [event('Dawn', '2026-11-17T00:20', '2026-11-17T01:00')];
    const check = checkOn({ alarms: [alarm()], agenda: { events, feeds }, prefs, now: local('2026-11-16T23:58') }, '2026-11-16')!;
    expect(check.earlier).toBeNull();
    expect(eveningWords(check).action).toBeNull();
  });
});

describe('what a change of an alarm writes', () => {
  const now = local('2026-11-16T21:00');

  it('switches a new alarm on, with its day when it rings once', () => {
    const draft = { ...blankDraft(CLOCK_PREFS_DEFAULTS), time: '06:15' };
    expect(newAlarmFields(draft, now)).toMatchObject({ time: '06:15', days: [], date: '2026-11-17', enabled: true, sound: 'melody', weather: true, agenda: true, skipDay: null });
    expect(newAlarmFields({ ...draft, days: [5, 1, 1] }, now)).toMatchObject({ days: [1, 5], date: null });
  });

  it('writes only what changed, and switches an edited alarm on', () => {
    const saved = alarm({ enabled: false, skipDay: '2026-11-17' });
    expect(editFields(saved, { time: '07:30', days: [1, 2, 3, 4, 5], label: 'Semaine ', sound: 'bell', vibrate: true, weather: true, agenda: true, offDays: false, link: null }, now)).toEqual({ sound: 'bell', enabled: true });
    expect(editFields(alarm(), { time: '07:00', days: [1, 2, 3, 4, 5], label: 'Semaine', sound: 'melody', vibrate: true, weather: true, agenda: true, offDays: false, link: null }, now)).toEqual({ time: '07:00', enabled: true });
    expect(editFields(alarm({ skipDay: '2026-11-17' }), { time: '07:00', days: [1], label: 'Semaine', sound: 'melody', vibrate: true, weather: true, agenda: true, offDays: false, link: null }, now)).toEqual({ time: '07:00', days: [1], enabled: true, skipDay: null });
    // A one-time alarm takes its day again.
    expect(editFields(alarm({ days: [], date: '2026-11-10', enabled: true }), { time: '06:00', days: [], label: 'Semaine', sound: 'melody', vibrate: true, weather: true, agenda: true, offDays: false, link: null }, now)).toEqual({ time: '06:00', enabled: true, date: '2026-11-17' });
  });

  it('tells a changed draft', () => {
    const blank = blankDraft(CLOCK_PREFS_DEFAULTS);
    expect(draftChanged(null, blank, blank)).toBe(false);
    expect(draftChanged(null, { ...blank, label: 'x' }, blank)).toBe(true);
    expect(draftChanged(alarm(), { time: '07:30', days: [5, 4, 3, 2, 1], label: 'Semaine', sound: 'melody', vibrate: true, weather: true, agenda: true, offDays: false, link: null }, blank)).toBe(false);
  });

  it('rings earlier one morning: a one-time alarm moves, a repeating one skips and a one-time alarm takes its place', () => {
    expect(ringEarlierWrites(alarm({ days: [], date: '2026-11-17' }), '2026-11-17', '06:45', now, 'new')).toEqual([{ id: 'weekdays', fields: { time: '06:45', date: '2026-11-17', enabled: true } }]);
    const writes = ringEarlierWrites(alarm(), '2026-11-17', '06:45', now, 'new');
    expect(writes[0]).toEqual({ id: 'weekdays', fields: { skipDay: '2026-11-17' } });
    expect(writes[1]).toMatchObject({ id: 'new', created: true, fields: { time: '06:45', days: [], date: '2026-11-17', enabled: true, label: 'Semaine', sound: 'melody', createdAt: now } });
  });

  it('hands the engine the alarms switched on, whole', () => {
    const list = engineAlarms([alarm({ id: 'b' }), alarm({ id: 'a', label: '', sound: 'unknown' }), alarm({ id: 'off', enabled: false }), alarm({ id: 'gone', deletedAt: 3 })]);
    expect(list.map(item => item.id)).toEqual(['a', 'b']);
    expect(list[0]).toMatchObject({ title: 'Alarme', sound: 'melody', days: [1, 2, 3, 4, 5] });
  });

  it('reads prefs whole, what is wrong taking its default', () => {
    expect(readClockPrefs({ snoozeMinutes: 7, eveningAt: '25:00', weatherPlace: { label: 'Lyon', lat: 45.76, lon: 4.84 }, volumeKeys: 'snooze' })).toMatchObject({
      snoozeMinutes: 10,
      eveningAt: '21:00',
      weatherPlace: { label: 'Lyon', lat: 45.76, lon: 4.84 },
      volumeKeys: 'snooze',
    });
    expect(readClockPrefs(null)).toEqual(CLOCK_PREFS_DEFAULTS);
  });
});
