/**
 * A recipe in the kitchen: how many it serves, its quantities for another number ("Pour N
 * personnes"), and the durations in its steps that start a timer ("En cuisine").
 */
import { t } from '@unlease/core/i18n';
import type { LinkAttribute } from '../models/entities';
import { formatNumber, plural } from '@unlease/core/services/format';
import { foldText } from '@unlease/core/services/search';

/** The facts that say how many a recipe serves, folded: "Portions", "Servings", "Pour". */
const SERVINGS_LABELS = ['portion', 'serving', 'personne', 'part', 'pour', 'rendement', 'yield'];

/** The first count in "6 personnes", "4 à 6", "12 crêpes"; null when none, or an unlikely one. */
export function servingsCount(text: string): number | null {
  const match = /\d+/.exec(text);
  const count = match ? Number(match[0]) : Number.NaN;
  return Number.isInteger(count) && count > 0 && count <= 100 ? count : null;
}

const servingsFact = (attributes: readonly LinkAttribute[]): LinkAttribute | undefined =>
  attributes.find(attribute => SERVINGS_LABELS.some(label => foldText(attribute.label).startsWith(label)));

/** How many a recipe serves, from the facts its reading kept; null when none says. */
export function servingsOf(attributes: readonly LinkAttribute[]): number | null {
  const fact = servingsFact(attributes);
  return fact ? servingsCount(fact.value) : null;
}

/** Words that count people (or one person's share), folded: the stepper says « personnes » for them. */
const PEOPLE_WORDS = new Set(['personne', 'personnes', 'pers', 'convive', 'convives', 'adulte', 'adultes', 'portion', 'portions', 'part', 'parts', 'people', 'person', 'persons', 'guest', 'guests', 'serving', 'servings']);
/** Words after the count that say nothing of what is counted: « 24 cookies environ », « 12 crêpes de 20 cm ». */
const UNIT_STOPS = new Set(['environ', 'about', 'approx', 'approximately', 'de', 'd', 'du', 'des', 'of', 'pour', 'for', 'a', 'to', 'ou', 'or', 'et', 'and']);

