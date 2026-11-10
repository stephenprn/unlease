import type { Fields } from '@unlease/core/sync/record';
import { setLocale } from '@unlease/core/i18n';
import type { LinkItem } from '../../models/entities';
import { linkFromRecord } from '../../sync/entities';
import { linkRowText, noteLine } from '../linkRow';
import { priceChange } from '../priceWatch';
import {
  arrangeLine,
  DEFAULT_LINE_VIEW,
  emptyFilterSentence,
  isUnread,
  LINE_FILTER_NAMES,
  LINE_SORT_NAMES,
  linkMatches,
  priceMove,
  readLineView,
  readLineViews,
  withLineView,
  type LineView,
} from '../lineView';

const link = (id: string, fields: Fields = {}): LinkItem =>
  linkFromRecord({ type: 'link', id, fields: { noteId: 'mode', url: `https://exemple.fr/${id}`, status: 'ready', createdAt: 1, deletedAt: null, ...fields }, clocks: {} });
const ids = (links: readonly LinkItem[]): string[] => links.map(item => item.id);
const view = (sort: LineView['sort'], filter: LineView['filter'] = 'all'): LineView => ({ sort, filter });

// The collection's own order: as the library lists them (by position).
const LINKS = [
  link('veste', { price: 189, priceBefore: 215, priceChangedAt: 100, currency: 'EUR', createdAt: 20 }),
  link('chemise', { status: 'pending', createdAt: 50 }),
  link('bonnet', { status: 'skipped', createdAt: 10 }),
  link('sac', { status: 'failed', error: 'Page protégée contre les robots', createdAt: 30 }),
  link('pull', { price: 89.9, currency: 'EUR', createdAt: 40 }),
  link('lampe', { price: 64, priceBefore: 59, priceChangedAt: 100, currency: 'EUR', createdAt: 5 }),
  link('echarpe', { price: 75, currency: 'EUR', done: true, doneAt: 900, createdAt: 2 }),
  link('baskets', { price: 129, currency: 'EUR', done: true, doneAt: 950, createdAt: 3 }),
  link('gone', { price: 1, currency: 'EUR', deletedAt: 5 }),
];

