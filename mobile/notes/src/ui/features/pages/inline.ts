/**
 * What a page's words hold around the caret on the phone, where a native field takes no tap on one
 * of its spans: the date the caret sits by (the bar offers to change it), « :word » being typed (the
 * bar offers its emoji), and the words once a mention, a date or an emoji takes the place of what was
 * typed to ask for it. Offsets are the runs' own (a mention or a date counts one).
 */
import { concatRich, deleteRich, marksAt, richToPlain, sliceRich, type AtomRun, type DateRun, type Run } from '@unlease/core/services/richText';
import { isoDayOf, shiftDay } from '@unlease/core/services/dates';

/** « :word » typed just before the caret: where its colon is, where it ends, the word. */
export interface EmojiQuery {
  readonly start: number;
  readonly end: number;
  readonly word: string;
}

/** What may stand before « [[ » or « : » (as on the web): a space or an opening sign, or nothing (the start). */
export const OPENING = /[\s([{«"'“‘]/;
/** A colon at an opening, then what an emoji's word may hold so far. */
const EMOJI_COLON = /(?:^|[\s([{«"'“‘]):([\p{L}\p{N}_+-]{0,40})$/u;
/** A word worth searching: two letters at least, then letters, digits, `_`, `+` or `-`. */
const EMOJI_WORD = /^\p{L}{2}[\p{L}\p{N}_+-]*$/u;

/** The date at `offset`, or null. */
export function dateAt(runs: readonly Run[], offset: number): DateRun | null {
  if (offset < 0) return null;
  const run = sliceRich(runs, offset, offset + 1)[0];
  return run?.kind === 'date' ? run : null;
}

/** The date the caret touches: the one just before it (the caret on its words lands after it), else the one just after it. */
export function dateBesideCaret(runs: readonly Run[], caret: number): number | null {
  if (dateAt(runs, caret - 1)) return caret - 1;
  if (dateAt(runs, caret)) return caret;
  return null;
}

/** Where the one date a selection holds is, or null when it holds none or several. */
export function dateInRange(runs: readonly Run[], start: number, end: number): number | null {
  let at = 0;
  let found: number | null = null;
  for (const run of runs) {
    if (run.kind === 'date' && at >= start && at < end) {
      if (found !== null) return null;
      found = at;
    }
    at += run.kind === 'text' ? run.text.length : 1;
    if (at >= end) break;
  }
  return found;
}

/** « :word » just before the caret, out of code and keys; the word may still be empty (just the colon). */
export function emojiQueryAt(runs: readonly Run[], caret: number): EmojiQuery | null {
  const found = EMOJI_COLON.exec(richToPlain(sliceRich(runs, 0, caret)));
  if (!found) return null;
  const word = found[1]!;
  const start = caret - word.length - 1;
  const colon = sliceRich(runs, start, start + 1)[0];
  if (colon?.kind !== 'text' || colon.marks.c || colon.marks.k) return null;
  return { start, end: caret, word };
}

/** Whether a query's word is one to search the emoji for. */
export const isEmojiWord = (word: string): boolean => EMOJI_WORD.test(word);

/** Runs with `[start, end)` replaced. */
export function replaceRange(runs: readonly Run[], start: number, end: number, inserted: readonly Run[]): Run[] {
  return concatRich(sliceRich(runs, 0, start), inserted, sliceRich(runs, end));
}

/** Where what opened the mention search ends: « @ », or « [[ » and a « ]] » right after it; `at` when it is gone. */
export function typedEnd(runs: readonly Run[], at: number, typed: '@' | '[['): number {
  const plain = richToPlain(sliceRich(runs, at, at + 4));
  if (!plain.startsWith(typed)) return at;
  return typed === '[[' && plain.slice(2, 4) === ']]' ? at + 4 : at + typed.length;
}

/** A mention or a date in place of `[start, end)`, a space after it unless one follows (a line break is no space); the caret goes after that space. */
export function placeAtom(runs: readonly Run[], start: number, end: number, atom: AtomRun): { readonly runs: Run[]; readonly caret: number } {
  const next = richToPlain(sliceRich(runs, end, end + 1));
  const spaceFollows = next === ' ' || next === '\u00a0';
  return { runs: replaceRange(runs, start, end, spaceFollows ? [atom] : [atom, { kind: 'text', text: ' ', marks: {} }]), caret: start + 2 };
}

/** The date at `at` taken out, and the space after it when it would leave two. */
export function withoutDate(runs: readonly Run[], at: number): Run[] {
  if (!dateAt(runs, at)) return [...runs];
  const before = at > 0 ? richToPlain(sliceRich(runs, at - 1, at)) : '';
  const after = richToPlain(sliceRich(runs, at + 1, at + 2));
  return deleteRich(runs, at, after === ' ' && (before === '' || /\s/.test(before)) ? at + 2 : at + 1);
}

/** « :word » replaced by an emoji (wearing the colon's marks), with the caret after it; null once the words moved on. */
export function withEmoji(runs: readonly Run[], query: EmojiQuery, emoji: string): { readonly runs: Run[]; readonly caret: number } | null {
  if (richToPlain(sliceRich(runs, query.start, query.end)) !== `:${query.word}`) return null;
  const marks = marksAt(runs, query.start + 1);
  return { runs: replaceRange(runs, query.start, query.end, [{ kind: 'text', text: emoji, marks }]), caret: query.start + emoji.length };
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** The time a date takes when « Heure » is turned on: the next hour today (23:00 at the latest), else nine in the morning. */
export function defaultTime(date: string, now: number): string {
  if (date !== isoDayOf(now)) return '09:00';
  return `${pad(Math.min(23, new Date(now).getHours() + 1))}:00`;
}

/** Next Monday's day, a week away on a Monday (the reminders' « Lundi prochain »). */
export function nextMonday(now: number): string {
  return shiftDay(now, ((8 - new Date(now).getDay()) % 7) || 7);
}
