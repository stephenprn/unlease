/**
 * Dates written in a page (`DateRun` in `core/services/richText`): shown relative to today when
 * close (« Aujourd’hui », « Demain 14:30 »), else as the day (« mer. 12 novembre », the year when it
 * is not this one); as words that stay true in a search or a copy; and read from what follows « @ »
 * (« demain », « lundi 9h », « 12/11 », « 12 nov. 2026 », in French or English).
 */
import { getLocale } from '../i18n';
import { dateRun, validDay, type DateRun } from './richText';
import { foldText } from './search';

const english = (): boolean => getLocale() === 'en';
/** U+00A0, between a day and its month. */
const NBSP = '\u00a0';

const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DAYS_FR = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (value: number): string => String(value).padStart(2, '0');

/** The calendar day of `time` on this device, as `2026-10-28`. */
export function isoDayOf(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The time of day of `time`, as `14:30`. */
export function clockOf(time: number): string {
  const date = new Date(time);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Midnight of a stored day, on this device. */
export function dayStart(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

/** Calendar days from `now` to the stored day: 0 today, 1 tomorrow, -1 yesterday. */
export function daysFrom(iso: string, now: number): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((dayStart(iso).getTime() - today.getTime()) / 86_400_000);
}

/** `days` after (or before) the day of `now`. */
export function shiftDay(now: number, days: number): string {
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return isoDayOf(date.getTime());
}

/** Today, tomorrow and yesterday by name; then the day, its weekday first. */
function dayWords(iso: string, now: number): string {
  const delta = daysFrom(iso, now);
  if (delta === 0) return english() ? 'Today' : 'Aujourd’hui';
  if (delta === 1) return english() ? 'Tomorrow' : 'Demain';
  if (delta === -1) return english() ? 'Yesterday' : 'Hier';
  const date = dayStart(iso);
  const year = date.getFullYear() === new Date(now).getFullYear() ? '' : `${NBSP}${date.getFullYear()}`;
  if (english()) return `${DAYS_EN[date.getDay()]} ${date.getDate()}${NBSP}${MONTHS_EN[date.getMonth()]}${year}`;
  // The month spelled out: a chip ending a sentence would otherwise read « déc.. ».
  return `${DAYS_FR[date.getDay()]} ${date.getDate()}${NBSP}${MONTH_NAMES_FR[date.getMonth()]}${year}`;
}

/** What a date shows in a page: « Demain », « Aujourd’hui 14:30 », « mer. 12 novembre », « jeu. 2 janvier 2025 ». */
export function dateShown(run: DateRun, now: number): string {
  return run.time ? `${dayWords(run.date, now)} ${run.time}` : dayWords(run.date, now);
}

/** The date as words that stay true whatever day they are read: « 28 oct. 2026 », « 28 Oct 2026 14:30 ». */
export function dateWords(run: DateRun): string {
  const date = dayStart(run.date);
  const day = `${date.getDate()}${NBSP}${(english() ? MONTHS_EN : MONTHS_FR)[date.getMonth()]}${NBSP}${date.getFullYear()}`;
  return run.time ? `${day} ${run.time}` : day;
}

/** The date for Claude reading a page's text: `2026-10-28 14:30 (Wednesday)`, the same in every language. */
export function dateForReading(run: DateRun): string {
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayStart(run.date).getDay()];
  return `${run.date}${run.time ? ` ${run.time}` : ''} (${weekday})`;
}

/** A date for this day, or this moment (its time to the minute) when `withTime`. */
export function dateOf(time: number, withTime = false): DateRun {
  return { kind: 'date', date: isoDayOf(time), time: withTime ? clockOf(time) : null };
}

// ── typed dates ────────────────────────────────────────────────────────────

const WEEKDAYS: readonly (readonly string[])[] = [
  ['dimanche', 'dim', 'sunday', 'sun'],
  ['lundi', 'lun', 'monday', 'mon'],
  ['mardi', 'mar', 'tuesday', 'tue', 'tues'],
  ['mercredi', 'mer', 'wednesday', 'wed'],
  ['jeudi', 'jeu', 'thursday', 'thu', 'thur', 'thurs'],
  ['vendredi', 'ven', 'friday', 'fri'],
  ['samedi', 'sam', 'saturday', 'sat'],
];

const MONTH_WORDS: readonly (readonly string[])[] = [
  ['janvier', 'janv', 'jan', 'january'],
  ['fevrier', 'fevr', 'fev', 'february', 'feb'],
  ['mars', 'march', 'mar'],
  ['avril', 'avr', 'april', 'apr'],
  ['mai', 'may'],
  ['juin', 'june', 'jun'],
  ['juillet', 'juil', 'july', 'jul'],
  ['aout', 'august', 'aug'],
  ['septembre', 'sept', 'sep', 'september'],
  ['octobre', 'oct', 'october'],
  ['novembre', 'nov', 'november'],
  ['decembre', 'dec', 'december'],
];

/** Words naming a day by its distance from today. */
const RELATIVE: readonly { readonly words: readonly string[]; readonly days: number }[] = [
  { words: ["aujourd'hui", 'aujourdhui', 'today'], days: 0 },
  { words: ['demain', 'tomorrow'], days: 1 },
  { words: ['apres-demain', 'apres demain'], days: 2 },
  { words: ['hier', 'yesterday'], days: -1 },
  { words: ['avant-hier', 'avant hier'], days: -2 },
];

const NOW_WORDS = ['maintenant', 'now'];

function monthIndex(word: string): number {
  const clean = word.replace(/\.$/, '');
  return MONTH_WORDS.findIndex(names => names.includes(clean));
}

/** A time typed after a day: `14:30`, `14h30`, `14h`, `9h`, `2pm`, `2:30 pm`. */
function readClock(value: string): string | null | undefined {
  const text = value.trim();
  if (!text) return null;
  const found = /^(?:a |à |at )?(\d{1,2})(?:[:h](\d{2})?)?\s*(am|pm)?$/.exec(text);
  if (!found || (!found[2] && !found[3] && !/h$/.test(text) && !text.includes(':'))) return undefined;
  let hours = Number(found[1]);
  const minutes = found[2] ? Number(found[2]) : 0;
  if (found[3]) {
    if (hours < 1 || hours > 12) return undefined;
    hours = (hours % 12) + (found[3] === 'pm' ? 12 : 0);
  }
  if (hours > 23 || minutes > 59) return undefined;
  return `${pad(hours)}:${pad(minutes)}`;
}

/** The next such weekday after today (« lundi » on a Monday is next week's). */
function nextWeekday(now: number, weekday: number): string {
  const today = new Date(now).getDay();
  return shiftDay(now, ((weekday - today + 7) % 7) || 7);
}

/** A day typed without its year: this year's, or next year's once this year's has passed by more than a month. */
function withYear(now: number, month: number, day: number): string | null {
  const year = new Date(now).getFullYear();
  const thisYear = validDay(year, month, day);
  if (thisYear && daysFrom(thisYear, now) >= -31) return thisYear;
  return validDay(year + 1, month, day) ?? thisYear;
}

/** The day part of what was typed, and what is left after it (a time, maybe). */
function readDay(text: string, now: number): { readonly date: string; readonly rest: string } | null {
  for (const { words, days } of RELATIVE) {
    for (const word of words) if (text === word || text.startsWith(`${word} `)) return { date: shiftDay(now, days), rest: text.slice(word.length) };
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/.exec(text);
  if (iso) {
    const date = validDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return date ? { date, rest: iso[4]! } : null;
  }
  // 12/11, 12/11/2026, 12.11.26 (day first, as in French; English readers type it the same here).
  const numeric = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}|\d{2})(?!\d))?(.*)$/.exec(text);
  if (numeric) {
    const [day, month] = [Number(numeric[1]), Number(numeric[2])];
    const date = numeric[3] ? validDay(Number(numeric[3]) + (numeric[3].length === 2 ? 2000 : 0), month, day) : withYear(now, month, day);
    return date ? { date, rest: numeric[4]! } : null;
  }
  // 12 nov, 12 novembre 2026, nov 12, november 12 2026; « le 12 nov ».
  const words = text.replace(/^le /, '').replace(/,/g, ' ').split(/\s+/);
  const dayFirst = /^(\d{1,2})(?:er)?$/.exec(words[0] ?? '');
  const monthFirst = monthIndex(words[0] ?? '');
  if (dayFirst && words[1] && monthIndex(words[1]) >= 0) return spelled(Number(dayFirst[1]), monthIndex(words[1]), words.slice(2), now);
  if (monthFirst >= 0 && /^\d{1,2}(?:st|nd|rd|th)?$/.test(words[1] ?? '')) return spelled(parseInt(words[1]!, 10), monthFirst, words.slice(2), now);
  // lundi, lundi prochain, monday, next monday.
  const weekdayWords = words[0] === 'next' ? words.slice(1) : words;
  const weekday = WEEKDAYS.findIndex(names => names.includes((weekdayWords[0] ?? '').replace(/\.$/, '')));
  if (weekday >= 0) {
    const restWords = weekdayWords.slice(1);
    if (restWords[0] === 'prochain') restWords.shift();
    return { date: nextWeekday(now, weekday), rest: restWords.join(' ') };
  }
  return null;
}