describe('a collection’s order and filter', () => {
  it('keeps the collection’s own order, the done ones last stamped first', () => {
    const shown = arrangeLine(LINKS, DEFAULT_LINE_VIEW);
    expect(ids(shown.open)).toEqual(['veste', 'chemise', 'bonnet', 'sac', 'pull', 'lampe']);
    expect(ids(shown.done)).toEqual(['baskets', 'echarpe']);
  });

  it('sorts the newest saved first', () => {
    expect(ids(arrangeLine(LINKS, view('added')).open)).toEqual(['chemise', 'pull', 'sac', 'veste', 'bonnet', 'lampe']);
    expect(ids(arrangeLine(LINKS, view('added')).done)).toEqual(['baskets', 'echarpe']);
  });

  it('sorts by price either way, the links without a price last in their own order', () => {
    expect(ids(arrangeLine(LINKS, view('priceUp')).open)).toEqual(['lampe', 'pull', 'veste', 'chemise', 'bonnet', 'sac']);
    expect(ids(arrangeLine(LINKS, view('priceDown')).open)).toEqual(['veste', 'pull', 'lampe', 'chemise', 'bonnet', 'sac']);
    // « Déjà faits » stays apart, in the same order.
    expect(ids(arrangeLine(LINKS, view('priceUp')).done)).toEqual(['echarpe', 'baskets']);
  });

  it('keeps ties in the collection’s order', () => {
    const twins = [link('a', { price: 10 }), link('b', { price: 10 }), link('c', { price: 10 })];
    expect(ids(arrangeLine(twins, view('priceUp')).open)).toEqual(['a', 'b', 'c']);
    expect(ids(arrangeLine(twins, view('priceDown')).open)).toEqual(['a', 'b', 'c']);
  });

  it('filters the links not read yet, those that could not be read, and the price drops', () => {
    expect(ids(arrangeLine(LINKS, view('own', 'unread')).open)).toEqual(['chemise', 'bonnet']);
    expect(ids(arrangeLine(LINKS, view('own', 'failed')).open)).toEqual(['sac']);
    expect(ids(arrangeLine(LINKS, view('own', 'priceDrop')).open)).toEqual(['veste']);
    expect(arrangeLine(LINKS, view('own', 'priceDrop')).done).toEqual([]);
  });

  it('counts what each filter keeps, done links included, the deleted ones never', () => {
    const shown = arrangeLine(LINKS, view('priceUp', 'failed'));
    expect(shown.counts).toEqual({ all: 8, unread: 2, failed: 1, priceDrop: 1 });
    expect(shown.priced).toBe(5);
  });

  it('says what a link is', () => {
    expect(isUnread({ status: 'skipped' })).toBe(true);
    expect(isUnread({ status: 'pending' })).toBe(true);
    expect(isUnread({ status: 'failed' })).toBe(false);
    expect(linkMatches({ status: 'ready', price: 10, priceBefore: 12, priceChangedAt: 1 }, 'priceDrop')).toBe(true);
    expect(linkMatches({ status: 'ready', price: 12, priceBefore: 10, priceChangedAt: 1 }, 'priceDrop')).toBe(false);
  });

  it('reads a price change only when the price moved', () => {
    const at = { priceChangedAt: 1 };
    expect(priceMove({ price: 189, priceBefore: 215, ...at })).toEqual({ direction: 'down', amount: 26 });
    expect(priceMove({ price: 64, priceBefore: 59, ...at })).toEqual({ direction: 'up', amount: 5 });
    expect(priceMove({ price: 19.99, priceBefore: 24.99, ...at })).toEqual({ direction: 'down', amount: 5 });
    expect(priceMove({ price: 10, priceBefore: 10.001, ...at })).toBeNull();
    expect(priceMove({ price: 10, priceBefore: null, ...at })).toBeNull();
    expect(priceMove({ price: null, priceBefore: 10, ...at })).toBeNull();
    expect(priceMove({ price: 10, priceBefore: 12 })).toBeNull();
    expect(priceMove({ price: 10, priceBefore: 12, priceChangedAt: null })).toBeNull();
  });

  it('sees a change exactly when the link page does (`priceWatch`)', () => {
    const cases = [
      { price: 189, priceBefore: 215, priceChangedAt: 1 },
      { price: 64, priceBefore: 59, priceChangedAt: 1 },
      { price: 10, priceBefore: 10.004, priceChangedAt: 1 },
      { price: 10, priceBefore: 12, priceChangedAt: null },
      { price: null, priceBefore: 12, priceChangedAt: 1 },
      { price: 10, priceBefore: null, priceChangedAt: null },
    ];
    for (const prices of cases) {
      const page = priceChange(prices);
      expect(priceMove(prices)?.direction ?? null).toBe(page ? (page.down ? 'down' : 'up') : null);
    }
  });

  it('reads a stored view back, and forgets one back to the default', () => {
    expect(readLineView({ sort: 'priceDown', filter: 'unread' })).toEqual({ sort: 'priceDown', filter: 'unread' });
    expect(readLineView({ sort: 'byMood', filter: 42 })).toEqual(DEFAULT_LINE_VIEW);
    expect(readLineView(null)).toEqual(DEFAULT_LINE_VIEW);
    expect(readLineViews({ a: { sort: 'added' }, b: { sort: 'own', filter: 'all' }, c: 'x' })).toEqual({ a: { sort: 'added', filter: 'all' } });
    expect(readLineViews([1, 2])).toEqual({});
    const views = withLineView({}, 'mode', view('priceUp'));
    expect(views).toEqual({ mode: { sort: 'priceUp', filter: 'all' } });
    expect(withLineView(views, 'mode', DEFAULT_LINE_VIEW)).toEqual({});
  });

  it('names the orders and filters, and what an empty filter leaves', () => {
    expect(LINE_SORT_NAMES.priceUp).toBe('Prix croissant');
    expect(LINE_FILTER_NAMES.failed).toBe('Lecture impossible');
    expect(emptyFilterSentence('unread', 'Mode')).toBe('Aucun lien non lu dans Mode.');
    expect(emptyFilterSentence('all', 'Mode')).toBe('');
  });
});

describe('a link row’s price and note', () => {
  const row = (fields: Partial<Parameters<typeof linkRowText>[0]>) => linkRowText({ url: 'https://exemple.fr/veste', title: 'Veste', siteName: 'Atelier Nord', kind: 'product', attributes: [], ...fields });

  afterEach(() => setLocale('fr'));

  it('says the price and how much it dropped or rose', () => {
    const drop = row({ price: 189, currency: 'EUR', priceBefore: 215, priceChangedAt: 1 });
    expect(drop.price).toBe('189 €');
    expect(drop.priceChange).toEqual({ direction: 'down', amount: '26 €' });
    expect(row({ price: 64, currency: 'EUR', priceBefore: 59, priceChangedAt: 1 }).priceChange?.direction).toBe('up');
    expect(row({ price: 64, currency: 'EUR' }).priceChange).toBeNull();
    expect(row({}).price).toBeNull();
    expect(row({}).priceChange).toBeNull();
  });

  it('shows the owner’s note on one line, quoted', () => {
    expect(row({ comment: 'En M. Voir en boutique avant.' }).note).toBe('« En M. Voir en boutique avant. »');
    expect(row({ comment: '  \n ' }).note).toBe('');
    expect(row({}).note).toBe('');
    expect(noteLine('- taille M\n- couleur camel\n\nVoir en boutique.')).toBe('taille M · couleur camel · Voir en boutique.');
    expect(noteLine('Trop cher.\nAttendre les soldes')).toBe('Trop cher. Attendre les soldes');
    expect(noteLine('a'.repeat(400)).length).toBe(160);
  });

  it('says them in English', () => {
    setLocale('en');
    const shown = row({ price: 189, currency: 'EUR', priceBefore: 215, priceChangedAt: 1, comment: 'Size M' });
    expect(shown.priceChange?.amount).toBe('€26');
    expect(shown.note).toBe('“Size M”');
    expect(LINE_FILTER_NAMES.failed).toBe('Couldn’t be read');
    expect(LINE_SORT_NAMES.priceUp).toBe('Price: low to high');
  });
});
