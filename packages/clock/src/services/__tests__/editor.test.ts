/** The alarm editor: when a draft would ring, its days' quick choices, a 12-hour dial, and another app's « set an alarm ». */
import { setLocale } from '@unlease/core/i18n';
import { wallToInstant } from '@unlease/calendar/services/time';
import { clockOf, clockParts, daysChoiceOf, draftRing, handedDraft, handedSkipsForm, ringsInWords, toggleDay } from '../editor';

const PARIS = 'Europe/Paris';
const at = (wall: string): number => wallToInstant(wall, PARIS);
const plain = (text: string): string => text.replace(/ /g, ' ');
const PREFS = { defaultSound: 'birdsong', weatherDefault: false, agendaDefault: true };

describe('when a draft would ring', () => {
  it('rings once on the next day its time comes, or on its next day of the week', () => {
    // Monday 16 November 2026 at 21:00.
    const now = at('2026-11-16T21:00');
    expect(draftRing({ time: '22:15', days: [] }, now, PARIS)).toEqual({ day: '2026-11-16', at: at('2026-11-16T22:15') });
    expect(draftRing({ time: '06:30', days: [] }, now, PARIS)).toEqual({ day: '2026-11-17', at: at('2026-11-17T06:30') });
    // Saturdays only: in five days.
    expect(draftRing({ time: '09:00', days: [6] }, now, PARIS)?.day).toBe('2026-11-21');
  });

  it('says how far away it is', () => {
    setLocale('fr');
    const now = at('2026-11-16T21:00');
    expect(plain(ringsInWords(at('2026-11-17T06:12'), now))).toBe('Sonnera dans 9 h 12');
    expect(plain(ringsInWords(at('2026-11-16T21:00') + 30_000, now))).toBe('Sonnera dans moins d’une minute');
    expect(plain(ringsInWords(at('2026-11-19T00:00'), now))).toBe('Sonnera dans 2 j 3 h');
    setLocale('en');
    expect(plain(ringsInWords(at('2026-11-16T21:45'), now))).toBe('Rings in 45 min');
  });
});

describe('the days', () => {
  it('names the quick choices and turns a day on or off', () => {
    expect(daysChoiceOf([])).toBe('once');
    expect(daysChoiceOf([5, 4, 3, 2, 1])).toBe('weekdays');
    expect(daysChoiceOf([0, 6])).toBe('weekends');
    expect(daysChoiceOf([0, 1, 2, 3, 4, 5, 6])).toBe('everyDay');
    expect(daysChoiceOf([1, 4])).toBeNull();
    expect(toggleDay([1, 4], 2)).toEqual([1, 2, 4]);
    expect(toggleDay([1, 4], 4)).toEqual([1]);
  });
});

describe('a 12-hour dial', () => {
  it('reads and writes the hour either way', () => {
    expect(clockParts('00:05', true)).toEqual({ hour: 12, minute: 5, pm: false });
    expect(clockParts('12:30', true)).toEqual({ hour: 12, minute: 30, pm: true });
    expect(clockParts('19:45', true)).toEqual({ hour: 7, minute: 45, pm: true });
    expect(clockParts('19:45', false)).toEqual({ hour: 19, minute: 45, pm: true });
    expect(clockOf({ hour: 12, minute: 5, pm: false }, true)).toBe('00:05');
    expect(clockOf({ hour: 12, minute: 30, pm: true }, true)).toBe('12:30');
    expect(clockOf({ hour: 7, minute: 45, pm: true }, true)).toBe('19:45');
    expect(clockOf({ hour: 7, minute: 0, pm: false }, false)).toBe('07:00');
  });
});

describe('another app’s « set an alarm »', () => {
  it('fills the draft with what it handed', () => {
    expect(handedDraft({ hour: 6, minutes: 45, days: [5, 1, 9], message: '  Train  pour Lyon ', vibrate: false }, PREFS)).toEqual({
      time: '06:45',
      days: [1, 5],
      label: 'Train pour Lyon',
      sound: 'birdsong',
      vibrate: false,
      weather: false,
      agenda: true,
      offDays: true,
      link: null,
    });
  });

  it('keeps the new alarm’s own for what is missing or wrong', () => {
    expect(handedDraft({ hour: 7 }, PREFS).time).toBe('07:00');
    expect(handedDraft({ hour: 25, minutes: 10 }, PREFS).time).toBe('07:00');
    expect(handedDraft(null, PREFS)).toMatchObject({ time: '07:00', days: [], label: '', vibrate: true });
    expect(handedDraft({ message: 'x'.repeat(200) }, PREFS).label).toHaveLength(80);
  });

  it('sets at once only when asked to and handed the hour', () => {
    expect(handedSkipsForm({ hour: 7, minutes: 0, skipUi: true })).toBe(true);
    expect(handedSkipsForm({ hour: 7, skipUi: false })).toBe(false);
    expect(handedSkipsForm({ skipUi: true })).toBe(false);
    expect(handedSkipsForm({ hour: 24, skipUi: true })).toBe(false);
    expect(handedSkipsForm(null)).toBe(false);
  });
});
