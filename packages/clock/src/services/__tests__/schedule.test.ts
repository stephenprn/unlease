/** When an alarm rings: its days, a skipped day, once, and the nights the clocks change. */
import { setLocale } from '@unlease/core/i18n';
import { wallToInstant } from '@unlease/calendar/services/time';
import type { Alarm } from '../../models/alarm';
import { byTime, isOn, nextOf, nextRing, onceDate, ringsOn, skipFields, skippedDay, switchedFields, wakingOn } from '../schedule';
import { daysWords, setWords, untilWords } from '../words';

const PARIS = 'Europe/Paris';
const at = (wall: string, zone = PARIS): number => wallToInstant(wall, zone);
const plain = (text: string): string => text.replace(/\u00a0/g, ' ');

function alarm(extra: Partial<Alarm> = {}): Alarm {
  return {
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
  };
}

describe('the next ring', () => {
  it('rings on its next day, at its time', () => {
    // Monday 16 November 2026, in the evening: Tuesday morning.
    expect(nextRing(alarm(), at('2026-11-16T21:00'), PARIS)).toEqual({ day: '2026-11-17', at: at('2026-11-17T07:30') });
    // Monday morning before it rings: that same morning.
    expect(nextRing(alarm(), at('2026-11-16T06:00'), PARIS)).toEqual({ day: '2026-11-16', at: at('2026-11-16T07:30') });
    // At its very minute it is ringing: the next one is the day after.
    expect(nextRing(alarm(), at('2026-11-16T07:30'), PARIS)?.day).toBe('2026-11-17');
    // Friday after it rang: Monday.
    expect(nextRing(alarm(), at('2026-11-20T08:00'), PARIS)?.day).toBe('2026-11-23');
  });

  it('keeps a skipped day quiet, and only that one', () => {
    const skipping = alarm({ skipDay: '2026-11-17' });
    expect(nextRing(skipping, at('2026-11-16T21:00'), PARIS)?.day).toBe('2026-11-18');
    expect(nextRing(skipping, at('2026-11-16T21:00'), PARIS, { ignoreSkip: true })?.day).toBe('2026-11-17');
    expect(ringsOn(skipping, '2026-11-17')).toBe(false);
    expect(ringsOn(skipping, '2026-11-18')).toBe(true);
    // A skip gone by means nothing.
    expect(nextRing(alarm({ skipDay: '2026-11-10' }), at('2026-11-16T21:00'), PARIS)?.day).toBe('2026-11-17');
    expect(skippedDay(skipping, at('2026-11-16T21:00'), PARIS)).toBe('2026-11-17');
    expect(skippedDay(skipping, at('2026-11-17T08:00'), PARIS)).toBeNull();
  });

  it('finds a weekly alarm whose next ring is skipped a week on', () => {
    const sundays = alarm({ days: [0], time: '10:00', skipDay: '2026-11-22' });
    expect(nextRing(sundays, at('2026-11-21T12:00'), PARIS)?.day).toBe('2026-11-29');
  });

  it('rings a one-time alarm once, on its day, then reads as off', () => {
    const once = alarm({ days: [], date: '2026-11-17', time: '06:15' });
    expect(nextRing(once, at('2026-11-16T21:00'), PARIS)).toEqual({ day: '2026-11-17', at: at('2026-11-17T06:15') });
    expect(isOn(once, at('2026-11-17T06:14'), PARIS)).toBe(true);
    expect(isOn(once, at('2026-11-17T06:15'), PARIS)).toBe(false);
    expect(nextRing(alarm({ days: [], date: null }), at('2026-11-16T21:00'), PARIS)).toBeNull();
  });

  it('never rings an alarm switched off', () => {
    expect(nextRing(alarm({ enabled: false }), at('2026-11-16T21:00'), PARIS)).toBeNull();
  });

  it('sets a one-time alarm for today while its time is ahead, else tomorrow', () => {
    expect(onceDate('07:30', at('2026-11-16T06:00'), PARIS)).toBe('2026-11-16');
    expect(onceDate('07:30', at('2026-11-16T07:30'), PARIS)).toBe('2026-11-17');
    expect(onceDate('00:05', at('2026-11-16T23:59'), PARIS)).toBe('2026-11-17');
  });

  it('rings an hour later when the clocks skip its time, and the first time when they repeat it', () => {
    const night = alarm({ days: [0, 1, 2, 3, 4, 5, 6], time: '02:30' });
    // 29 March 2026: 2:00 becomes 3:00 in Paris; 2:30 does not exist, it rings at 3:30 (1:30 UTC), as java.time reads it.
    expect(nextRing(night, at('2026-03-28T12:00'), PARIS)).toEqual({ day: '2026-03-29', at: Date.UTC(2026, 2, 29, 1, 30) });
    // 25 October 2026: 3:00 becomes 2:00; 2:30 happens twice, it rings the first time (0:30 UTC).
    expect(nextRing(night, at('2026-10-24T12:00'), PARIS)).toEqual({ day: '2026-10-25', at: Date.UTC(2026, 9, 25, 0, 30) });
    // And not again an hour later.
    expect(nextRing(night, Date.UTC(2026, 9, 25, 0, 30), PARIS)?.day).toBe('2026-10-26');
  });

  it('keeps its hour on the phone’s clock after the clocks change', () => {
    const daily = alarm({ days: [0, 1, 2, 3, 4, 5, 6] });
    expect(nextRing(daily, at('2026-10-25T08:00'), PARIS)?.at).toBe(Date.UTC(2026, 9, 26, 6, 30));
    expect(nextRing(daily, at('2026-10-24T08:00'), PARIS)?.at).toBe(Date.UTC(2026, 9, 25, 6, 30));
  });

  it('picks the first alarm to ring, and the one that wakes on a day', () => {
    const early = alarm({ id: 'early', time: '06:00', days: [2] });
    const late = alarm({ id: 'late', time: '08:00', days: [1, 2] });
    expect(nextOf([late, early], at('2026-11-16T21:00'), PARIS)?.alarm.id).toBe('early');
    expect(nextOf([late, early], at('2026-11-15T21:00'), PARIS)?.alarm.id).toBe('late');
    expect(wakingOn([late, early], '2026-11-17', PARIS)?.alarm.id).toBe('early');
    expect(wakingOn([late, alarm({ id: 'off', time: '05:00', enabled: false })], '2026-11-17', PARIS)?.alarm.id).toBe('late');
    expect(nextOf([], at('2026-11-16T21:00'), PARIS)).toBeNull();
  });

  it('orders alarms by their time of day', () => {
    const list = [alarm({ id: 'b', time: '09:00' }), alarm({ id: 'a', time: '06:45' }), alarm({ id: 'c', time: '09:00', createdAt: 0 })];
    expect(list.sort(byTime).map(item => item.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('switching and skipping', () => {
  it('gives a one-time alarm switched on its next day', () => {
    const once = alarm({ days: [], date: '2026-11-10', enabled: false });
    expect(switchedFields(once, true, at('2026-11-16T21:00'), PARIS)).toEqual({ enabled: true, date: '2026-11-17' });
    expect(switchedFields(once, false, at('2026-11-16T21:00'), PARIS)).toEqual({ enabled: false });
  });

  it('forgets a skip gone by when switched on again', () => {
    expect(switchedFields(alarm({ skipDay: '2026-11-02' }), true, at('2026-11-16T21:00'), PARIS)).toEqual({ enabled: true, date: null, skipDay: null });
  });

  it('skips the next ring of a repeating alarm only', () => {
    expect(skipFields(alarm(), at('2026-11-16T21:00'), PARIS)).toEqual({ skipDay: '2026-11-17' });
    expect(skipFields(alarm({ days: [], date: '2026-11-17' }), at('2026-11-16T21:00'), PARIS)).toBeNull();
  });
});

describe('how an alarm reads', () => {
  afterEach(() => setLocale('fr'));

  it('names its days', () => {
    setLocale('fr');
    const now = at('2026-11-16T21:00');
    expect(daysWords(alarm(), now, 1, PARIS)).toBe('En semaine');
    expect(daysWords(alarm({ days: [0, 6] }), now, 1, PARIS)).toBe('Le week-end');
    expect(daysWords(alarm({ days: [0, 1, 2, 3, 4, 5, 6] }), now, 1, PARIS)).toBe('Tous les jours');
    expect(daysWords(alarm({ days: [0, 1, 3, 5] }), now, 1, PARIS)).toBe('lun., mer., ven., dim.');
    expect(daysWords(alarm({ days: [0, 1, 3, 5] }), now, 0, PARIS)).toBe('dim., lun., mer., ven.');
    expect(daysWords(alarm({ days: [], date: '2026-11-17' }), now, 1, PARIS)).toBe('Demain');
    expect(daysWords(alarm({ days: [], date: '2026-11-16' }), now, 1, PARIS)).toBe('Aujourd’hui');
    expect(daysWords(alarm({ days: [], date: '2026-11-10' }), now, 1, PARIS)).toBe('Une fois');
    setLocale('en');
    expect(daysWords(alarm(), now, 1, PARIS)).toBe('Weekdays');
    expect(daysWords(alarm({ days: [0, 1, 3, 5] }), now, 0, PARIS)).toBe('Sun, Mon, Wed, Fri');
  });

  it('says how far the next ring is', () => {
    setLocale('fr');
    const now = at('2026-11-16T22:18');
    expect(plain(untilWords(at('2026-11-17T07:30'), now))).toBe('Dans 9 h 12');
    expect(plain(untilWords(now + 45 * 60_000, now))).toBe('Dans 45 min');
    expect(plain(untilWords(now + 20_000, now))).toBe('Dans moins d’une minute');
    expect(plain(untilWords(now + (2 * 24 + 3) * 3_600_000, now))).toBe('Dans 2 j 3 h');
    setLocale('en');
    expect(plain(setWords(alarm(), now, PARIS)!)).toBe('Alarm set for 9 h 12 from now');
    expect(setWords(alarm({ enabled: false }), now, PARIS)).toBeNull();
  });
});
