import { setLocale } from '../../i18n';
import { dateForReading, dateOf, dateShown, dateSuggestions, dateWords, monthWeeks, readTypedDate, withTime } from '../dates';
import { dateRun, markupToPlain, parseRich, richLength, serializeRich, type DateRun } from '../richText';

/** Wednesday 28 October 2026, 10:15 on this device. */
const NOW = new Date(2026, 9, 28, 10, 15).getTime();
const day = (date: string, time: string | null = null): DateRun => dateRun(date, time)!;

describe('dates in rich text', () => {
  it('stores a day, or a day and a time, as one character', () => {
    const runs = parseRich('RDV {@date=2026-10-29} puis {@date=2026-11-12T1430}.');
    expect(runs).toEqual([
      { kind: 'text', text: 'RDV ', marks: {} },
      { kind: 'date', date: '2026-10-29', time: null },
      { kind: 'text', text: ' puis ', marks: {} },
      { kind: 'date', date: '2026-11-12', time: '14:30' },
      { kind: 'text', text: '.', marks: {} },
    ]);
    expect(richLength(runs)).toBe(13);
    expect(serializeRich(runs)).toBe('RDV {@date=2026-10-29} puis {@date=2026-11-12T1430}.');
  });

  it('leaves a date that is no real day as the characters written', () => {
    expect(parseRich('{@date=2026-02-30}')).toEqual([{ kind: 'text', text: '{@date=2026-02-30}', marks: {} }]);
    expect(dateRun('2026-13-01')).toBeNull();
    expect(dateRun('2026-10-28', '24:00')).toBeNull();
  });

  it('reads as a mark in plain text, or as words with a label', () => {
    expect(markupToPlain('a {@date=2026-10-29}')).toBe('a ￼');
    expect(markupToPlain('a {@date=2026-10-29}', () => '')).toBe('a 2026-10-29');
    expect(markupToPlain('a {@date=2026-10-29T0930}', () => '', dateWords)).toBe('a 29 oct. 2026 09:30');
  });

  it('keeps keys as a mark of their own', () => {
    const runs = parseRich('{k:Ctrl}+{k:K}');
    expect(runs).toEqual([
      { kind: 'text', text: 'Ctrl', marks: { k: true } },
      { kind: 'text', text: '+', marks: {} },
      { kind: 'text', text: 'K', marks: { k: true } },
    ]);
    expect(serializeRich(runs)).toBe('{k:Ctrl}+{k:K}');
  });
});

describe('dates shown', () => {
  afterEach(() => setLocale('fr'));

  it('reads relative when close, else the weekday and the day, the year when not this one', () => {
    expect(dateShown(day('2026-10-28'), NOW)).toBe('Aujourd’hui');
    expect(dateShown(day('2026-10-29', '14:30'), NOW)).toBe('Demain 14:30');
    expect(dateShown(day('2026-10-27'), NOW)).toBe('Hier');
    expect(dateShown(day('2026-11-12'), NOW)).toBe('jeu. 12 novembre');
    expect(dateShown(day('2025-01-02'), NOW)).toBe('jeu. 2 janvier 2025');
    setLocale('en');
    expect(dateShown(day('2026-10-29'), NOW)).toBe('Tomorrow');
    expect(dateShown(day('2026-11-12'), NOW)).toBe('Thu 12 Nov');
  });

  it('writes words that stay true, and a fixed form for Claude', () => {
    expect(dateWords(day('2026-11-12', '09:05'))).toBe('12 nov. 2026 09:05');
    expect(dateForReading(day('2026-11-12', '09:05'))).toBe('2026-11-12 09:05 (Thursday)');
  });

  it('makes a day or a moment, and changes its time', () => {
    expect(dateOf(NOW)).toEqual(day('2026-10-28'));
    expect(dateOf(NOW, true)).toEqual(day('2026-10-28', '10:15'));
    expect(withTime(day('2026-10-28'), '18:00')).toEqual(day('2026-10-28', '18:00'));
    expect(withTime(day('2026-10-28', '18:00'), null)).toEqual(day('2026-10-28'));
  });
});

describe('dates typed after « @ »', () => {
  it('reads days by name, by number and spelled, with a time', () => {
    expect(readTypedDate('demain', NOW)).toEqual(day('2026-10-29'));
    expect(readTypedDate('Demain 14h', NOW)).toEqual(day('2026-10-29', '14:00'));
    expect(readTypedDate('hier', NOW)).toEqual(day('2026-10-27'));
    expect(readTypedDate('aujourd’hui', NOW)).toEqual(day('2026-10-28'));
    expect(readTypedDate('lundi', NOW)).toEqual(day('2026-11-02'));
    expect(readTypedDate('mercredi', NOW)).toEqual(day('2026-11-04'));
    expect(readTypedDate('lundi 9h30', NOW)).toEqual(day('2026-11-02', '09:30'));
    expect(readTypedDate('12/11', NOW)).toEqual(day('2026-11-12'));
    expect(readTypedDate('12/11/27', NOW)).toEqual(day('2027-11-12'));
    expect(readTypedDate('12/11/2027', NOW)).toEqual(day('2027-11-12'));
    expect(readTypedDate('12.11.2027 14h', NOW)).toEqual(day('2027-11-12', '14:00'));
    expect(readTypedDate('12 nov', NOW)).toEqual(day('2026-11-12'));
    expect(readTypedDate('12 novembre 2027', NOW)).toEqual(day('2027-11-12'));
    expect(readTypedDate('nov 12', NOW)).toEqual(day('2026-11-12'));
    expect(readTypedDate('2026-11-12 14:30', NOW)).toEqual(day('2026-11-12', '14:30'));
    expect(readTypedDate('tomorrow 2pm', NOW)).toEqual(day('2026-10-29', '14:00'));
    expect(readTypedDate('maintenant', NOW)).toEqual(day('2026-10-28', '10:15'));
  });

  it('takes a day long past as next year’s, and refuses what names no day', () => {
    expect(readTypedDate('2 janvier', NOW)).toEqual(day('2027-01-02'));
    expect(readTypedDate('30/02', NOW)).toBeNull();
    expect(readTypedDate('page', NOW)).toBeNull();
    expect(readTypedDate('demain truc', NOW)).toBeNull();
  });

  it('offers today, tomorrow and now; the days a word could be while it is typed', () => {
    expect(dateSuggestions('', NOW)).toEqual([day('2026-10-28'), day('2026-10-29'), day('2026-10-28', '10:15')]);
    expect(dateSuggestions('dem', NOW)).toEqual([day('2026-10-29')]);
    expect(dateSuggestions('demain 9h', NOW)).toEqual([day('2026-10-29', '09:00'), day('2026-10-29')]);
    expect(dateSuggestions('x', NOW)).toEqual([]);
  });

  it('draws a month Monday first', () => {
    const weeks = monthWeeks(2026, 10);
    expect(weeks[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.every(week => week.length === 7)).toBe(true);
  });
});
