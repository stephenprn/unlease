import { INBOX_ID, type LinkItem } from '../../models/entities';
import { parseCoupon, parseCouponRequest, parseCouponResponse, type Coupon } from '../../sync/coupons';
import { linkFromRecord } from '../../sync/entities';
import type { Fields } from '@unlease/core/sync/record';
import { couponPrice, couponStatus, priceWith } from '../coupons';
import { linkBrief, linkShop, moduleFits } from '../modules';

const link = (fields: Fields = {}): LinkItem =>
  linkFromRecord({ type: 'link', id: 'l1', fields: { noteId: INBOX_ID, url: 'https://komono.com/fr/winston', status: 'ready', title: 'Winston Black', siteName: 'KOMONO', kind: 'product', price: 79, currency: 'EUR', createdAt: 1, deletedAt: null, ...fields }, clocks: {} });

const coupon = (fields: Partial<Coupon> = {}): Coupon => ({
  code: 'BIENVENUE15',
  benefit: '15 % sur la première commande',
  conditions: '',
  kind: 'percent',
  value: 15,
  minimum: null,
  expires: null,
  confirmed: true,
  source: 'Dealabs',
  sourceUrl: null,
  ...fields,
});

describe('which links look for promo codes', () => {
  it('asks for a priced link still wanted, never for one bought or without a price', () => {
    expect(moduleFits('coupons', link())).toBe(true);
    expect(moduleFits('coupons', link({ done: true, doneAt: 5 }))).toBe(false);
    expect(moduleFits('coupons', link({ price: null, currency: null }))).toBe(false);
  });

  it('sends what the reading found, the shop named as on its row', () => {
    const item = link({ attributes: [{ label: 'Couleur', value: 'Noir' }], imageIds: ['img1'] });
    expect(linkBrief(item)).toEqual({ id: 'l1', url: 'https://komono.com/fr/winston', title: 'Winston Black', site: 'Komono', kind: 'product', price: 79, currency: 'EUR', facts: ['Couleur : Noir'], summary: '' });
    expect(linkShop(item)).toBe('Komono');
    expect(linkBrief(link({ price: null })).price).toBeNull();
  });
});

describe('the price once a code applies', () => {
  it('takes a percentage or an amount off', () => {
    expect(priceWith(coupon(), 79)).toBe(67.15);
    expect(priceWith(coupon({ kind: 'amount', value: 10 }), 79)).toBe(69);
  });

  it('counts nothing when the price misses the minimum, or the code is not a plain discount', () => {
    expect(priceWith(coupon({ minimum: 100 }), 79)).toBeNull();
    expect(priceWith(coupon({ kind: 'shipping', value: null }), 79)).toBeNull();
    expect(priceWith(coupon({ kind: 'amount', value: 90 }), 79)).toBeNull();
    expect(couponPrice(coupon(), link())).toMatch(/^Revient à 67,15\s€$/);
    expect(couponPrice(coupon({ minimum: 100 }), link())).toBeNull();
  });

  it('says until when and whether anyone confirmed it', () => {
    const now = new Date(2026, 9, 27).getTime();
    expect(couponStatus(coupon(), now)).toBe('');
    expect(couponStatus(coupon({ confirmed: false }), now)).toBe('Non confirmé');
    expect(couponStatus(coupon({ expires: '2026-11-30', confirmed: false }), now)).toMatch(/^Jusqu’au 30\snov\. · non confirmé$/);
    expect(couponStatus(coupon({ expires: '2027-01-15' }), now)).toMatch(/^Jusqu’au 15\sjanv\.\s2027$/);
  });
});

describe('the promo-code protocol', () => {
  const request = { link: { id: 'l1', url: 'https://komono.com/fr/winston', title: 'Winston', site: 'Komono', kind: 'product', price: 79, currency: 'EUR', facts: ['Couleur : Noir'], summary: '' }, lang: 'en', fresh: true };

  it('reads a request, and refuses one without a price or a web address', () => {
    expect(parseCouponRequest(request)).toEqual(request);
    expect(parseCouponRequest({ ...request, lang: 'de', fresh: 'yes' })).toMatchObject({ lang: 'fr', fresh: false });
    expect(parseCouponRequest({ ...request, link: { ...request.link, price: null } })).toBeNull();
    expect(parseCouponRequest({ ...request, link: { ...request.link, url: 'file:///etc/passwd' } })).toBeNull();
    expect(parseCouponRequest({ ...request, link: { ...request.link, id: '../x' } })).toBeNull();
    // As long an address as a link may hold (a shop's tracking links run long).
    const long = `https://komono.com/fr/winston?${'x'.repeat(2500)}`;
    expect(parseCouponRequest({ ...request, link: { ...request.link, url: long } })?.link.url).toBe(long);
  });

  it('never cuts a code, never counts a saving past an unreadable minimum, and keeps only days that exist', () => {
    expect(parseCoupon(coupon({ code: 'X'.repeat(41) }))).toBeNull();
    expect(parseCoupon({ ...coupon(), minimum: '60 €' })).toMatchObject({ value: null, minimum: null });
    expect(parseCoupon({ ...coupon(), expires: '2026-02-30' })?.expires).toBeNull();
    expect(parseCoupon({ ...coupon(), expires: '2028-02-29' })?.expires).toBe('2028-02-29');
  });

  it('reads an answer, leaving out what does not parse', () => {
    const answer = parseCouponResponse({
      coupons: [coupon({ sourceUrl: 'https://www.dealabs.com/x' }), { code: 'X', benefit: '' }, { ...coupon(), code: 'bienvenue15' }, { ...coupon({ code: 'DIX' }), kind: 'amount', value: -10, expires: 'demain' }],
      tips: [{ text: 'Soldes dès le 8 janvier.', url: 'data:text/html,x' }, 'pas un objet'],
      searchedAt: 1_000,
    });
    expect(answer).toEqual({
      coupons: [coupon({ sourceUrl: 'https://www.dealabs.com/x' }), coupon({ code: 'DIX', kind: 'amount', value: null })],
      tips: [{ text: 'Soldes dès le 8 janvier.', url: null }],
      searchedAt: 1_000,
    });
    expect(parseCouponResponse({ coupons: 'non', searchedAt: 1 })).toBeNull();
    expect(parseCouponResponse({ coupons: [] })).toBeNull();
  });
});
