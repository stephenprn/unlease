import { layOutDate, settleDate, typeDate } from '../dateTyping';

/** Types `keys` one at a time from an empty field, as a keyboard would. */
function typeKeys(keys: string, order: 'dayFirst' | 'monthFirst' = 'dayFirst'): string {
  let shown = '';
  for (const key of keys) shown = typeDate(shown, shown + key, order);
  return shown;
}

describe('a date typed with its separators written for the person', () => {
  it('writes the separator once a day or a month has its two digits', () => {
    expect(typeKeys('2')).toBe('2');
    expect(typeKeys('20')).toBe('20/');
    expect(typeKeys('200')).toBe('20/0');
    expect(typeKeys('2003')).toBe('20/03/');
    expect(typeKeys('20031990')).toBe('20/03/1990');
  });

  it('completes a part whose first digit cannot start two (a day from 4, a month from 2)', () => {
    expect(typeKeys('4')).toBe('04/');
    expect(typeKeys('43')).toBe('04/03/');
    expect(typeKeys('31')).toBe('31/');
    expect(typeKeys('011')).toBe('01/1');
    expect(typeKeys('0112')).toBe('01/12/');
    expect(typeKeys('3', 'monthFirst')).toBe('03/');
    expect(typeKeys('12', 'monthFirst')).toBe('12/');
  });

  it('takes a separator typed after one digit as the end of that part', () => {
    expect(typeKeys('2/')).toBe('02/');
    expect(typeKeys('2/3/')).toBe('02/03/');
    expect(typeKeys('1 1 1990')).toBe('01/01/1990');
    expect(typeKeys('1.1.')).toBe('01/01/');
  });

  it('ignores a separator where one already stands, and stops at the year', () => {
    expect(typeKeys('20/')).toBe('20/');
    expect(typeKeys('20//')).toBe('20/');
    expect(typeKeys('2003199012')).toBe('20/03/1990');
    expect(typeKeys('20a03')).toBe('20/03/');
  });

  it('takes one digit at each backspace, the separator before it with it', () => {
    expect(typeDate('20/', '20')).toBe('2');
    expect(typeDate('20/03/', '20/03')).toBe('20/0');
    expect(typeDate('20/0', '20/')).toBe('20/');
    expect(typeDate('20', '2')).toBe('2');
    expect(typeDate('2', '')).toBe('');
    // Typing again after it lays out again.
    expect(typeDate('2', '20')).toBe('20/');
    expect(typeDate('20/', '20/0')).toBe('20/0');
  });

  it('leaves a deletion inside the text as typed', () => {
    expect(typeDate('20/03/1990', '2003/1990')).toBe('2003/1990');
  });

  it('leaves an edit inside the text as typed', () => {
    expect(typeDate('20/03/1990', '20/073/1990')).toBe('20/073/1990');
  });

  it('lays out a pasted date', () => {
    expect(typeDate('', '20031990')).toBe('20/03/1990');
    expect(typeDate('', '20.03.1990')).toBe('20/03/1990');
    expect(typeDate('', '1990-03-20')).toBe('20/03/1990');
    expect(layOutDate('1990-3-5', 'monthFirst')).toBe('03/05/1990');
    expect(typeDate('', ' 5/3 ')).toBe('05/03/');
    expect(typeDate('', '3/7/1990')).toBe('03/07/1990');
    expect(typeDate('', '2703')).toBe('27/03/');
  });

  it('drops the separator left waiting at the end once the field is left', () => {
    expect(settleDate('20/03/')).toBe('20/03');
    expect(settleDate('20/03/1990')).toBe('20/03/1990');
    expect(settleDate(' 04/ ')).toBe('04');
  });
});
