import { addFrench, setLocale } from '@unlease/core/i18n';
import type { Fields } from '@unlease/core/sync/record';
import { FR_PRICE_WATCH } from '../../i18n/fr/priceWatch';
import { INBOX_ID, type LinkItem } from '../../models/entities';
import { LINK_MODULES, MODULE_GROUPS, MODULE_NEEDS } from '../../models/modules';
import { linkFromRecord } from '../../sync/entities';
import { parsePriceCheckRequest, parsePriceCheckResponse, type PriceCheckResponse } from '../../sync/priceWatch';
import { linkModules, moduleCost, withModule } from '../modules';
import { isPrice, isWatched, priceChange, priceChangeText, priceCheckedText, priceCheckSlip, priceUpdate, PRICE_WATCH, watchesPrices } from '../priceWatch';

const DAY = 86_400_000;
/** 9 November 2026, 15:00 local. */
const NOW = new Date(2026, 10, 9, 15, 0).getTime();

const link = (fields: Fields = {}): LinkItem =>
  linkFromRecord({ type: 'link', id: 'l1', fields: { noteId: INBOX_ID, url: 'https://shop.example/item', status: 'ready', title: 'Veste', kind: 'product', price: 89, currency: 'EUR', analyzedAt: NOW - 30 * DAY, createdAt: 1, deletedAt: null, ...fields }, clocks: {} });

const line = (modules: readonly string[] | null, extra: Partial<{ trashedAt: number | null; archived: boolean; deletedAt: number | null }> = {}) => ({
  kind: 'links' as const,
  modules,
  trashedAt: null,
  archived: false,
  deletedAt: null,
  ...extra,
});

afterEach(() => setLocale('fr'));

describe('the price watch module', () => {
  it('is a lowercase key the synced check takes, in « Achats », off by default, needing a server', () => {
    expect(PRICE_WATCH).toMatch(/^[a-z]{1,20}$/);
    expect(LINK_MODULES).toContain(PRICE_WATCH);
    expect(MODULE_GROUPS.find(group => group.modules.includes(PRICE_WATCH))?.title).toBe('Shopping');
    expect(MODULE_NEEDS[PRICE_WATCH]).toBe('server');
    expect(watchesPrices({ modules: null })).toBe(false);
    expect(watchesPrices({ modules: withModule({ modules: null }, PRICE_WATCH, true) })).toBe(true);
    expect(moduleCost(PRICE_WATCH, 'claude-opus-5-5', String)).toBe('Gratuit, ou Claude une fois par semaine si la page cache son prix');
  });

  it('watches the products of a live collection that switched it on, not those bought, nor the rest', () => {
    const on = line([PRICE_WATCH]);
    expect(isWatched(link(), on)).toBe(true);
    // A product Claude read without a price: the watch may find one.
    expect(isWatched(link({ price: null, currency: null }), on)).toBe(true);
    expect(isWatched(link({ done: true, doneAt: NOW }), on)).toBe(false);
    expect(isWatched(link({ kind: 'film', price: null }), on)).toBe(false);
    expect(isWatched(link({ deletedAt: NOW }), on)).toBe(false);
    expect(isWatched(link(), line(['coupons']))).toBe(false);
    expect(isWatched(link(), line([PRICE_WATCH], { archived: true }))).toBe(false);
    expect(isWatched(link(), line([PRICE_WATCH], { trashedAt: NOW }))).toBe(false);
    // Its place is under the price, not in the bar of buttons, but it is among the link's modules.
    expect(linkModules(link(), { modules: [PRICE_WATCH] }, { server: true, reading: false, seerr: false, pages: false, agenda: false })).toEqual([PRICE_WATCH]);
    expect(linkModules(link(), { modules: [PRICE_WATCH] }, { server: false, reading: false, seerr: false, pages: false, agenda: false })).toEqual([]);
  });
});

describe('a reading of the price', () => {
  const watched = (fields: Fields = {}) => link({ priceCheckedAt: NOW - DAY, ...fields });

  it('stamps only the check when the price is the same, to the cent', () => {
    expect(priceUpdate(watched(), { amount: 89.001, currency: 'EUR' }, NOW)).toEqual({ outcome: 'same', fields: { priceCheckedAt: NOW } });
    // A page that names no currency keeps the link's.
    expect(priceUpdate(watched(), { amount: 89, currency: null }, NOW)).toEqual({ outcome: 'same', fields: { priceCheckedAt: NOW } });
  });

  it('keeps the price it replaces, and the last different one when it goes back up', () => {
    const drop = priceUpdate(watched(), { amount: 79, currency: 'EUR' }, NOW);
    expect(drop).toEqual({ outcome: 'changed', fields: { price: 79, currency: 'EUR', priceBefore: 89, priceChangedAt: NOW, priceCheckedAt: NOW } });
    const after = watched({ price: 79, priceBefore: 89, priceChangedAt: NOW, priceCheckedAt: NOW });
    const back = priceUpdate(after, { amount: 89, currency: 'EUR' }, NOW + DAY);
    expect(back.fields).toMatchObject({ price: 89, priceBefore: 79, priceChangedAt: NOW + DAY });
  });

  it('starts afresh from a first price, another currency, or the first reading since Claude read the page', () => {
    expect(priceUpdate(watched({ price: null, currency: null }), { amount: 59.9, currency: 'EUR' }, NOW)).toEqual({ outcome: 'found', fields: { price: 59.9, currency: 'EUR', priceCheckedAt: NOW } });
    expect(priceUpdate(watched({ priceBefore: 99, priceChangedAt: NOW - 3 * DAY }), { amount: 95, currency: 'USD' }, NOW)).toEqual({
      outcome: 'found',
      fields: { price: 95, currency: 'USD', priceBefore: null, priceChangedAt: null, priceCheckedAt: NOW },
    });
    // Never read by the watch: Claude may have read another size's price.
    expect(priceUpdate(link(), { amount: 79, currency: 'EUR' }, NOW).outcome).toBe('found');
    // Read again by Claude since the watch's last reading.
    expect(priceUpdate(watched({ analyzedAt: NOW - 3_600_000 }), { amount: 79, currency: 'EUR' }, NOW).outcome).toBe('found');
  });

  it('takes no zero, no negative and no absurd amount as a price', () => {
    expect([isPrice(0), isPrice(-1), isPrice(1e12), isPrice(Number.NaN), isPrice(null), isPrice(12.5)]).toEqual([false, false, false, false, false, true]);
  });
});