/** What a recipe counts when it is not people, as its reading wrote it: « crêpes » in « 15 crêpes »; null for « 4 personnes », « 6 » or « 4 à 6 ». */
export function servingsUnit(attributes: readonly LinkAttribute[]): string | null {
  const fact = servingsFact(attributes);
  const after = fact ? /\d+(?:\s*(?:-|\u2013|à|a|to)\s*\d+)?\s*(.*)$/su.exec(fact.value)?.[1] ?? '' : '';
  const words: string[] = [];
  // Only the words right after the count: « 1 gâteau (8 parts) » counts gâteaux.
  const run = /^[\p{L}’' -]*/u.exec(after)?.[0] ?? '';
  for (const word of run.split(' ')) {
    const folded = foldText(word).replace(/[’']/g, '');
    if (!folded || UNIT_STOPS.has(folded) || words.length === 2) break;
    words.push(word);
  }
  const unit = words.join(' ');
  return unit && unit.length <= 24 && !PEOPLE_WORDS.has(foldText(words[0]!)) ? unit : null;
}

/** A count of `unit` as written for `written` of them: « 1 crêpe » from « 15 crêpes », « 2 gâteaux » from « 1 gâteau ». */
function unitFor(unit: string, count: number, written: number): string {
  if ((count === 1) === (written === 1)) return unit;
  const one = (word: string): string => (/[^s]s$/.test(word) ? word.slice(0, -1) : word);
  const many = (word: string): string => (/[sxz]$/.test(word) ? word : /au$/.test(word) ? `${word}x` : `${word}s`);
  return unit.split(' ').map(count === 1 ? one : many).join(' ');
}

/**
 * The stepper's words: « 6 personnes » (or « 20 crêpes », what the recipe counts) for `factor` times a
 * recipe for `servings`, or « × 1,5 » for a recipe that does not say how many it serves.
 */
export function servingsWords(servings: number | null, factor: number, unit: string | null = null): string {
  if (servings === null) return t('× {factor}', { factor: formatNumber(factor, 2) });
  const count = Math.round(servings * factor);
  return unit ? `${formatNumber(count, 0)}\u00a0${unitFor(unit, count, servings)}` : plural(count, 'personne');
}

/** The factors offered for a recipe that does not say how many it serves. */
export const FACTORS = [0.5, 1, 1.5, 2, 3, 4] as const;
/** As many people as the stepper goes, or twice the recipe's own when that is more. */
const PEOPLE_MAX = 24;

/** One step on the stepper: a person more or less when the recipe says how many it serves, else the next factor; the same factor at either end. */
export function stepFactor(servings: number | null, factor: number, step: 1 | -1): number {
  if (servings !== null) {
    const people = Math.round(servings * factor);
    const next = Math.min(Math.max(PEOPLE_MAX, servings * 2), Math.max(1, people + step));
    // At an end the step goes nowhere (never the wrong way).
    return next === people || Math.sign(next - people) !== step ? factor : next / servings;
  }
  const index = FACTORS.findIndex(value => value >= factor - 1e-9);
  const here = index < 0 ? FACTORS.length - 1 : index;
  return FACTORS[Math.min(FACTORS.length - 1, Math.max(0, here + step))]!;
}

const FRACTIONS: Readonly<Record<string, number>> = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8, '⅕': 1 / 5, '⅙': 1 / 6 };
const FRACTION_CHARS = Object.keys(FRACTIONS).join('');
/** A quantity as recipes write it: "1 1/2", "1½", "3/4", "½", "1,5", "200". */
const NUMBER = `(?:\\d+\\s+\\d+/\\d+|\\d+[${FRACTION_CHARS}]|\\d+/\\d+|[${FRACTION_CHARS}]|\\d+(?:[.,]\\d+)?)`;
/** A quantity standing alone (never inside a word or a reference, as "T45"), and the second end of a range ("2 à 3", "2-3"). */
const QUANTITY = new RegExp(`(?<![\\p{L}\\d.,/])(${NUMBER})(\\s*(?:-|\\u2013|à|to)\\s*(${NUMBER}))?`, 'gu');
/** A share or a temperature is no amount: "70 %", "180 °C". */
const NOT_AMOUNT = /^\s*[%°‰]/u;

function valueOf(written: string): number {
  const text = written.trim();
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const glued = new RegExp(`^(\\d+)([${FRACTION_CHARS}])$`).exec(text);
  if (glued) return Number(glued[1]) + (FRACTIONS[glued[2]!] ?? 0);
  const fraction = /^(\d+)\/(\d+)$/.exec(text);
  if (fraction) return Number(fraction[2]) === 0 ? Number.NaN : Number(fraction[1]) / Number(fraction[2]);
  return FRACTIONS[text] ?? Number(text.replace(',', '.'));
}

const NICE: readonly (readonly [number, string])[] = [
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];

/** A quantity as a cook reads it: whole when it nearly is, a common fraction, else two decimals in the language's way. */
function written(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 0.02) return String(Math.round(rounded));
  const whole = Math.floor(rounded);
  const nice = NICE.find(([part]) => Math.abs(rounded - whole - part) < 0.02);
  if (nice) return whole > 0 ? `${whole}${nice[1]}` : nice[1];
  return formatNumber(rounded, 2);
}

/** Weighed or measured finely: to the gram or the millilitre, in decimals. */
const FINE_UNITS = /^\s*(?:g|gr|grammes?|grams?|mg|ml|millilitres?|milliliters?|cl|centilitres?|dl)(?![\p{L}])/iu;
/** Kilograms, litres and their like: to the twentieth. */
const COARSE_UNITS = /^\s*(?:kg|kilos?|kilogrammes?|l|litres?|liters?|lbs?|pounds?|oz|ounces?)(?![\p{L}])/iu;

/** A scaled quantity as a cook would measure and write it, by what follows it: grams to the gram (a tenth under ten, five from a hundred), litres to the twentieth, anything counted or spooned to the half (the quarter under one). */
function measured(value: number, after: string): string {
  if (FINE_UNITS.test(after)) return formatNumber(value < 10 ? Math.max(0.1, Math.round(value * 10) / 10) : value >= 100 ? Math.round(value / 5) * 5 : Math.round(value), 1);
  if (COARSE_UNITS.test(after)) return written(Math.max(0.05, Math.round(value * 20) / 20));
  const step = value < 1 ? 0.25 : 0.5;
  return written(Math.max(step, Math.round(value / step) * step));
}

/** An ingredient line for `factor` times the recipe: its first amount (both ends of a range) multiplied and rounded as a cook measures; a line without one stays as written. */
export function scaleIngredient(written: string, factor: number): string {
  if (factor === 1 || !Number.isFinite(factor) || factor <= 0) return written;
  // The fraction slash (« 1⁄2 cup ») reads as a plain one.
  const line = written.replace(/(\d)\u2044(\d)/g, '$1/$2');
  for (const match of line.matchAll(QUANTITY)) {
    const [whole, first, range, second] = match;
    const after = line.slice(match.index + whole.length);
    const value = valueOf(first!);
    if (NOT_AMOUNT.test(after) || !Number.isFinite(value)) continue;
    const end = range && second && Number.isFinite(valueOf(second)) ? range.replace(second, measured(valueOf(second) * factor, after)) : (range ?? '');
    return `${line.slice(0, match.index)}${measured(value * factor, after)}${end}${after}`;
  }
  return line;
}

/** A duration in a step, where it is written, and its length. */
export interface StepTimer {
  readonly start: number;
  readonly end: number;
  readonly seconds: number;
}

/** What may follow a whole unit ("1 h 30", "2 h 15 min", "2 min 30"): a number with its own unit, or two digits; never "1 min 3 œufs". */
const AND = (units: string): string => `(?:\\s*(\\d{1,2}\\s*(?:${units})(?![\\p{L}])|\\d{2}(?![\\p{L}\\d])))?`;
const HOURS = 'heures?|hours?|hrs?|h';
const MINUTES = 'minutes?|mins?|mn';
const SECONDS = 'secondes?|seconds?|secs?|s';
/** "25 min", "1 h 30", "1/2 heure", "1 1/2 hours", "20 à 25 minutes", "45 secondes"; a unit glued to a word ("2 sachets") is none. */
const DURATION = new RegExp(
  `(?<![\\p{L}\\d.,/])(${NUMBER})(?:\\s*(?:à|-|\\u2013|to)\\s*${NUMBER})?\\s*(?:(${HOURS})(?![\\p{L}])${AND(MINUTES)}|(${MINUTES})(?![\\p{L}])${AND(SECONDS)}|(${SECONDS})(?![\\p{L}]))`,
  'giu',
);
/** "Servir à 20 h" is a time of day, no duration. */
const AT_HOUR = /(?:^|[\s(])(?:à|vers|dès|at)\s*$/iu;

/** The durations a step names, in order; a range counts its shorter end, so a dish is checked early rather than late. */
export function stepTimers(text: string): StepTimer[] {
  const timers: StepTimer[] = [];
  for (const match of text.matchAll(DURATION)) {
    const amount = valueOf(match[1]!);
    const more = (part: string | undefined): number => (part ? parseInt(part, 10) : 0);
    if (match[2] && AT_HOUR.test(text.slice(0, match.index))) continue;
    const seconds = match[2] ? amount * 3600 + more(match[3]) * 60 : match[4] ? amount * 60 + more(match[5]) : amount;
    if (Number.isFinite(seconds) && seconds >= 5 && seconds <= 24 * 3600) timers.push({ start: match.index, end: match.index + match[0].length, seconds: Math.round(seconds) });
  }
  return timers;
}

/** A timer's time left: « 4:05 », « 1:02:30 ». */
export function formatCountdown(seconds: number): string {
  const left = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(left / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const rest = String(left % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}
