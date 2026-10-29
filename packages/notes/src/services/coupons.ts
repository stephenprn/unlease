/**
 * Promo codes for a link with a price (`notes/sync/coupons.ts`): the request, and the words both apps
 * show around a code.
 */
import { t } from '@unlease/core/i18n';
import type { LinkItem } from '../models/entities';
import type { Coupon, CouponRequest } from '../sync/coupons';
import { formatDay, formatPrice } from '@unlease/core/services/format';
import { linkBrief } from './modules';

export function couponRequest(link: LinkItem, lang: CouponRequest['lang'], fresh: boolean): CouponRequest | null {
  return link.price === null ? null : { link: linkBrief(link), lang, fresh };
}

/** The price once the code applies, for a plain discount whose minimum the price reaches; null otherwise. */
export function priceWith(coupon: Coupon, price: number): number | null {
  if (coupon.value === null || (coupon.minimum !== null && price < coupon.minimum)) return null;
  const off = coupon.kind === 'percent' ? (price * coupon.value) / 100 : coupon.kind === 'amount' ? coupon.value : null;
  if (off === null || off <= 0 || off >= price) return null;
  return Math.round((price - off) * 100) / 100;
}

/** « Revient à 42,41 € », when the code's saving can be counted on this price. */
export function couponPrice(coupon: Coupon, link: Pick<LinkItem, 'price' | 'currency'>): string | null {
  const price = link.price === null ? null : priceWith(coupon, link.price);
  return price === null ? null : t('Revient à {price}', { price: formatPrice(price, link.currency) });
}

/** Under a code, before where it was found: until when, and whether anyone confirmed it (« Jusqu’au 30 nov. · non confirmé »), or ''. */
export function couponStatus(coupon: Coupon, now: number): string {
  const [year, month, day] = (coupon.expires ?? '').split('-').map(Number);
  const until = year && month && day ? formatDay(new Date(year, month - 1, day).getTime(), now) : null;
  const status = [until ? t('jusqu’au {date}', { date: until }) : null, coupon.confirmed ? null : t('non confirmé')].filter(Boolean).join(' · ');
  return status.charAt(0).toLocaleUpperCase() + status.slice(1);
}
