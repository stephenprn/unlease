/**
 * How a collection's page lays its links out on this device: in which order (the collection's own,
 * the newest saved first, or by price either way) and which ones (all, those not read yet, those
 * whose page could not be read, those whose price dropped). The same on both clients; each keeps
 * the choice per collection on the device, never synced.
 *
 * The links done stay under « Déjà faits »: the order and the filter apply within each group, and
 * the done group's own order is the last stamped first.
 */
import { localized, t, tx } from '@unlease/core/i18n';
import type { LinkItem } from '../models/entities';

export const LINE_SORTS = ['own', 'added', 'priceUp', 'priceDown'] as const;
export type LineSort = (typeof LINE_SORTS)[number];

export const LINE_FILTERS = ['all', 'unread', 'failed', 'priceDrop'] as const;
export type LineFilter = (typeof LINE_FILTERS)[number];

export interface LineView {
  readonly sort: LineSort;
  readonly filter: LineFilter;
}

export const DEFAULT_LINE_VIEW: LineView = { sort: 'own', filter: 'all' };

/** What each order is called, in the menu and on its button. */
export const LINE_SORT_NAMES: Readonly<Record<LineSort, string>> = localized({
  own: tx('Ordre de la collection'),
  added: tx('Ajoutés récemment'),
  priceUp: tx('Prix croissant'),
  priceDown: tx('Prix décroissant'),
});

/** What each filter is called, in the menu and on its button. */
export const LINE_FILTER_NAMES: Readonly<Record<LineFilter, string>> = localized({
  all: tx('Tous les liens'),
  unread: tx('Non lus'),
  failed: tx('Lecture impossible [filter]'),
  priceDrop: tx('Prix en baisse'),
});

/** A link nobody has read yet: kept while there was no key, or waiting for its reading. */
export const isUnread = (link: Pick<LinkItem, 'status'>): boolean => link.status === 'pending' || link.status === 'skipped';

export interface PriceMove {
  readonly direction: 'down' | 'up';
  /** How much, always positive, in the link's currency. */
  readonly amount: number;
}

type Priced = Pick<LinkItem, 'price'> & Partial<Pick<LinkItem, 'priceBefore' | 'priceChangedAt'>>;

/**
 * How far the price moved when « Suivi des prix » last saw it change (the server writes `priceBefore`
 * in the link's currency, with `priceChangedAt`); null before any change, or once back to the cent.
 * The same rule as `priceChange` in `./priceWatch` (the link page's), kept here rather than
 * imported: `priceWatch` reads `modules`, which reads the rows' `linkRow`, which reads this.
 */
export function priceMove(link: Priced): PriceMove | null {
  const before = link.priceBefore ?? null;
  if (link.price === null || before === null || (link.priceChangedAt ?? null) === null) return null;
  const cents = Math.round(link.price * 100) - Math.round(before * 100);
  if (cents === 0) return null;
  return { direction: cents < 0 ? 'down' : 'up', amount: Math.abs(cents) / 100 };
}

export function linkMatches(link: Pick<LinkItem, 'status'> & Priced, filter: LineFilter): boolean {
  switch (filter) {
    case 'unread':
      return isUnread(link);
    case 'failed':
      return link.status === 'failed';
    case 'priceDrop':
      return priceMove(link)?.direction === 'down';
    default:
      return true;
  }
}

type Ranked = readonly [link: LinkItem, at: number];

/** Within a group: the order asked for, ties kept as they came (each sort here is stable on its own). */
function ordered(links: readonly LinkItem[], sort: LineSort, own: (a: LinkItem, b: LinkItem) => number): LinkItem[] {
  const ranked: Ranked[] = links.map((link, at) => [link, at]);
  const compare = (a: LinkItem, b: LinkItem): number => {
    switch (sort) {
      case 'added':
        return b.createdAt - a.createdAt;
      case 'priceUp':
      case 'priceDown': {
        // Without a price, last either way.
        if (a.price === null || b.price === null) return a.price === b.price ? 0 : a.price === null ? 1 : -1;
        return sort === 'priceUp' ? a.price - b.price : b.price - a.price;
      }
      default:
        return own(a, b);
    }
  };
  return ranked.sort(([a, at], [b, bt]) => compare(a, b) || at - bt).map(([link]) => link);
}

export interface LineArrangement {
  /** The links to do, filtered and in order. */
  readonly open: readonly LinkItem[];
  /** The links done, filtered and in order, for « Déjà faits ». */
  readonly done: readonly LinkItem[];
  /** How many of the collection's links each filter keeps, done ones included. */
  readonly counts: Readonly<Record<LineFilter, number>>;
  /** How many have a price: the price orders mean something from two. */
  readonly priced: number;
}

/**
 * The collection's links (live ones, in the collection's own order) as the page shows them with
 * `view`: the links to do, then the done ones, the last stamped first in the collection's order.
 */
export function arrangeLine(links: readonly LinkItem[], view: LineView): LineArrangement {
  const live = links.filter(link => link.deletedAt === null);
  const counts = { all: 0, unread: 0, failed: 0, priceDrop: 0 } as Record<LineFilter, number>;
  let priced = 0;
  for (const link of live) {
    for (const filter of LINE_FILTERS) if (linkMatches(link, filter)) counts[filter] += 1;
    if (link.price !== null) priced += 1;
  }
  const kept = live.filter(link => linkMatches(link, view.filter));
  return {
    open: ordered(
      kept.filter(link => !link.done),
      view.sort,
      () => 0,
    ),
    done: ordered(
      kept.filter(link => link.done),
      view.sort,
      (a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0),
    ),
    counts,
    priced,
  };
}

export const isDefaultLineView = (view: LineView): boolean => view.sort === DEFAULT_LINE_VIEW.sort && view.filter === DEFAULT_LINE_VIEW.filter;

/** A view as stored on a device, read back: anything this version does not know is the default. */
export function readLineView(raw: unknown): LineView {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const sort = (LINE_SORTS as readonly unknown[]).includes(value.sort) ? (value.sort as LineSort) : DEFAULT_LINE_VIEW.sort;
  const filter = (LINE_FILTERS as readonly unknown[]).includes(value.filter) ? (value.filter as LineFilter) : DEFAULT_LINE_VIEW.filter;
  return { sort, filter };
}

/** Every collection's view as stored (`{ [collectionId]: view }`), only those set apart from the default. */
export function readLineViews(raw: unknown): Readonly<Record<string, LineView>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, LineView> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const view = readLineView(value);
    if (!isDefaultLineView(view)) out[id] = view;
  }
  return out;
}

/** The stored views with one collection's changed: a view back to the default is forgotten. */
export function withLineView(views: Readonly<Record<string, LineView>>, id: string, view: LineView): Readonly<Record<string, LineView>> {
  const others = { ...views };
  delete others[id];
  return isDefaultLineView(view) ? others : { ...others, [id]: view };
}

/** What the page says when its filter keeps none of the collection's links (« Tout afficher » follows it). */
export function emptyFilterSentence(filter: LineFilter, collection: string): string {
  switch (filter) {
    case 'unread':
      return t('Aucun lien non lu dans {collection}.', { collection });
    case 'failed':
      return t('Tous les liens de {collection} ont pu être lus.', { collection });
    case 'priceDrop':
      return t('Aucun prix en baisse dans {collection} pour l’instant.', { collection });
    default:
      return '';
  }
}
