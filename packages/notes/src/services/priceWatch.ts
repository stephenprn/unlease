/**
 * « Suivi des prix » (`pricewatch`, a link module a collection switches on): the server reads each
 * watched link's price once a day from the shop's own page, and Claude reads it when the page hides
 * it (at most once a week a link), then writes what changed on the link under its clock (`price`,
 * `currency`, `priceBefore`, `priceChangedAt`, `priceCheckedAt`; a client never writes them). What a
 * reading changes (`priceUpdate`, the server's) and how the link page says it (`priceChange`,
 * `priceChangeText`, `priceCheckedText`, `priceCheckSlip`, both clients') live here.
 */
import { t } from '@unlease/core/i18n';
import { dayDelta, formatClock, formatDay, formatPrice } from '@unlease/core/services/format';
import type { LinkItem, Note } from '../models/entities';
import type { LinkModule } from '../models/modules';
import type { PriceCheckResponse } from '../sync/priceWatch';
import { lineModules, moduleFits } from './modules';

export const PRICE_WATCH = 'pricewatch' satisfies LinkModule;

/** Whether this collection watches its products' prices (switched on in its « Modules »; never by default). */
export function watchesPrices(line: Pick<Note, 'modules'> | null | undefined): boolean {
  return lineModules(line).includes(PRICE_WATCH);
}

/** A live collection of links that watches prices: its links are read each day. */
export function watchingLine(line: Pick<Note, 'kind' | 'modules' | 'trashedAt' | 'archived' | 'deletedAt'> | null | undefined): boolean {
  return !!line && line.kind === 'links' && line.deletedAt === null && line.trashedAt === null && !line.archived && watchesPrices(line);
}

/** Whether the watch reads this link: its collection watches, and it is something to buy not bought yet. */
export function isWatched(link: LinkItem, line: Parameters<typeof watchingLine>[0]): boolean {
  return watchingLine(line) && moduleFits(PRICE_WATCH, link);
}

/** A price as the watch compares two: to the cent. */
const cents = (amount: number): number => Math.round(amount * 100);

/** A price read on a page, or by Claude: in the currency's main unit (49.9 is 49,90 €); its currency when it says one. */
export interface PriceSeen {
  readonly amount: number;
  readonly currency: string | null;
}

/** Whether a price read is one: above nothing (0 is a page's placeholder), below a billion. */
export function isPrice(amount: number | null | undefined): amount is number {
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0 && amount < 1e9;
}

export type PriceOutcome = 'same' | 'changed' | 'found';

export interface PriceUpdate {
  readonly outcome: PriceOutcome;
  /** The link's fields to write (the server's, under its clock). */
  readonly fields: Readonly<Record<string, number | string | null>>;
}

type Watched = Pick<LinkItem, 'price' | 'currency' | 'priceCheckedAt' | 'analyzedAt'>;

/**
 * What a reading of the price writes on the link, stamped `now`:
 * - the same price: only when it was read (`priceCheckedAt`);
 * - another price in the same currency: it, the one it replaces as `priceBefore` and when
 *   (`priceChangedAt`); a price going back up keeps the last different one (89, 79, then 89 again
 *   says « avant 79 »);
 * - a price to start from (`found`): the link had none, the page now says another currency (no
 *   comparing euros with dollars: the change before is cleared), or this is the watch's first reading
 *   since Claude read the page (its first ever, or after « Relire la page »): Claude may have read
 *   another size's price, so only the watch's own readings are compared.
 * A page that gives no price (gone, hidden, unreachable) writes nothing: the last price stays.
 */
export function priceUpdate(link: Watched, seen: PriceSeen, now: number): PriceUpdate {
  const amount = cents(seen.amount) / 100;
  const currency = seen.currency ?? link.currency;
  const otherCurrency = link.currency !== null && currency !== null && currency !== link.currency;
  if (otherCurrency) return { outcome: 'found', fields: { price: amount, currency, priceBefore: null, priceChangedAt: null, priceCheckedAt: now } };
  if (link.price !== null && cents(link.price) === cents(amount)) {
    return { outcome: 'same', fields: { priceCheckedAt: now, ...(currency !== link.currency ? { currency } : {}) } };
  }
  const fresh = link.price === null || link.priceCheckedAt === null || (link.analyzedAt !== null && link.analyzedAt > link.priceCheckedAt);
  if (fresh) return { outcome: 'found', fields: { price: amount, currency, priceCheckedAt: now } };
  return { outcome: 'changed', fields: { price: amount, currency, priceBefore: link.price, priceChangedAt: now, priceCheckedAt: now } };
}

