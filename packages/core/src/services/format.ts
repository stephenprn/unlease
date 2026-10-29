/**
 * Prices, dates and counts in the interface's language (French, or English: `core/i18n`).
 * Hand-written, not `Intl`: Hermes, browsers and Node ship different ICUs and would drift.
 */
import { getLocale, t, tx } from '../i18n';

const english = (): boolean => getLocale() === 'en';

/** U+202F, the narrow no-break space French uses between thousands. */
const THIN = ' ';
/** U+00A0, the no-break space before a currency symbol or a colon. */
const NBSP = ' ';

/** English writes these before the amount, as one word: « €49.90 », « US$12 ». */
const ENGLISH_SYMBOLS: Record<string, string> = { EUR: '€', USD: 'US$', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'A$' };

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$ US',
  GBP: '£',
  CHF: 'CHF',
  JPY: '¥',
  CAD: '$ CA',
  AUD: '$ AU',
  SEK: 'kr',
  DKK: 'kr',
  NOK: 'kr',
  PLN: 'zł',
};

function groupThousands(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, english() ? ',' : THIN);
}

/** "49,90 €", "1 299 €", "12 $ US"; in English "€49.90", "US$12". Whole amounts drop their cents. */
export function formatPrice(amount: number, currency: string | null): string {
  const rounded = Math.round(amount * 100) / 100;
  const whole = Number.isInteger(rounded);
  const [integer, cents] = Math.abs(rounded).toFixed(whole ? 0 : 2).split('.');
  const sign = rounded < 0 ? '−' : '';
  const digits = `${groupThousands(integer ?? '0')}${cents ? `${english() ? '.' : ','}${cents}` : ''}`;
  if (english() && currency && ENGLISH_SYMBOLS[currency]) return `${sign}${ENGLISH_SYMBOLS[currency]}${digits}`;
  const number = `${sign}${digits}`;
  const symbol = currency ? CURRENCY_SYMBOLS[currency] ?? currency : '';
  return symbol ? `${number}${NBSP}${symbol}` : number;
}

/** A number as the language writes it: « 1 234,5 », « −0,25 » (English « 1,234.5 »); at most `decimals` places, trailing zeros dropped. */
export function formatNumber(value: number, decimals = 6): string {
  const raw = Math.abs(value).toFixed(decimals);
  const fixed = raw.includes('.') ? raw.replace(/\.?0+$/, '') : raw;
  const [integer, fraction] = fixed.split('.');
  return `${value < 0 && Number(fixed) !== 0 ? '−' : ''}${groupThousands(integer ?? '0')}${fraction ? `${english() ? '.' : ','}${fraction}` : ''}`;
}

/** Null when the prices are in several currencies. */
export function totalPrice(
  items: readonly { readonly price: number | null; readonly currency: string | null }[],
): { amount: number; currency: string | null; count: number } | null {
  let currency: string | null | undefined;
  let amount = 0;
  let count = 0;
  for (const item of items) {
    if (item.price === null) continue;
    if (currency === undefined) currency = item.currency;
    else if (currency !== item.currency) return null;
    amount += item.price;
    count += 1;
  }
  if (count === 0 || currency === undefined) return null;
  return { amount, currency, count };
}

const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = (): readonly string[] => (english() ? MONTHS_EN : MONTHS_FR);

/** The months' full names, January first, in the interface's language (a calendar's head). */
export function monthNames(): readonly string[] {
  return english() ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] : ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
}

/** The weekdays' full names, Sunday first, in the interface's language. */
export function weekdayNames(): readonly string[] {
  return english() ? WEEKDAYS_EN : WEEKDAYS_FR;
}
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Calendar days from `now` to `time`: 0 today, 1 tomorrow, -1 yesterday. */
export function dayDelta(time: number, now: number): number {
  return Math.round((startOfDay(time) - startOfDay(now)) / DAY);
}

export function formatClock(time: number): string {
  const date = new Date(time);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "12 oct.", or "12 oct. 2025" outside the current year (English "12 Oct"). */
export function formatDay(time: number, now: number): string {
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return `${date.getDate()}${NBSP}${months()[date.getMonth()]}${sameYear ? '' : `${NBSP}${date.getFullYear()}`}`;
}

/** A calendar day stored as `2026-10-21`: « 21 oct. 2026 » (as typed when it is no such day). */
export function formatIsoDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = match ? months()[Number(match[2]) - 1] : undefined;
  if (!match || !month) return iso;
  return `${Number(match[3])}${NBSP}${month}${NBSP}${match[1]}`;
}

