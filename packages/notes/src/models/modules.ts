/**
 * Link modules: small tools a collection shows on its links (a shop's promo codes, a recipe's
 * shopping list, the way to a place). Each collection picks its own (`Note.modules`, synced); a
 * collection nobody set keeps the defaults. Stored as these keys; an unknown one (a newer client's)
 * is kept and ignored. The order here is the order on a link. A key is lowercase letters only (the
 * synced check, `notes/sync/types`): « Suivi des prix » is `pricewatch`.
 */
import type { GlyphName } from '@unlease/design/glyphs';
import { localized, tx } from '@unlease/core/i18n';

export const LINK_MODULES = [
  'coupons',
  'cheaper',
  'secondhand',
  'pricewatch',
  'servings',
  'groceries',
  'cooking',
  'ratings',
  'recap',
  'senscritique',
  'seerr',
  'directions',
  'agenda',
  'archive',
  'coverage',
  'ask',
] as const;

export type LinkModule = (typeof LINK_MODULES)[number];

export function isLinkModule(value: unknown): value is LinkModule {
  return typeof value === 'string' && (LINK_MODULES as readonly string[]).includes(value);
}

/** Until a collection's modules are picked: the free ones and promo codes, each shown only on the links it fits. */
export const DEFAULT_MODULES: readonly LinkModule[] = ['coupons', 'servings', 'groceries', 'cooking', 'senscritique', 'seerr', 'directions', 'agenda', 'archive'];

/** What a module needs to work: nothing, the server (it reads the page), Claude (it asks or searches the web), Seerr set on the server, the Pages app on the server (it makes a page), or Agenda on the server with Claude (it reads the link's date). */
export type ModuleNeed = 'nothing' | 'server' | 'claude' | 'seerr' | 'pages' | 'agenda';

export const MODULE_NEEDS: Readonly<Record<LinkModule, ModuleNeed>> = {
  coupons: 'claude',
  cheaper: 'claude',
  secondhand: 'claude',
  // The server reads the shop's page each day; Claude only when the page hides its price, within the budget.
  pricewatch: 'server',
  servings: 'nothing',
  groceries: 'server',
  cooking: 'server',
  ratings: 'claude',
  recap: 'claude',
  senscritique: 'nothing',
  seerr: 'seerr',
  directions: 'nothing',
  agenda: 'agenda',
  archive: 'pages',
  coverage: 'claude',
  ask: 'claude',
};

export const MODULE_ICONS: Readonly<Record<LinkModule, GlyphName>> = {
  coupons: 'percent',
  cheaper: 'trendDown',
  secondhand: 'recycle',
  pricewatch: 'eye',
  servings: 'people',
  groceries: 'basket',
  cooking: 'pot',
  ratings: 'star',
  recap: 'rewind',
  senscritique: 'bubble',
  seerr: 'download',
  directions: 'mapPin',
  agenda: 'calendar',
  archive: 'pagePlus',
  coverage: 'eye',
  ask: 'sparkle',
};

export const MODULE_NAMES: Readonly<Record<LinkModule, string>> = localized({
  coupons: tx('Promo codes'),
  cheaper: tx('Cheaper elsewhere'),
  secondhand: tx('Second-hand'),
  pricewatch: tx('Price watch'),
  servings: tx('For N people'),
  groceries: tx('Shopping list'),
  cooking: tx('Cook mode'),
  // « Notes » is also the app's notes: its English is the context's.
  ratings: tx('Ratings'),
  recap: tx('Story so far'),
  senscritique: tx('SensCritique'),
  seerr: tx('Seerr'),
  directions: tx('Get there'),
  agenda: tx('Add to calendar'),
  archive: tx('Keep a copy'),
  coverage: tx('Other takes'),
  ask: tx('Ask Claude'),
});

export const MODULE_DESCRIPTIONS: Readonly<Record<LinkModule, string>> = localized({
  coupons: tx('Claude searches the web for codes that work right now at the shop, and other ways to pay less.'),
  cheaper: tx('Claude looks for the same item at other shops, and says where it costs least.'),
  secondhand: tx('Claude looks for the item second-hand or refurbished, with its usual price, and opens the resale sites.'),
  pricewatch: tx('The server reads the price on the shop’s page every day, and the link says whether it went down or up, and since when.'),
  servings: tx('The recipe’s quantities for the number of people you choose, in the shopping list and in cook mode.'),
  groceries: tx('A recipe’s ingredients in a checklist, a new one or one already started.'),
  cooking: tx('The recipe step by step, the screen kept on, ingredients to tick off and a timer in one tap.'),
  ratings: tx('Claude looks up the work’s ratings on SensCritique, IMDb and Rotten Tomatoes.'),
  recap: tx('Claude recaps the series up to where you stopped, without giving away anything after.'),
  senscritique: tx('Opens the work in SensCritique’s search.'),
  seerr: tx('Opens the film or series in your Seerr, to request it or see whether it is there.'),
  directions: tx('Opens the directions in Google Maps.'),
  agenda: tx('Claude reads the link’s date, time and place, and the calendar opens on the event, ready to save.'),
  archive: tx('The article’s text and pictures in a page, readable even if the site goes away.'),
  coverage: tx('Claude looks for the same story in other outlets, and what each adds or contradicts.'),
  ask: tx('A question about this link: Claude answers from the page, and from the web if you tick it.'),
});

/** Which links show it, in a few words. */
export const MODULE_FITS: Readonly<Record<LinkModule, string>> = localized({
  coupons: tx('Links with a price'),
  cheaper: tx('Things to buy'),
  secondhand: tx('Things to buy'),
  pricewatch: tx('Things to buy'),
  servings: tx('Recipes [group]'),
  groceries: tx('Recipes [group]'),
  cooking: tx('Recipes [group]'),
  ratings: tx('Films, series, books, music and games'),
  recap: tx('Series [group]'),
  senscritique: tx('Films, series, books, music and games'),
  seerr: tx('Films and series'),
  directions: tx('Restaurants, places and events'),
  agenda: tx('Events, and links that give a date'),
  archive: tx('Reading [group]'),
  coverage: tx('Reading [group]'),
  ask: tx('All links'),
});

/** The modules sheet's sections, in this order. */
export const MODULE_GROUPS: readonly { readonly title: string; readonly modules: readonly LinkModule[] }[] = [
  { title: tx('Shopping'), modules: ['coupons', 'cheaper', 'secondhand', 'pricewatch'] },
  { title: tx('Recipes'), modules: ['servings', 'groceries', 'cooking'] },
  { title: tx('Films, series, books and games'), modules: ['ratings', 'recap', 'senscritique', 'seerr'] },
  { title: tx('Places and outings'), modules: ['directions', 'agenda'] },
  { title: tx('Reading'), modules: ['archive', 'coverage'] },
  { title: tx('All links'), modules: ['ask'] },
];
