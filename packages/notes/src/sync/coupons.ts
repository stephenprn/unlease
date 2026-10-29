/**
 * Claude looking on the web for promo codes for a link with a price: `POST /api/coupons` a
 * CouponRequest -> CouponResponse, or 4xx/5xx { error } in French. Nothing is written: the apps
 * show the answer. The server keeps it a few hours by address and language, so asking again, from
 * any device, costs nothing; `fresh` searches again.
 */
import { isLocale, type Locale } from '@unlease/core/i18n';
import { amount, cleanText, parseLinkBrief, webAddress, type LinkBrief } from './brief';

export interface CouponRequest {
  /** Always with a price. */
  readonly link: LinkBrief;
  /** The language Claude writes in: the interface's. */
  readonly lang: Locale;
  /** Search again, even when an answer of the last hours is kept. */
  readonly fresh: boolean;
}

export const COUPON_KINDS = ['percent', 'amount', 'shipping', 'other'] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];

export interface Coupon {
  /** As a source shows it: "BIENVENUE15". */
  readonly code: string;
  /** What it gives, in a few words: "15 % sur la première commande". */
  readonly benefit: string;
  /** Who and what it is for: "Nouveaux clients, hors soldes", or ''. */
  readonly conditions: string;
  readonly kind: CouponKind;
  /** `percent`: 15 for 15 %; `amount`: off, in the link's currency; null otherwise. */
  readonly value: number | null;
  /** The least the basket must reach, in the link's currency. */
  readonly minimum: number | null;
  /** The last day it works (`2026-11-30`), when a source says. */
  readonly expires: string | null;
  /** Announced by the shop or reported working lately; false when it is only listed somewhere. */
  readonly confirmed: boolean;
  /** Where it was found: the site as people write it, and the page. */
  readonly source: string;
  readonly sourceUrl: string | null;
}

/** Another way to pay less at that shop, with no code: the newsletter's discount, a sale under way, free delivery from an amount. */
export interface CouponTip {
  readonly text: string;
  readonly url: string | null;
}

export interface CouponResponse {
  readonly coupons: readonly Coupon[];
  readonly tips: readonly CouponTip[];
  /** When Claude searched (epoch ms): a kept answer says how old it is. */
  readonly searchedAt: number;
}

export const COUPON_LIMITS = { coupons: 6, tips: 4 } as const;

/** How much of each text travels, either way. */
const TEXT = { code: 40, benefit: 160, conditions: 240, source: 80, tip: 240 } as const;

/** A calendar day that exists: `2026-02-30` is no day. */
export function isoDay(value: unknown): string | null {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? (value as string) : null;
}

export function parseCouponRequest(body: unknown): CouponRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { link?: unknown; lang?: unknown; fresh?: unknown };
  const link = parseLinkBrief(raw.link);
  if (!link || link.price === null) return null;
  return { link, lang: isLocale(raw.lang) ? raw.lang : 'fr', fresh: raw.fresh === true };
}

/** One coupon as written by Claude or kept by the server: anything malformed is left out, never guessed. */
export function parseCoupon(value: unknown): Coupon | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  // A code is copied as it is: one too long to be whole is left out, never cut.
  const code = typeof raw.code === 'string' ? raw.code.trim() : '';
  const benefit = cleanText(raw.benefit, TEXT.benefit);
  if (!code || code.length > TEXT.code || !benefit) return null;
  const kind = (COUPON_KINDS as readonly unknown[]).includes(raw.kind) ? (raw.kind as CouponKind) : 'other';
  const off = amount(raw.value);
  const minimum = amount(raw.minimum);
  // A minimum given but unreadable ("60 €") is unknown: no saving is counted on the price then.
  const unknownMinimum = raw.minimum !== null && raw.minimum !== undefined && minimum === null;
  return {
    code,
    benefit,
    conditions: cleanText(raw.conditions, TEXT.conditions),
    kind,
    value: !unknownMinimum && off !== null && off > 0 && (kind === 'amount' || (kind === 'percent' && off < 100)) ? off : null,
    minimum,
    expires: isoDay(raw.expires),
    confirmed: raw.confirmed === true,
    source: cleanText(raw.source, TEXT.source),
    sourceUrl: webAddress(raw.sourceUrl),
  };
}

export function parseCouponTip(value: unknown): CouponTip | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const tip = cleanText(raw.text, TEXT.tip);
  return tip ? { text: tip, url: webAddress(raw.url) } : null;
}

/** The coupons and tips that parse, each code once, within the limits. */
export function parseCouponLists(coupons: unknown, tips: unknown): Pick<CouponResponse, 'coupons' | 'tips'> {
  const seen = new Set<string>();
  const kept: Coupon[] = [];
  for (const entry of Array.isArray(coupons) ? coupons : []) {
    const coupon = parseCoupon(entry);
    if (!coupon || seen.has(coupon.code.toUpperCase())) continue;
    seen.add(coupon.code.toUpperCase());
    kept.push(coupon);
    if (kept.length === COUPON_LIMITS.coupons) break;
  }
  const hints = (Array.isArray(tips) ? tips : []).map(parseCouponTip).filter((tip): tip is CouponTip => tip !== null).slice(0, COUPON_LIMITS.tips);
  return { coupons: kept, tips: hints };
}

export function parseCouponResponse(body: unknown): CouponResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { coupons?: unknown; tips?: unknown; searchedAt?: unknown };
  if (!Array.isArray(raw.coupons) || typeof raw.searchedAt !== 'number' || !Number.isFinite(raw.searchedAt)) return null;
  return { ...parseCouponLists(raw.coupons, raw.tips), searchedAt: raw.searchedAt };
}