export interface PriceChange {
  /** The price before the change, in the link's currency. */
  readonly before: number;
  /** A drop (the good news, in the `ok` ink), or a rise (quiet). */
  readonly down: boolean;
  readonly since: number;
}

/** The link's last change of price, as the watch saw it; null until it saw one (or when it came back to the same). */
export function priceChange(link: Pick<LinkItem, 'price' | 'priceBefore' | 'priceChangedAt'>): PriceChange | null {
  if (link.price === null || link.priceBefore === null || link.priceChangedAt === null) return null;
  if (cents(link.price) === cents(link.priceBefore)) return null;
  return { before: link.priceBefore, down: link.price < link.priceBefore, since: link.priceChangedAt };
}

/** Under the price: « Avant 89 € · en baisse depuis le 3 nov. », « … en hausse aujourd’hui »; null before any change. */
export function priceChangeText(link: Pick<LinkItem, 'price' | 'currency' | 'priceBefore' | 'priceChangedAt'>, now: number): { readonly text: string; readonly down: boolean } | null {
  const change = priceChange(link);
  if (!change) return null;
  const price = formatPrice(change.before, link.currency);
  const delta = dayDelta(change.since, now);
  const day = formatDay(change.since, now);
  if (change.down) {
    const text = delta >= 0 ? t('Avant {price} · en baisse aujourd’hui', { price }) : delta === -1 ? t('Avant {price} · en baisse depuis hier', { price }) : t('Avant {price} · en baisse depuis le {day}', { price, day });
    return { text, down: true };
  }
  const text = delta >= 0 ? t('Avant {price} · en hausse aujourd’hui', { price }) : delta === -1 ? t('Avant {price} · en hausse depuis hier', { price }) : t('Avant {price} · en hausse depuis le {day}', { price, day });
  return { text, down: false };
}

/** When the watch last read the price: « Vérifié aujourd’hui à 09:12 », « Vérifié hier à 18:40 », « Vérifié le 3 nov. », or that it has not yet. */
export function priceCheckedText(link: Pick<LinkItem, 'priceCheckedAt'>, now: number): string {
  const at = link.priceCheckedAt;
  if (at === null) return t('Suivi chaque jour, pas encore vérifié');
  const delta = dayDelta(at, now);
  if (delta >= 0) return t('Vérifié aujourd’hui à {time}', { time: formatClock(at) });
  if (delta === -1) return t('Vérifié hier à {time}', { time: formatClock(at) });
  return t('Vérifié le {day}', { day: formatDay(at, now) });
}

export type PriceSlipTone = 'info' | 'success' | 'warning';

/** « Vérifier le prix »'s answer as its slip: a drop is good news, a rise or the same price is news, a hidden price a warning. */
export function priceCheckSlip(answer: PriceCheckResponse): { readonly text: string; readonly tone: PriceSlipTone } {
  const price = answer.price === null ? '' : formatPrice(answer.price, answer.currency);
  if (answer.outcome === 'hidden' || answer.price === null) return { text: answer.note ? t(answer.note) : t('Cette page ne montre pas son prix.'), tone: 'warning' };
  if (answer.outcome === 'same') return { text: t('Prix inchangé : {price}', { price }), tone: 'info' };
  if (answer.outcome === 'found' || answer.before === null) return { text: t('Prix relevé : {price}', { price }), tone: 'success' };
  const before = formatPrice(answer.before, answer.currency);
  return answer.price < answer.before ? { text: t('Le prix a baissé : {price}, contre {before} avant', { price, before }), tone: 'success' } : { text: t('Le prix a augmenté : {price}, contre {before} avant', { price, before }), tone: 'info' };
}