describe('what the link page says', () => {
  it('says the price before and since when, a drop as good news', () => {
    expect(priceChange(link())).toBeNull();
    const dropped = link({ price: 79, priceBefore: 89, priceChangedAt: new Date(2026, 10, 3, 9).getTime() });
    expect(priceChange(dropped)).toMatchObject({ before: 89, down: true });
    expect(priceChangeText(dropped, NOW)).toEqual({ text: 'Avant 89 € · en baisse depuis le 3 nov.', down: true });
    expect(priceChangeText(link({ price: 99, priceBefore: 89, priceChangedAt: NOW - DAY }), NOW)).toEqual({ text: 'Avant 89 € · en hausse depuis hier', down: false });
    expect(priceChangeText(link({ price: 79, priceBefore: 89, priceChangedAt: NOW - 3_600_000 }), NOW)?.text).toBe('Avant 89 € · en baisse aujourd’hui');
    // Back to the same: nothing to say.
    expect(priceChangeText(link({ price: 89, priceBefore: 89, priceChangedAt: NOW }), NOW)).toBeNull();
  });

  it('says when it was last checked', () => {
    expect(priceCheckedText(link(), NOW)).toBe('Suivi chaque jour, pas encore vérifié');
    expect(priceCheckedText(link({ priceCheckedAt: new Date(2026, 10, 9, 9, 12).getTime() }), NOW)).toBe('Vérifié aujourd’hui à 09:12');
    expect(priceCheckedText(link({ priceCheckedAt: new Date(2026, 10, 8, 18, 40).getTime() }), NOW)).toBe('Vérifié hier à 18:40');
    expect(priceCheckedText(link({ priceCheckedAt: new Date(2026, 10, 3, 9).getTime() }), NOW)).toBe('Vérifié le 3 nov.');
  });

  it('reads in English too', () => {
    addFrench(FR_PRICE_WATCH);
    setLocale('en');
    expect(priceChangeText(link({ price: 79, priceBefore: 89, priceChangedAt: new Date(2026, 10, 3, 9).getTime() }), NOW)?.text).toBe('Was €89 · down since 3 Nov');
    expect(priceCheckedText(link({ priceCheckedAt: new Date(2026, 10, 9, 9, 12).getTime() }), NOW)).toBe('Checked today at 09:12');
  });
});

describe('« Vérifier le prix »', () => {
  const answer = (fields: Partial<PriceCheckResponse>): PriceCheckResponse => ({ outcome: 'same', price: 89, currency: 'EUR', before: null, by: 'page', note: '', ...fields });

  it('says what it found in a slip of its tone', () => {
    expect(priceCheckSlip(answer({}))).toEqual({ text: 'Prix inchangé : 89 €', tone: 'info' });
    expect(priceCheckSlip(answer({ outcome: 'changed', price: 79, before: 89 }))).toEqual({ text: 'Le prix a baissé : 79 €, contre 89 € avant', tone: 'success' });
    expect(priceCheckSlip(answer({ outcome: 'changed', price: 99, before: 89 })).tone).toBe('info');
    expect(priceCheckSlip(answer({ outcome: 'found', price: 59.9 }))).toEqual({ text: 'Prix relevé : 59,90 €', tone: 'success' });
    expect(priceCheckSlip(answer({ outcome: 'hidden', by: null, note: 'Claude n’a pas trouvé de prix sur cette page.' }))).toEqual({ text: 'Claude n’a pas trouvé de prix sur cette page.', tone: 'warning' });
  });

  it('reads its request and its answer strictly', () => {
    expect(parsePriceCheckRequest({ linkId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' })).toEqual({ linkId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' });
    expect(parsePriceCheckRequest({ linkId: 'no spaces allowed' })).toBeNull();
    expect(parsePriceCheckRequest(null)).toBeNull();
    expect(parsePriceCheckResponse({ outcome: 'changed', price: 79, currency: 'EUR', before: 89, by: 'claude', note: '' })).toEqual({ outcome: 'changed', price: 79, currency: 'EUR', before: 89, by: 'claude', note: '' });
    expect(parsePriceCheckResponse({ outcome: 'later', price: 79 })).toBeNull();
    expect(parsePriceCheckResponse({ outcome: 'hidden', price: null, currency: 'eur', before: -3 })).toEqual({ outcome: 'hidden', price: null, currency: null, before: null, by: null, note: '' });
  });
});
