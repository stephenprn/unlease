/**
 * The same item elsewhere (`notes/sync/offers.ts`): the request, and the words both apps show for an
 * offer ("Moins cher ailleurs", "Seconde main").
 */
import { t } from '@unlease/core/i18n';
import type { LinkItem } from '../models/entities';
import type { Offer, OfferMarket, OfferRequest, PriceRange } from '../sync/offers';
import { formatPrice } from '@unlease/core/services/format';
import { linkBrief } from './modules';

export function offerRequest(link: LinkItem, market: OfferMarket, lang: OfferRequest['lang'], fresh: boolean): OfferRequest | null {
  return market === 'new' && link.price === null ? null : { link: linkBrief(link), market, lang, fresh };
}

/** What it costs delivered, as far as its delivery is known. */
export function offerTotal(offer: Offer): number {
  return offer.price + (offer.shipping ?? 0);
}

/** Against the link's own price: « 20 € de moins », « Même prix », « 5 € de plus »; null when the two cannot be compared. */
export function offerGap(offer: Offer, link: Pick<LinkItem, 'price' | 'currency'>): { readonly text: string; readonly cheaper: boolean } | null {
  if (link.price === null || (offer.currency && link.currency && offer.currency !== link.currency)) return null;
  const gap = Math.round((link.price - offerTotal(offer)) * 100) / 100;
  if (Math.abs(gap) < 0.5) return { text: t('Same price'), cheaper: false };
  const value = formatPrice(Math.abs(gap), link.currency ?? offer.currency);
  return gap > 0 ? { text: t('{amount} less', { amount: value }), cheaper: true } : { text: t('{amount} more', { amount: value }), cheaper: false };
}

/** Under an offer: its state (second-hand), its details, its delivery. */
export function offerDetails(offer: Offer, market: OfferMarket): string {
  const state = market === 'used' ? (offer.condition === 'refurbished' ? t('refurbished') : offer.condition === 'used' ? t('second-hand') : t('new')) : null;
  const delivery = offer.shipping === null ? null : offer.shipping === 0 ? t('free delivery') : t('delivery {price}', { price: formatPrice(offer.shipping, offer.currency) });
  const line = [state, offer.details || null, delivery].filter(Boolean).join(' · ');
  return line.charAt(0).toLocaleUpperCase() + line.slice(1);
}

/** « D’occasion, entre 60 € et 90 € ». */
export function rangeText(range: PriceRange): string {
  return t('Second-hand, between {low} and {high}', { low: formatPrice(range.low, range.currency), high: formatPrice(range.high, range.currency) });
}
