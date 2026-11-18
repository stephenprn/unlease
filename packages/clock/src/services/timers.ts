/**
 * Timers and the stopwatch as both clients write them: a countdown (`4:59`, `1:04:59`), a length in
 * words (« 5 min », « 1 h 30 », « 45 s »), the keypad that types a length from the right as a
 * microwave does (5, 0, 0 is 5:00), the lengths started lately, a saved timer's name, and the
 * stopwatch's figures (`01:23.45`).
 */
import { getLocale, t } from '@unlease/core/i18n';
import { TIMER_LIMITS, type Timer } from '../models/timer';

const SECOND = 1000;

const two = (value: number): string => String(value).padStart(2, '0');

/** A countdown, in whole seconds up (it shows 5:00 until a full second has gone): `4:59`, `12:00`, `1:04:59`. */
export function countdownClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / SECOND));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

/** Time gone past a timer's end, in whole seconds down: `−0:12`. */
export const overtimeClock = (ms: number): string => `−${countdownClock(Math.floor(Math.max(0, ms) / SECOND) * SECOND)}`;

/** A length in words: « 5 min », « 1 h 30 », « 45 s », « 2 min 30 s », « 1 h 00 min 05 s ». */
export function lengthWords(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  if (hours === 0 && minutes === 0) return t('{seconds} s', { seconds: rest });
  if (hours === 0) return rest === 0 ? t('{minutes} min', { minutes }) : t('{minutes} min {seconds} s', { minutes, seconds: two(rest) });
  if (rest === 0) return minutes === 0 ? t('{hours} h', { hours }) : t('{hours} h {minutes}', { hours, minutes: two(minutes) });
  return t('{hours} h {minutes} min {seconds} s', { hours, minutes: two(minutes), seconds: two(rest) });
}

/** A length's figures and their units, to set the figures large and the units small: `5 min` is `[['5', 'min']]`, `1 h 30` is `[['1', 'h'], ['30', 'min']]`. */
export function lengthParts(seconds: number): readonly (readonly [string, string])[] {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const parts: (readonly [string, string])[] = [];
  if (hours > 0) parts.push([String(hours), t('h [hours]')]);
  if (minutes > 0) parts.push([hours > 0 ? two(minutes) : String(minutes), t('min [unit]')]);
  if (rest > 0 || parts.length === 0) parts.push([parts.length > 0 ? two(rest) : String(rest), t('s [seconds]')]);
  return parts;
}

/** As a screen reader says a length: « 5 minutes 30 seconds ». */
export function lengthSentence(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(hours === 1 ? t('1 hour') : t('{count} hours', { count: hours }));
  if (minutes > 0) parts.push(minutes === 1 ? t('1 minute') : t('{minutes} minutes', { minutes }));
  if (rest > 0 || parts.length === 0) parts.push(rest === 1 ? t('1 second') : t('{seconds} seconds', { seconds: rest }));
  return parts.join(' ');
}

/** A saved timer's name: its label, else its length (« 5 min »). */
export const timerName = (timer: Pick<Timer, 'label' | 'seconds'>): string => timer.label.trim() || lengthWords(timer.seconds);

/** A run's name: its label, else « Minuteur » and its length. */
export const runName = (run: { readonly label: string; readonly length: number }): string => run.label.trim() || t('{length} timer', { length: lengthWords(run.length / SECOND) });

// ── the keypad ──────────────────────────────────────────────────────────────

/** Six digits at most: hh mm ss. */
export const KEYPAD_DIGITS = 6;

/** A digit (or `00`) typed on the right; nothing past six digits, no leading zero kept. */
export function typeDigits(digits: string, typed: string): string {
  const next = `${digits}${typed}`.replace(/^0+/, '');
  return next.length > KEYPAD_DIGITS ? digits : next;
}

/** The last digit taken back. */
export const eraseDigit = (digits: string): string => digits.slice(0, -1);

/** The keypad's three fields, each two digits: `['00', '05', '00']`. */
export function keypadFields(digits: string): readonly [string, string, string] {
  const padded = digits.padStart(KEYPAD_DIGITS, '0');
  return [padded.slice(0, 2), padded.slice(2, 4), padded.slice(4, 6)];
}

/** The length the digits type, in seconds: 90 typed is 1:30 (a microwave's way), capped at 99:59:59. */
export function keypadSeconds(digits: string): number {
  const [hours, minutes, seconds] = keypadFields(digits).map(Number) as [number, number, number];
  return Math.min(TIMER_LIMITS.seconds, hours * 3600 + minutes * 60 + seconds);
}

/** A length as the keypad's digits (an edited timer opens on its own length). */
export function digitsOf(seconds: number): string {
  const whole = Math.max(0, Math.min(TIMER_LIMITS.seconds, Math.round(seconds)));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  return `${two(hours)}${two(minutes)}${two(whole % 60)}`.replace(/^0+/, '');
}

// ── the lengths started lately ──────────────────────────────────────────────

/** Kept at most, newest first. */
export const RECENT_LENGTHS = 6;

/** The lengths offered first when nothing was started yet: a boiled egg, a tea, a pasta, a nap. */
export const SUGGESTED_LENGTHS: readonly number[] = [60, 3 * 60, 5 * 60, 10 * 60, 15 * 60, 30 * 60];

/** Shorter than this, a length was a try, not a habit: never offered again. */
const LEAST_REMEMBERED = 10;

/** A length started: first, once. */
export function rememberLength(recent: readonly number[], seconds: number): number[] {
  if (seconds < LEAST_REMEMBERED) return [...recent];
  return [seconds, ...recent.filter(length => length !== seconds)].slice(0, RECENT_LENGTHS);
}

/** The quick lengths the new timer's sheet offers: those started lately, filled with the suggestions, shortest first. */
export function quickLengths(recent: readonly number[]): number[] {
  const out = [...recent];
  for (const length of SUGGESTED_LENGTHS) if (out.length < RECENT_LENGTHS && !out.includes(length)) out.push(length);
  return out.slice(0, RECENT_LENGTHS).sort((a, b) => a - b);
}

/** Lengths as stored (JSON), read whole. */
export function readLengths(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => Number.isInteger(item) && item >= LEAST_REMEMBERED && item <= TIMER_LIMITS.seconds).slice(0, RECENT_LENGTHS);
}

// ── the stopwatch's figures ─────────────────────────────────────────────────

/** The stopwatch's big figure and its hundredths: `['01:23', '45']`, `['1:01:23', '45']`. */
export function stopwatchParts(ms: number): readonly [string, string] {
  const whole = Math.max(0, Math.floor(ms / 10));
  const hundredths = whole % 100;
  const seconds = Math.floor(whole / 100);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const main = hours > 0 ? `${hours}:${two(minutes)}:${two(seconds % 60)}` : `${two(minutes)}:${two(seconds % 60)}`;
  return [main, two(hundredths)];
}

/** `01:23.45` (`.` or `,` as the language writes a fraction). */
export function stopwatchClock(ms: number): string {
  const [main, hundredths] = stopwatchParts(ms);
  return `${main}${getLocale() === 'fr' ? ',' : '.'}${hundredths}`;
}

/** As a screen reader says it: « 1 minute 23 seconds ». */
export const stopwatchSentence = (ms: number): string => lengthSentence(Math.floor(ms / SECOND));
