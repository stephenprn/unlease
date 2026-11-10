import { alarmStaleAt, LATE_RING_MS, stillWorthRinging } from '../alarms';

const MINUTE = 60_000;
const START = Date.UTC(2026, 10, 4, 14, 0);

describe('a reminder rung late', () => {
  it('rings while to come, and late for an hour, never once its event is well under way', () => {
    const tenBefore = { fireAt: START - 10 * MINUTE, startAt: START, allDay: false };
    expect(stillWorthRinging(tenBefore, START - 11 * MINUTE)).toBe(true);
    expect(stillWorthRinging(tenBefore, START - 2 * MINUTE)).toBe(true);
    expect(stillWorthRinging(tenBefore, START + 9 * MINUTE)).toBe(true);
    expect(stillWorthRinging(tenBefore, START + 10 * MINUTE)).toBe(false);
    const dayBefore = { fireAt: START - 1440 * MINUTE, startAt: START, allDay: false };
    expect(alarmStaleAt(dayBefore)).toBe(dayBefore.fireAt + LATE_RING_MS);
    expect(stillWorthRinging(dayBefore, dayBefore.fireAt + 59 * MINUTE)).toBe(true);
    expect(stillWorthRinging(dayBefore, dayBefore.fireAt + 61 * MINUTE)).toBe(false);
  });

  it('keeps an all-day event’s for the hour after its moment, through its day', () => {
    const midnight = Date.UTC(2026, 10, 4);
    const morning = { fireAt: midnight + 9 * 60 * MINUTE, startAt: midnight, allDay: true };
    expect(stillWorthRinging(morning, morning.fireAt + 30 * MINUTE)).toBe(true);
    expect(stillWorthRinging(morning, morning.fireAt + 90 * MINUTE)).toBe(false);
  });
});
