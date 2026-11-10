import { addDays, addMonths, dayToInstant, instantToWall, isoWeek, monthGrid, readClock, startOfWeek, wallToInstant, weekdayOf, zoneOffset } from '../time';

describe('days and times', () => {
  it('counts days across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(weekdayOf('2026-11-02')).toBe(1);
    expect(startOfWeek('2026-11-04', 1)).toBe('2026-11-02');
    expect(startOfWeek('2026-11-04', 0)).toBe('2026-11-01');
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2027-01-01')).toBe(53);
  });

  it('draws a month as whole weeks', () => {
    const weeks = monthGrid('2026-11-15', 1);
    expect(weeks[0]![0]).toBe('2026-10-26');
    expect(weeks[weeks.length - 1]![6]).toBe('2026-12-06');
  });

  it('reads wall times in a zone, across daylight saving', () => {
    expect(new Date(wallToInstant('2026-11-02T14:30', 'Europe/Paris')).toISOString()).toBe('2026-11-02T13:30:00.000Z');
    expect(new Date(wallToInstant('2026-07-02T14:30', 'Europe/Paris')).toISOString()).toBe('2026-07-02T12:30:00.000Z');
    expect(new Date(wallToInstant('2026-11-02T09:00', 'America/New_York')).toISOString()).toBe('2026-11-02T14:00:00.000Z');
    // 2:30 does not exist on the spring night in Paris: an hour later.
    expect(new Date(wallToInstant('2026-03-29T02:30', 'Europe/Paris')).toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(instantToWall(Date.UTC(2026, 10, 2, 13, 30), 'Europe/Paris')).toBe('2026-11-02T14:30');
    expect(zoneOffset(Date.UTC(2026, 0, 1), 'Asia/Kolkata')).toBe(330);
    expect(dayToInstant('2026-11-02', 'UTC')).toBe(Date.UTC(2026, 10, 2));
  });

  it('reads a time as people type it', () => {
    expect(readClock('20h')).toBe('20:00');
    expect(readClock('9h5')).toBe('09:50');
    expect(readClock('2130')).toBe('21:30');
    expect(readClock('21.30')).toBe('21:30');
    expect(readClock('9 pm')).toBe('21:00');
    expect(readClock('12am')).toBe('00:00');
    expect(readClock('25h')).toBeNull();
    expect(readClock('midi')).toBeNull();
  });
});
