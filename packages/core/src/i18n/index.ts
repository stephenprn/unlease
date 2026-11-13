/**
 * The interface's language, English or French, shared by the phone, the web and the server's words.
 * English is the source: a sentence is its own key (`t('New note')`), French comes from the
 * dictionary, and a sentence it lacks shows in English. The core's part is here (`fr/`); the design
 * system and each app bring theirs, added once by every program that shows them (`addFrench`).
 * Parameters fill `{name}` slots, so a sentence is translated whole, never in pieces. Never call `t`
 * at module scope: a constant keeps its English (marked `tx`) and is translated where it is shown.
 *
 * Where one English needs two French (« Cancel » and « Undo » are both « Annuler »; a word French
 * genders or makes plural), the key carries a context: `Labels [notes]`, read as `tc('notes', 'Labels')`
 * or `t('Labels [notes]')`; English shows the sentence alone. French that reaches `t` from stored data
 * (a seeded title, an older server's message) still reads in both languages.
 */
import { CORE_FRENCH } from './fr';

export type Dictionary = Readonly<Record<string, string>>;

const FR: Record<string, string> = { ...CORE_FRENCH };
/** The French sentences back to their keys, built when first needed: French from stored data, shown in English. */
let keysOfFrench: Map<string, string> | null = null;

/** Adds a package's French (the design system's, an app's) to the dictionary `t` reads. */
export function addFrench(...parts: readonly Dictionary[]): void {
  for (const part of parts) Object.assign(FR, part);
  keysOfFrench = null;
}

export type Locale = 'en' | 'fr';

export const LOCALES: readonly Locale[] = ['en', 'fr'];

/** Each language named in itself, as a language picker shows it. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { en: 'English', fr: 'Français' };

export function isLocale(value: unknown): value is Locale {
  return value === 'fr' || value === 'en';
}

let current: Locale = 'fr';
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  for (const listener of listeners) listener(locale);
}

export function onLocale(listener: (locale: Locale) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type Params = Readonly<Record<string, string | number>>;

function fill(text: string, params: Params): string {
  return text.replace(/\{(\w+)\}/g, (slot, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : slot));
}

const CONTEXT = / \[[a-z]\w*\]$/;

/** A key's English: the sentence, its context left out. */
function bare(key: string): string {
  return key.replace(CONTEXT, '');
}

function frenchKeys(): Map<string, string> {
  if (!keysOfFrench) {
    keysOfFrench = new Map();
    for (const [key, french] of Object.entries(FR)) if (!keysOfFrench.has(french)) keysOfFrench.set(french, key);
  }
  return keysOfFrench;
}

/** A key in French: its dictionary's French; a server's sentence ending in its HTTP status (« Page inaccessible (403) ») translated, the status kept; French already (stored data) as it is; else the English. */
function french(key: string): string {
  const found = FR[key] ?? (CONTEXT.test(key) ? FR[bare(key)] : undefined);
  if (found !== undefined) return found;
  const status = / \((\d{3})\)$/.exec(key);
  const sentence = status ? FR[key.slice(0, status.index)] : undefined;
  return sentence === undefined ? bare(key) : `${sentence} (${status![1]})`;
}

/** A key in English: the sentence; French from stored data back to its English. */
function english(key: string): string {
  if (Object.hasOwn(FR, key)) return bare(key);
  const back = frenchKeys().get(key);
  return back === undefined ? bare(key) : bare(back);
}

/** An English sentence in the interface's language, its `{slots}` filled. */
export function t(key: string, params?: Params): string {
  const text = current === 'fr' ? french(key) : english(key);
  return params ? fill(text, params) : text;
}

/** A sentence whose French depends on where it is shown (« Undo » on a slip): its dictionary key is `English [context]`. */
export function tc(context: string, english: string, params?: Params): string {
  return t(`${english} [${context}]`, params);
}

/** A key's French, whatever the interface's language (a search that understands both: `settingsSearch`). */
export function inFrench(key: string): string {
  return french(key);
}

/** A key's English, whatever the interface's language: the sentence, its context left out. */
export function inEnglish(key: string): string {
  return english(key);
}

/** An English sentence kept in a constant, translated where it is shown (`t(constant)`): marks it for the dictionary's check. */
export const tx = <T extends string>(english: T): T => english;

/** A map of English names (marked `tx`, a context if one needs it) read through `t` on every access, so code that reads it needs no change. */
export function localized<K extends string>(names: Readonly<Record<K, string>>): Readonly<Record<K, string>> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(names) as K[]) Object.defineProperty(out, key, { enumerable: true, get: () => t(names[key]) });
  return out;
}

/**
 * A translated sentence cut around a `{slot}` left unfilled, for the interface to put something of
 * its own there (a link): the sentence « Créée sur {site}. » cut around `site` -> ['Créée sur ', '.'].
 */
export function around(text: string, slot: string): readonly [string, string] {
  const mark = `{${slot}}`;
  const at = text.indexOf(mark);
  return at < 0 ? [text, ''] : [text.slice(0, at), text.slice(at + mark.length)];
}
