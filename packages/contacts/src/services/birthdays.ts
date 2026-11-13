/**
 * Birthdays: stored as vCard writes them (`1990-03-12`, `--03-12` without a year), shown in the
 * interface's language, counted to the next one. A 29 February falls on the 28th in other years.
 */
import { getLocale, t, tc } from '@unlease/core/i18n';
import { dayDelta, monthNames, plural } from '@unlease/core/services/format';
import type { Contact } from '../models/contacts';
import { BIRTHDAY_PATTERN } from '../sync/types';

export interface Birthday {
  readonly year: number | null;
  /** 1 to 12. */
  readonly month: number;
  readonly day: number;
}

const pad = (value: number): string => String(value).padStart(2, '0');

const daysIn = (year: number, month: number): number => new Date(year, month, 0).getDate();

/** A stored birthday's parts; null for none or one that is no real day. */
export function readBirthday(value: string | null): Birthday | null {
  if (!value) return null;
  const match = BIRTHDAY_PATTERN.exec(value);
  if (!match) return null;
  const year = match[1] === '-' ? null : Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysIn(year ?? 2000, month)) return null;
  return { year, month, day };
}

/** The stored form: `1990-03-12`, or `--03-12`. */
export function writeBirthday(birthday: Birthday): string {
  return `${birthday.year === null ? '-' : String(birthday.year).padStart(4, '0')}-${pad(birthday.month)}-${pad(birthday.day)}`;
}

/** « 12 mars 1990 », « 12 mars » (English « March 12, 1990 », « March 12 »). */
export function formatBirthday(birthday: Birthday): string {
  const month = monthNames()[birthday.month - 1] ?? '';
  if (getLocale() === 'en') return birthday.year === null ? `${month} ${birthday.day}` : `${month} ${birthday.day}, ${birthday.year}`;
  const day = birthday.day === 1 ? '1er' : String(birthday.day);
  return birthday.year === null ? `${day} ${month}` : `${day} ${month} ${birthday.year}`;
}

/** The next time it comes, from today on (today counts), at the day's start. */
export function nextBirthday(birthday: Birthday, now: number): Date {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const on = (year: number): Date => new Date(year, birthday.month - 1, Math.min(birthday.day, daysIn(year, birthday.month)));
  const thisYear = on(today.getFullYear());
  return thisYear.getTime() >= today.getTime() ? thisYear : on(today.getFullYear() + 1);
}

/** Days to the next birthday: 0 today, 1 tomorrow. */
export function daysToBirthday(birthday: Birthday, now: number): number {
  return dayDelta(nextBirthday(birthday, now).getTime(), now);
}

/** The age reached at the next birthday; null without a year. */
export function ageAtNext(birthday: Birthday, now: number): number | null {
  return birthday.year === null ? null : nextBirthday(birthday, now).getFullYear() - birthday.year;
}

/** The age today; null without a year. */
export function ageToday(birthday: Birthday, now: number): number | null {
  if (birthday.year === null) return null;
  const at = ageAtNext(birthday, now)!;
  return daysToBirthday(birthday, now) === 0 ? at : at - 1;
}

/** « Aujourd’hui », « Demain », « Dans 12 jours », with the age when it is known (« Demain · 35 ans »). */
export function birthdayWhen(birthday: Birthday, now: number): string {
  const days = daysToBirthday(birthday, now);
  const when = days === 0 ? t('Today') : days === 1 ? t('Tomorrow') : t('In {days}', { days: plural(days, 'day') });
  const age = ageAtNext(birthday, now);
  return age === null || age <= 0 ? when : `${when} · ${plural(age, 'year')}`;
}

export interface UpcomingBirthday<T> {
  readonly contact: T;
  readonly birthday: Birthday;
  readonly days: number;
}

/** The live contacts whose birthday comes within `days` days (today included), the nearest first. */
export function upcomingBirthdays<T extends Pick<Contact, 'birthday' | 'deletedAt' | 'trashedAt'>>(contacts: Iterable<T>, now: number, days = 30): UpcomingBirthday<T>[] {
  const out: UpcomingBirthday<T>[] = [];
  for (const contact of contacts) {
    if (contact.deletedAt !== null || contact.trashedAt !== null) continue;
    const birthday = readBirthday(contact.birthday);
    if (!birthday) continue;
    const until = daysToBirthday(birthday, now);
    if (until <= days) out.push({ contact, birthday, days: until });
  }
  return out.sort((a, b) => a.days - b.days || a.birthday.month - b.birthday.month || a.birthday.day - b.birthday.day);
}

/** A run of the birthdays to come under its title: « Aujourd’hui », « Cette semaine », then « novembre 2026 ». */
export interface BirthdayGroup<T> {
  readonly title: string;
  readonly entries: UpcomingBirthday<T>[];
}

/**
 * The birthdays to come grouped as Google's (both clients' « Anniversaires »): today's, the rest of
 * the week's, then month by month round the year, each month named with the year it falls in.
 * `coming` is `upcomingBirthdays`' list, nearest first.
 */
export function birthdayGroups<T>(coming: readonly UpcomingBirthday<T>[], now: number): BirthdayGroup<T>[] {
  const out: BirthdayGroup<T>[] = [];
  for (const entry of coming) {
    const when = nextBirthday(entry.birthday, now);
    const month = monthNames()[when.getMonth()] ?? '';
    // A heading: « Novembre 2026 », its month capitalised.
    const title = entry.days === 0 ? t('Today') : entry.days < 7 ? t('This week') : `${month.charAt(0).toUpperCase()}${month.slice(1)} ${when.getFullYear()}`;
    const last = out.at(-1);
    if (last && last.title === title) last.entries.push(entry);
    else out.push({ title, entries: [entry] });
  }
  return out;
}

