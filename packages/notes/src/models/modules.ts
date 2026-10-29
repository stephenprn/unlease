/**
 * Link modules: small tools a collection shows on its links (a shop's promo codes, a recipe's
 * shopping list, the way to a place). Each collection picks its own (`Note.modules`, synced); a
 * collection nobody set keeps the defaults. Stored as these keys; an unknown one (a newer client's)
 * is kept and ignored. The order here is the order on a link.
 */
import type { GlyphName } from '@unlease/design/glyphs';
import { localized, tx } from '@unlease/core/i18n';

export const LINK_MODULES = [
  'coupons',
  'cheaper',
  'secondhand',
  'servings',
  'groceries',
  'cooking',
  'ratings',
  'recap',
  'senscritique',
  'seerr',
  'directions',
  'archive',
  'coverage',
  'ask',
] as const;

export type LinkModule = (typeof LINK_MODULES)[number];

export function isLinkModule(value: unknown): value is LinkModule {
  return typeof value === 'string' && (LINK_MODULES as readonly string[]).includes(value);
}

/** Until a collection's modules are picked: the free ones and promo codes, each shown only on the links it fits. */
export const DEFAULT_MODULES: readonly LinkModule[] = ['coupons', 'servings', 'groceries', 'cooking', 'senscritique', 'seerr', 'directions', 'archive'];

/** What a module needs to work: nothing, the server (it reads the page), Claude (it asks or searches the web), or Seerr set on the server. */
export type ModuleNeed = 'nothing' | 'server' | 'claude' | 'seerr';

export const MODULE_NEEDS: Readonly<Record<LinkModule, ModuleNeed>> = {
  coupons: 'claude',
  cheaper: 'claude',
  secondhand: 'claude',
  servings: 'nothing',
  groceries: 'server',
  cooking: 'server',
  ratings: 'claude',
  recap: 'claude',
  senscritique: 'nothing',
  seerr: 'seerr',
  directions: 'nothing',
  archive: 'server',
  coverage: 'claude',
  ask: 'claude',
};

export const MODULE_ICONS: Readonly<Record<LinkModule, GlyphName>> = {
  coupons: 'percent',
  cheaper: 'trendDown',
  secondhand: 'recycle',
  servings: 'people',
  groceries: 'basket',
  cooking: 'pot',
  ratings: 'star',
  recap: 'rewind',
  senscritique: 'bubble',
  seerr: 'download',
  directions: 'mapPin',
  archive: 'pagePlus',
  coverage: 'eye',
  ask: 'sparkle',
};

export const MODULE_NAMES: Readonly<Record<LinkModule, string>> = localized({
  coupons: tx('Codes promo'),
  cheaper: tx('Moins cher ailleurs'),
  secondhand: tx('Seconde main'),
  servings: tx('Pour N personnes'),
  groceries: tx('Liste de courses'),
  cooking: tx('En cuisine'),
  // « Notes » is also the app's notes: its English is the context's.
  ratings: tx('Notes [rating]'),
  recap: tx('Résumé jusqu’ici'),
  senscritique: tx('SensCritique'),
  seerr: tx('Seerr'),
  directions: tx('Y aller'),
  archive: tx('Garder une copie'),
  coverage: tx('Autres regards'),
  ask: tx('Demander à Claude'),
});

export const MODULE_DESCRIPTIONS: Readonly<Record<LinkModule, string>> = localized({
  coupons: tx('Claude cherche sur le web les codes qui marchent en ce moment dans la boutique, et d’autres façons de payer moins.'),
  cheaper: tx('Claude cherche le même article dans d’autres boutiques, et dit où il coûte le moins.'),
  secondhand: tx('Claude cherche l’article d’occasion ou reconditionné, avec son prix habituel, et ouvre les sites de revente.'),
  servings: tx('Les quantités de la recette pour le nombre de personnes choisi, dans la liste de courses et en cuisine.'),
  groceries: tx('Les ingrédients d’une recette dans une liste à cocher, nouvelle ou déjà commencée.'),
  cooking: tx('La recette étape par étape, l’écran gardé allumé, les ingrédients à cocher et un minuteur d’un geste.'),
  ratings: tx('Claude cherche les notes de l’œuvre sur SensCritique, IMDb et Rotten Tomatoes.'),
  recap: tx('Claude résume la série jusqu’à l’endroit où vous vous êtes arrêté, sans rien dévoiler de la suite.'),
  senscritique: tx('Ouvre l’œuvre dans la recherche de SensCritique.'),
  seerr: tx('Ouvre le film ou la série dans votre Seerr, pour le demander ou voir s’il est disponible.'),
  directions: tx('Ouvre l’itinéraire dans Google Maps.'),
  archive: tx('Le texte et les images de l’article dans une page, lisible même si le site disparaît.'),
  coverage: tx('Claude cherche le même sujet dans d’autres médias, et ce que chacun ajoute ou contredit.'),
  ask: tx('Une question sur ce lien : Claude répond d’après la page, et d’après le web si vous le cochez.'),
});

/** Which links show it, in a few words. */
export const MODULE_FITS: Readonly<Record<LinkModule, string>> = localized({
  coupons: tx('Les liens avec un prix'),
  cheaper: tx('Les articles à acheter'),
  secondhand: tx('Les articles à acheter'),
  servings: tx('Les recettes'),
  groceries: tx('Les recettes'),
  cooking: tx('Les recettes'),
  ratings: tx('Les films, séries, livres, musiques et jeux'),
  recap: tx('Les séries'),
  senscritique: tx('Les films, séries, livres, musiques et jeux'),
  seerr: tx('Les films et les séries'),
  directions: tx('Les restaurants, les lieux et les événements'),
  archive: tx('Les lectures'),
  coverage: tx('Les lectures'),
  ask: tx('Tous les liens'),
});

/** The modules sheet's sections, in this order. */
export const MODULE_GROUPS: readonly { readonly title: string; readonly modules: readonly LinkModule[] }[] = [
  { title: tx('Achats'), modules: ['coupons', 'cheaper', 'secondhand'] },
  { title: tx('Recettes'), modules: ['servings', 'groceries', 'cooking'] },
  { title: tx('Films, séries, livres et jeux'), modules: ['ratings', 'recap', 'senscritique', 'seerr'] },
  { title: tx('Lieux et sorties'), modules: ['directions'] },
  { title: tx('Lectures'), modules: ['archive', 'coverage'] },
  { title: tx('Tous les liens'), modules: ['ask'] },
];