function spelled(day: number, month: number, rest: readonly string[], now: number): { readonly date: string; readonly rest: string } | null {
  const year = /^\d{4}$/.test(rest[0] ?? '') ? Number(rest[0]) : null;
  const date = year !== null ? validDay(year, month + 1, day) : withYear(now, month + 1, day);
  return date ? { date, rest: (year !== null ? rest.slice(1) : rest).join(' ') } : null;
}

/** What was typed after « @ », read as a date (and a time), or null when it names none. */
export function readTypedDate(typed: string, now: number): DateRun | null {
  const text = foldText(typed).replace(/’/g, "'").replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (NOW_WORDS.includes(text)) return dateOf(now, true);
  const day = readDay(text, now);
  if (!day) return null;
  const clock = readClock(day.rest);
  if (clock === undefined) return null;
  return dateRun(day.date, clock);
}

/**
 * The dates a menu offers for what was typed after « @ »: the date it names (and the same day
 * without its time), or, while it only starts a word, the days that word could be. Nothing typed:
 * today, tomorrow, and now.
 */
export function dateSuggestions(typed: string, now: number): DateRun[] {
  const text = foldText(typed).replace(/’/g, "'").trim();
  if (!text) return [dateOf(now), dateRun(shiftDay(now, 1))!, dateOf(now, true)];
  const read = readTypedDate(typed, now);
  if (read) return read.time ? [read, dateRun(read.date)!] : [read];
  if (text.length < 2) return [];
  const out: DateRun[] = [];
  for (const { words, days } of RELATIVE) if (words.some(word => word.startsWith(text))) out.push(dateRun(shiftDay(now, days))!);
  if (NOW_WORDS.some(word => word.startsWith(text))) out.push(dateOf(now, true));
  WEEKDAYS.forEach((names, weekday) => {
    if (names[0]!.startsWith(text) || names[2]!.startsWith(text)) out.push(dateRun(nextWeekday(now, weekday))!);
  });
  return out.slice(0, 4);
}

/** The same date with another time, or none. */
export function withTime(run: DateRun, time: string | null): DateRun {
  return dateRun(run.date, time) ?? run;
}

/** A month to draw as a calendar: its weeks, Monday first, each day `2026-10-28` or null outside the month. */
export function monthWeeks(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const length = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [...Array<null>(lead).fill(null)];
  for (let day = 1; day <= length; day += 1) cells.push(`${year}-${pad(month)}-${pad(day)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let at = 0; at < cells.length; at += 7) weeks.push(cells.slice(at, at + 7));
  return weeks;
}