/** Regions that write a date month first (`03/27/1990`). */
const MONTH_FIRST_REGIONS = new Set(['US']);

/**
 * Whether a birthday is typed and shown month first (`03/27/1990`): in English, for a person whose
 * « Indicatif par défaut » (else the device's region) writes dates so, the United States. Every other
 * English, and French, reads the day first. The one rule for both clients' contact forms.
 */
export function birthdayMonthFirst(region: string | null): boolean {
  return getLocale() === 'en' && region !== null && MONTH_FIRST_REGIONS.has(region.toUpperCase());
}

/** A birthday as a form's field shows it: `12/03/1990`, `12/03` without a year (month first when `monthFirst`). */
export function birthdayFieldText(birthday: Birthday | null, monthFirst = false): string {
  if (!birthday) return '';
  const dayMonth = monthFirst ? `${pad(birthday.month)}/${pad(birthday.day)}` : `${pad(birthday.day)}/${pad(birthday.month)}`;
  return birthday.year === null ? dayMonth : `${dayMonth}/${birthday.year}`;
}

/**
 * A birthday as typed in a form: `12/03/1990`, `12/03`, `1990-03-12`, `12.03.1990`, `12 3 1990`
 * (day first, as in French), or `03/12/1990` read month first when `monthFirst`. Null for no day.
 */
export function readTypedBirthday(typed: string, monthFirst = false): Birthday | null {
  const text = typed.trim();
  if (!text) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) return readBirthday(writeBirthday({ year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }));
  const parts = text.split(/[\s/.-]+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !/^\d+$/.test(part))) return null;
  const [a, b, c] = parts.map(Number) as [number, number, number?];
  const day = monthFirst ? b : a;
  const month = monthFirst ? a : b;
  let year: number | null = c ?? null;
  if (year !== null && parts[2]!.length <= 2) year += year > (new Date().getFullYear() % 100) ? 1900 : 2000;
  if (year !== null && (year < 1000 || year > 9999)) return null;
  return readBirthday(writeBirthday({ year, month, day }));
}

/** A birthday to tell of, at a time: the day itself, or days before. */
export interface BirthdayAlert {
  readonly contactId: string;
  /** When to tell, epoch ms (the day's `hour`). */
  readonly at: number;
  /** How many days before the birthday it tells: 0 the day itself. */
  readonly before: number;
  readonly birthday: Birthday;
}

export interface BirthdayAlertOptions {
  /** The hour of the day it tells at (local time). */
  readonly hour: number;
  /** The days before each birthday it tells on (0: the day itself). */
  readonly before: readonly number[];
  /** How far ahead it looks, in days (a phone arms what is ahead and arms again at each start). */
  readonly horizon: number;
  /** The alerts after this moment, epoch ms (by default `now`: none already past); earlier, those gone by unrung may ring late. */
  readonly since?: number;
}

export const BIRTHDAY_ALERT_DEFAULTS: BirthdayAlertOptions = { hour: 9, before: [0], horizon: 45 };

/** The alerts to arm for the live contacts, the soonest first, none already past (none before `since`). */
export function birthdayAlerts<T extends Pick<Contact, 'id' | 'birthday' | 'deletedAt' | 'trashedAt'>>(contacts: Iterable<T>, now: number, options: BirthdayAlertOptions = BIRTHDAY_ALERT_DEFAULTS): BirthdayAlert[] {
  const out: BirthdayAlert[] = [];
  const until = now + options.horizon * 86_400_000;
  const since = options.since ?? now;
  for (const contact of contacts) {
    if (contact.deletedAt !== null || contact.trashedAt !== null) continue;
    const birthday = readBirthday(contact.birthday);
    if (!birthday) continue;
    // This year's and next year's: an alert days before may fall in the year before the birthday.
    const first = nextBirthday(birthday, now);
    for (const day of [first, nextBirthday(birthday, new Date(first.getFullYear(), first.getMonth(), first.getDate() + 1).getTime())]) {
      for (const before of options.before) {
        const at = new Date(day.getFullYear(), day.getMonth(), day.getDate() - before, options.hour, 0, 0, 0).getTime();
        if (at > since && at <= until) out.push({ contactId: contact.id, at, before, birthday });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at || (a.contactId < b.contactId ? -1 : 1));
}

/** What an alert says: « Anniversaire de Léa Martin », then « Aujourd’hui · 36 ans » or « Demain ». */
export function birthdayAlertWords(name: string, alert: BirthdayAlert): { readonly title: string; readonly body: string } {
  return { title: birthdayOf(name), body: birthdayWhen(alert.birthday, alert.at) };
}

/** French writes « d’ » before a vowel (« d’Étienne », « de Léa »). */
export const elides = (name: string): boolean => /^[aeiouyàâäéèêëîïôöùûüœæ]/i.test(name.trim());

/** « Anniversaire de Léa », « Anniversaire d’Étienne ». */
export function birthdayOf(name: string): string {
  return elides(name) ? tc('elided', '{name}’s birthday', { name }) : t('{name}’s birthday', { name });
}
