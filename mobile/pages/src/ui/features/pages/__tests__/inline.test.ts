import { isoDayOf } from '@unlease/core/services/dates';
import { dateRun, parseRich, serializeRich } from '@unlease/core/services/richText';

import { dateBesideCaret, dateInRange, defaultTime, emojiQueryAt, isEmojiWord, nextMonday, placeAtom, typedEnd, withEmoji, withoutDate } from '../inline';

const date = dateRun('2026-11-12')!;

describe('the date by the caret', () => {
  const runs = parseRich('Rendez-vous {@date=2026-11-12} ici');

  it('is the one just before the caret, else the one just after it', () => {
    expect(dateBesideCaret(runs, 13)).toBe(12);
    expect(dateBesideCaret(runs, 12)).toBe(12);
    expect(dateBesideCaret(runs, 11)).toBeNull();
    expect(dateBesideCaret(runs, 14)).toBeNull();
    expect(dateBesideCaret(parseRich('{@page=p1}'), 1)).toBeNull();
  });

  it('is the one a selection holds, alone', () => {
    expect(dateInRange(runs, 10, 14)).toBe(12);
    expect(dateInRange(runs, 0, 5)).toBeNull();
    expect(dateInRange(parseRich('{@date=2026-11-12} et {@date=2026-11-13}'), 0, 6)).toBeNull();
  });
});

describe('« :word »', () => {
  it('is read after a space, an opening sign or the start, out of code and keys', () => {
    expect(emojiQueryAt(parseRich('Bravo :sol'), 10)).toEqual({ start: 6, end: 10, word: 'sol' });
    expect(emojiQueryAt(parseRich(':'), 1)).toEqual({ start: 0, end: 1, word: '' });
    expect(emojiQueryAt(parseRich('(:cœur'), 6)).toEqual({ start: 1, end: 6, word: 'cœur' });
    expect(emojiQueryAt(parseRich('à 12:30'), 7)).toBeNull();
    expect(emojiQueryAt(parseRich('Bravo :sol ici'), 14)).toBeNull();
    expect(emojiQueryAt(parseRich('{c:a :sol}'), 6)).toBeNull();
    expect(emojiQueryAt(parseRich('{@page=p1}:sol'), 5)).toBeNull();
  });

  it('is searched from two letters', () => {
    expect(isEmojiWord('so')).toBe(true);
    expect(isEmojiWord('s')).toBe(false);
    expect(isEmojiWord('12')).toBe(false);
    expect(isEmojiWord('pouce_haut')).toBe(true);
  });

  it('becomes the emoji, wearing the colon’s marks', () => {
    const runs = parseRich('{b:Bravo :sol}');
    const placed = withEmoji(runs, { start: 6, end: 10, word: 'sol' }, '☀️');
    expect(placed && serializeRich(placed.runs)).toBe('{b:Bravo ☀️}');
    expect(placed?.caret).toBe(6 + '☀️'.length);
    expect(withEmoji(parseRich('Bravo :so'), { start: 6, end: 10, word: 'sol' }, '☀️')).toBeNull();
  });
});

describe('a mention or a date in place of what asked for it', () => {
  it('takes « @ » and adds a space unless one follows', () => {
    const runs = parseRich('Voir @');
    const placed = placeAtom(runs, 5, typedEnd(runs, 5, '@'), date);
    expect(serializeRich(placed.runs)).toBe('Voir {@date=2026-11-12} ');
    expect(placed.caret).toBe(7);
    const before = parseRich('Voir @ ici');
    expect(serializeRich(placeAtom(before, 5, typedEnd(before, 5, '@'), date).runs)).toBe('Voir {@date=2026-11-12} ici');
  });

  it('takes « [[ » and a « ]] » right after it', () => {
    const runs = parseRich('Voir [[]] ici');
    expect(typedEnd(runs, 5, '[[')).toBe(9);
    expect(serializeRich(placeAtom(runs, 5, typedEnd(runs, 5, '[['), { kind: 'mention', target: { type: 'page', id: 'p1' } }).runs)).toBe('Voir {@page=p1} ici');
    expect(typedEnd(parseRich('Voir [['), 5, '[[')).toBe(7);
    expect(typedEnd(parseRich('Voir '), 5, '@')).toBe(5);
  });

  it('keeps a line break after it, a space before', () => {
    const runs = parseRich('Voir\nla suite');
    expect(serializeRich(placeAtom(runs, 4, 4, date).runs)).toBe('Voir{@date=2026-11-12} \nla suite');
  });
});

describe('a date taken out', () => {
  it('takes the space it would leave doubled', () => {
    expect(serializeRich(withoutDate(parseRich('Le {@date=2026-11-12} ici'), 3))).toBe('Le ici');
    expect(serializeRich(withoutDate(parseRich('{@date=2026-11-12} ici'), 0))).toBe('ici');
    expect(serializeRich(withoutDate(parseRich('Le{@date=2026-11-12} ici'), 2))).toBe('Le ici');
    expect(serializeRich(withoutDate(parseRich('Le ici'), 1))).toBe('Le ici');
  });
});

describe('a date’s time and its quick days', () => {
  const now = new Date(2026, 9, 28, 14, 23).getTime();

  it('starts at the next hour today, else at nine', () => {
    expect(defaultTime(isoDayOf(now), now)).toBe('15:00');
    expect(defaultTime('2026-10-29', now)).toBe('09:00');
    expect(defaultTime(isoDayOf(now), new Date(2026, 9, 28, 23, 10).getTime())).toBe('23:00');
  });

  it('finds next Monday, a week away on a Monday', () => {
    expect(nextMonday(now)).toBe('2026-11-02');
    expect(nextMonday(new Date(2026, 10, 2, 9).getTime())).toBe('2026-11-09');
  });
});
