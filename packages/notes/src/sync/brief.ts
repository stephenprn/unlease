/**
 * A saved link as the modules that ask Claude read it (promo codes, other shops, second-hand): what
 * its reading found, without its pictures. And the parsing their protocols share: whatever comes in
 * is clipped to its limits, and anything malformed is left out, never guessed.
 */
import { LINK_KINDS, type LinkKind } from '../models/entities';
import { isValidId } from '@unlease/core/sync/schema';

export interface LinkBrief {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly site: string;
  readonly kind: LinkKind;
  /** In the currency's main unit, as on the link; null when nothing gave one. */
  readonly price: number | null;
  readonly currency: string | null;
  /** "Label : valeur": the brand, the colour, what it is made of. */
  readonly facts: readonly string[];
  /** What the reading said of it, for the modules that answer about it. */
  readonly summary: string;
}

export const BRIEF_FACTS = 8;

/** As long an address as a link may hold. */
const URL_LIMIT = 4000;
const TEXT = { title: 300, site: 100, fact: 120, summary: 400 } as const;

/** One line of text, its spaces collapsed, at most `max` characters; '' for anything else. */
export const cleanText = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** An amount of money or a count: finite, never negative. */
export const amount = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e9 ? value : null);

/** An http(s) address, or null: a page's link never opens anything else. */
export const webAddress = (value: unknown): string | null =>
  typeof value === 'string' && /^https?:\/\/[^\s/?#]+\.[^\s]+$/i.test(value.trim()) && value.trim().length <= URL_LIMIT ? value.trim() : null;

/** A currency's ISO 4217 code, or null. */
export const currencyCode = (value: unknown): string | null => (typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null);

export function parseLinkBrief(value: unknown): LinkBrief | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const url = webAddress(raw.url);
  if (!isValidId(raw.id) || !url) return null;
  const price = amount(raw.price);
  return {
    id: raw.id,
    url,
    title: cleanText(raw.title, TEXT.title),
    site: cleanText(raw.site, TEXT.site),
    kind: (LINK_KINDS as readonly unknown[]).includes(raw.kind) ? (raw.kind as LinkKind) : 'other',
    price,
    currency: price === null ? null : currencyCode(raw.currency),
    facts: Array.isArray(raw.facts) ? raw.facts.filter((fact): fact is string => typeof fact === 'string').slice(0, BRIEF_FACTS).map(fact => cleanText(fact, TEXT.fact)) : [],
    summary: cleanText(raw.summary, TEXT.summary),
  };
}

/** Just a link's id and address: what the modules that read the page themselves need. */
export interface LinkAddress {
  readonly id: string;
  readonly url: string;
}

export function parseLinkAddress(value: unknown): LinkAddress | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const url = webAddress(raw.url);
  return isValidId(raw.id) && url ? { id: raw.id, url } : null;
}