/** "à l'instant", "il y a 5 min", "hier", "12 oct." (English "just now", "5 min ago", "yesterday"). */
export function formatRelative(time: number, now: number): string {
  const elapsed = now - time;
  if (elapsed < MINUTE) return english() ? 'just now' : 'à l’instant';
  if (elapsed < HOUR) return english() ? `${Math.floor(elapsed / MINUTE)}${NBSP}min ago` : `il y a ${Math.floor(elapsed / MINUTE)}${NBSP}min`;
  const days = -dayDelta(time, now);
  if (days === 0) return english() ? `${Math.floor(elapsed / HOUR)}${NBSP}h ago` : `il y a ${Math.floor(elapsed / HOUR)}${NBSP}h`;
  if (days === 1) return english() ? 'yesterday' : 'hier';
  if (days < 7) return english() ? `${days}${NBSP}days ago` : `il y a ${days}${NBSP}jours`;
  return formatDay(time, now);
}

/** The editor's footer: "Modifiée à 14:32", "Modifiée hier", "Modifiée le 12 oct." (English "Edited at 14:32"). */
export function formatEdited(time: number, now: number): string {
  const days = -dayDelta(time, now);
  if (english()) return days === 0 ? `Edited at ${formatClock(time)}` : days === 1 ? `Edited yesterday at ${formatClock(time)}` : `Edited ${formatDay(time, now)}`;
  if (days === 0) return `Modifiée à ${formatClock(time)}`;
  if (days === 1) return `Modifiée hier à ${formatClock(time)}`;
  return `Modifiée le ${formatDay(time, now)}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** A reminder chip: "Aujourd'hui, 18:00", "Demain, 09:00", "Jeudi, 09:00", "22 oct., 09:00". */
export function formatReminder(time: number, now: number): string {
  const delta = dayDelta(time, now);
  const clock = formatClock(time);
  if (delta === 0) return english() ? `Today, ${clock}` : `Aujourd’hui, ${clock}`;
  if (delta === 1) return english() ? `Tomorrow, ${clock}` : `Demain, ${clock}`;
  if (delta === -1) return english() ? `Yesterday, ${clock}` : `Hier, ${clock}`;
  if (delta > 1 && delta < 7) return `${capitalize(weekdayNames()[new Date(time).getDay()]!)}, ${clock}`;
  return `${formatDay(time, now)}, ${clock}`;
}

/** Off by this much or more, a device's clock is mentioned: its edits can win over later ones. */
export const CLOCK_NOTE_MS = 2 * MINUTE;

/** How far this device's clock is from the server's (`skew`: the device's time minus the server's), or null when close enough. */
export function clockNote(skew: number): string | null {
  const amount = Math.abs(skew);
  if (amount < CLOCK_NOTE_MS) return null;
  const span = amount < 90 * MINUTE ? `${Math.round(amount / MINUTE)}${NBSP}min` : amount < 48 * HOUR ? `${Math.round(amount / HOUR)}${NBSP}h` : plural(Math.round(amount / DAY), 'jour');
  if (english()) return `This device’s clock is ${span} ${skew > 0 ? 'ahead of' : 'behind'} the server’s.`;
  return `L’horloge de cet appareil ${skew > 0 ? 'avance' : 'retarde'} de ${span} sur celle du serveur.`;
}

/** What a field says when its length limit cut a paste: « Texte coupé à 200 000 caractères. » */
export function cutNotice(what: 'Texte' | 'Titre', limit: number): string {
  const count = formatNumber(limit, 0);
  if (english()) return `${what === 'Titre' ? 'Title' : 'Text'} cut at ${count} characters.`;
  return `${what} coupé à ${count} caractères.`;
}

/**
 * A count and its noun, in the interface's language: the nouns are French (`plural(3, 'note')`)
 * and translated through the dictionary. French counts 0 and 1 as one ("0 note"), English 1 alone.
 */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  const one = english() ? Math.abs(count) === 1 : Math.abs(count) <= 1;
  return `${english() ? formatNumber(count, 0) : count}${NBSP}${t(one ? singular : pluralForm)}`;
}

/** « 512 o », « 2,4 Mo », « 1,1 Go » (English « 512 B », « 2.4 MB »). */
export function formatBytes(bytes: number): string {
  const units = [tx('o'), tx('Ko'), tx('Mo'), tx('Go')];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${formatNumber(value, unit === 0 || value >= 100 ? 0 : 1)}${NBSP}${t(units[unit]!)}`;
}
