/**
 * A date typed as text in one field (a birthday: « 27/03/1990 », or « 27/03 » without its year), its
 * separators written for the person as they type (Baymard's input masking, GOV.UK's dates, NN/g,
 * Maskito's zero padding): the digits are the value, the separators only show it. A day or a month
 * whose two digits are typed is followed by its separator at once (« 27 » -> « 27/ »); a digit that
 * cannot start a two-digit part completes it (a day from 4, a month from 2: « 4 » -> « 04/ »); a
 * separator typed after one digit completes that part (« 2/ » -> « 02/ »), and one typed where a
 * separator already stands adds nothing; a pasted date is laid out the same (« 27031990 »,
 * « 27.3.1990 », « 1990-03-27 »). A backspace always takes one digit: over a separator, the digit
 * before it goes too. A change inside the text (the caret not at its end) is left as typed, and the
 * field settles it once left. Both clients' birthday fields use it.
 */

/** Which comes first: the day (« 20/03 », French and most of the world) or the month (« 03/20 »). */
export type DateOrder = 'dayFirst' | 'monthFirst';

/** The separator written between the parts. */
export const DATE_SEPARATOR = '/';
/** What a person may type between parts: a slash, a dot, a dash, a space. */
const SEPARATORS = /[\s/.-]/;
/** A full date: two digits, two digits, four digits and their two separators. */
export const TYPED_DATE_LENGTH = 10;

const pad = (digits: string): string => digits.padStart(2, '0');

/** The largest first digit a part can take and still need a second one (a day 0-3, a month 0-1). */
function firstDigitWaits(part: 'day' | 'month', digit: string): boolean {
  return Number(digit) <= (part === 'day' ? 3 : 1);
}

/**
 * The date laid out from what was typed: digits grouped into day and month (two each) and the year
 * (four at most), separators written between them, nothing past the year; a day or a month just
 * completed is followed by its separator, so the next digits go on without one.
 */
export function layOutDate(typed: string, order: DateOrder = 'dayFirst'): string {
  // A space typed last closes a part, as a slash does: only the start is trimmed.
  const text = typed.trimStart();
  // An ISO day pasted (« 1990-03-20 ») is read as such.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (iso) {
    const year = iso[1]!;
    const month = iso[2]!;
    const day = iso[3]!;
    return order === 'dayFirst' ? `${pad(day)}/${pad(month)}/${year}` : `${pad(month)}/${pad(day)}/${year}`;
  }
  const kinds: readonly ('day' | 'month')[] = order === 'dayFirst' ? ['day', 'month'] : ['month', 'day'];
  const parts: string[] = [];
  let current = '';
  // Whether the part being typed was completed by the last thing typed (its separator then shows).
  let closed = false;
  for (const char of text) {
    const index = parts.length;
    if (/\d/.test(char)) {
      if (index < 2) {
        current += char;
        closed = current.length === 2 || (current.length === 1 && !firstDigitWaits(kinds[index]!, char));
        if (closed) {
          parts.push(pad(current));
          current = '';
        }
      } else if (current.length < 4) {
        current += char;
        closed = false;
      }
    } else if (SEPARATORS.test(char)) {
      // A separator closes a one-digit day or month; elsewhere it adds nothing.
      if (index < 2 && current.length === 1) {
        parts.push(pad(current));
        current = '';
        closed = true;
      }
    }
    // Anything else (a letter) is dropped.
  }
  if (current) parts.push(current);
  const shown = parts.join(DATE_SEPARATOR);
  // The separator after a day or a month just completed, so the next digits go on without one.
  return closed && parts.length < 3 ? `${shown}${DATE_SEPARATOR}` : shown;
}

const digitsOf = (text: string): string => text.replace(/\D/g, '');

/**
 * What the field shows after a keystroke: `typed` laid out when it only added at the end of what
 * was there (`previous`), as typing or pasting does; a backspace at the end that took only a
 * separator takes the digit before it too, so it never sticks; anything else (an edit in the middle)
 * as typed, so the person always keeps the hand.
 */
export function typeDate(previous: string, typed: string, order: DateOrder = 'dayFirst'): string {
  if (typed.length < previous.length) {
    const atEnd = previous.startsWith(typed);
    if (atEnd && digitsOf(typed) === digitsOf(previous)) return typed.replace(/[\s/.-]+$/, '').slice(0, -1);
    return typed;
  }
  if (typed.length === previous.length || !typed.startsWith(previous)) return typed;
  return layOutDate(typed, order).slice(0, TYPED_DATE_LENGTH);
}

/** The date as the field keeps it once left: without a separator waiting at its end (« 20/03/ » -> « 20/03 »). */
export function settleDate(text: string): string {
  return text.trim().replace(/[\s/.-]+$/, '');
}
