/**
 * The interface's language, French or English, shared by the phone, the web and the server's words.
 * French is the source: a sentence is its own key (`t('Nouvelle note')`), English comes from the
 * dictionary, and a sentence it lacks shows in French. The core's part is here (`en/`); the design
 * system and each app bring theirs, added once by every program that shows them (`addEnglish`).
 * Parameters fill `{name}` slots, so a sentence is translated whole, never in pieces. Never call `t`
 * at module scope: a constant keeps its French (marked `tx`) and is translated where it is shown.
 */
import { CORE_ENGLISH } from './en';

export type Dictionary = Readonly<Record<string, string>>;

const EN: Record<string, string> = { ...CORE_ENGLISH };

/** Adds a package's English (the design system's, an app's) to the dictionary `t` reads. */
export function addEnglish(...parts: readonly Dictionary[]): void {
  for (const part of parts) Object.assign(EN, part);
}

export type Locale = 'fr' | 'en';

export const LOCALES: readonly Locale[] = ['fr', 'en'];

/** Each language named in itself, as a language picker shows it. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { fr: 'Français', en: 'English' };

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

/** A French sentence in the interface's language, its `{slots}` filled. */
export function t(french: string, params?: Params): string {
  const text = current === 'en' ? (EN[french] ?? withStatus(french)) : french;
  return params ? fill(text, params) : text;
}

/** A server's sentence ending in its HTTP status (« Page inaccessible (403) »): the sentence translated, the status kept. */
function withStatus(french: string): string {
  const found = / \((\d{3})\)$/.exec(french);
  const english = found ? EN[french.slice(0, found.index)] : undefined;
  return english === undefined ? french : `${english} (${found![1]})`;
}

/**
 * A sentence whose English depends on where it is shown (« Annuler »: Undo on a slip, Cancel in a
 * dialog): its dictionary key is `French [context]`, its French the sentence alone.
 */
export function tc(context: string, french: string, params?: Params): string {
  const english = current === 'en' ? EN[`${french} [${context}]`] : undefined;
  if (english === undefined) return t(french, params);
  return params ? fill(english, params) : english;
}

/** A French sentence kept in a constant, translated where it is shown (`t(constant)`): marks it for the dictionary's check. */
export const tx = <T extends string>(french: T): T => french;

/** A map of French names (marked `tx`) read through `t` on every access, so code that reads it needs no change; a name written `French [context]` reads through `tc`. */
export function localized<K extends string>(names: Readonly<Record<K, string>>): Readonly<Record<K, string>> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(names) as K[]) {
    const contextual = /^(.+) \[(\w+)\]$/.exec(names[key]);
    Object.defineProperty(out, key, { enumerable: true, get: () => (contextual ? tc(contextual[2]!, contextual[1]!) : t(names[key])) });
  }
  return out;
}
