/**
 * Claude looking on the web for the same item sold elsewhere: new at other shops ("Moins cher
 * ailleurs", market `new`) or second-hand and refurbished ("Seconde main", market `used`).
 * `POST /api/offers` an OfferRequest -> OfferResponse, or 4xx/5xx { error } in French. Nothing is
 * written; the server keeps an answer a few hours by market, address and language, as promo codes.
 */
import { isLocale, type Locale } from '@unlease/core/i18n';
import { amount, cleanText, currencyCode, parseLinkBrief, webAddress, type LinkBrief } from './brief';

export const OFFER_MARKETS = ['new', 'used'] as const;
export type OfferMarket = (typeof OFFER_MARKETS)[number];

export interface OfferRequest {
  /** `new` needs a price to compare with; `used` does not. */
  readonly link: LinkBrief;
  readonly market: OfferMarket;
  readonly lang: Locale;
  readonly fresh: boolean;
}

export const OFFER_CONDITIONS = ['new', 'refurbished', 'used'] as const;
export type OfferCondition = (typeof OFFER_CONDITIONS)[number];

export interface Offer {
  /** The shop or the resale site, as people write it: "Fnac", "Leboncoin". */
  readonly shop: string;
  /** The offer's own title, when it says more than the item's: "Veste laine bouillie, taille M". */
  readonly title: string;
  readonly price: number;
  readonly currency: string | null;
  /** Delivery when a source says (0: free), in the offer's currency. */
  readonly shipping: number | null;
  readonly condition: OfferCondition;
  /** A few words: "Très bon état", "En stock", "Garantie 12 mois", or ''. */
  readonly details: string;
  readonly url: string | null;
}

/** What the item usually goes for second-hand. */
export interface PriceRange {
  readonly low: number;
  readonly high: number;
  readonly currency: string | null;
}

export interface OfferResponse {
  readonly offers: readonly Offer[];
  /** Second-hand only: the usual price, when the offers found say. */
  readonly range: PriceRange | null;
  /** One sentence worth knowing, or '': "Le prix affiché est déjà le plus bas trouvé." */
  readonly note: string;
  /** When Claude searched (epoch ms). */
  readonly searchedAt: number;
}

export const OFFER_LIMITS = { offers: 8 } as const;

const TEXT = { shop: 80, title: 200, details: 160, note: 300 } as const;

export function parseOfferRequest(body: unknown): OfferRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { link?: unknown; market?: unknown; lang?: unknown; fresh?: unknown };
  const link = parseLinkBrief(raw.link);
  const market = (OFFER_MARKETS as readonly unknown[]).includes(raw.market) ? (raw.market as OfferMarket) : null;
  if (!link || !market || (market === 'new' && link.price === null)) return null;
  return { link, market, lang: isLocale(raw.lang) ? raw.lang : 'fr', fresh: raw.fresh === true };
}

/** One offer as Claude wrote it or the server kept it: priced and named, or left out. */
export function parseOffer(value: unknown): Offer | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const shop = cleanText(raw.shop, TEXT.shop);
  const price = amount(raw.price);
  if (!shop || price === null || price === 0) return null;
  return {
    shop,
    title: cleanText(raw.title, TEXT.title),
    price: Math.round(price * 100) / 100,
    currency: currencyCode(raw.currency),
    shipping: amount(raw.shipping),
    condition: (OFFER_CONDITIONS as readonly unknown[]).includes(raw.condition) ? (raw.condition as OfferCondition) : 'new',
    details: cleanText(raw.details, TEXT.details),
    url: webAddress(raw.url),
  };
}

export function parsePriceRange(value: unknown): PriceRange | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const low = amount(raw.low);
  const high = amount(raw.high);
  if (low === null || high === null || low === 0 || high < low) return null;
  return { low, high, currency: currencyCode(raw.currency) };
}

/** The offers that parse, the cheapest first, each page once, within the limit. */
export function parseOfferLists(offers: unknown, range: unknown, note: unknown): Pick<OfferResponse, 'offers' | 'range' | 'note'> {
  const seen = new Set<string>();
  const kept: Offer[] = [];
  for (const entry of Array.isArray(offers) ? offers : []) {
    const offer = parseOffer(entry);
    const key = offer ? (offer.url ?? `${offer.shop}|${offer.title}|${offer.price}`) : '';
    if (!offer || seen.has(key)) continue;
    seen.add(key);
    kept.push(offer);
  }
  kept.sort((a, b) => a.price + (a.shipping ?? 0) - (b.price + (b.shipping ?? 0)));
  return { offers: kept.slice(0, OFFER_LIMITS.offers), range: parsePriceRange(range), note: cleanText(note, TEXT.note) };
}

export function parseOfferResponse(body: unknown): OfferResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { offers?: unknown; range?: unknown; note?: unknown; searchedAt?: unknown };
  if (!Array.isArray(raw.offers) || typeof raw.searchedAt !== 'number' || !Number.isFinite(raw.searchedAt)) return null;
  return { ...parseOfferLists(raw.offers, raw.range, raw.note), searchedAt: raw.searchedAt };
}
