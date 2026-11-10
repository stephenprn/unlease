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
  coupons: tx('Codes promo'),
  cheaper: tx('Moins cher ailleurs'),
  secondhand: tx('Seconde main'),
  pricewatch: tx('Suivi des prix'),
  servings: tx('Pour N personnes'),
  groceries: tx('Liste de courses'),
  cooking: tx('En cuisine'),
  // « Notes » is also the app's notes: its English is the context's.
  ratings: tx('Notes [rating]'),
  recap: tx('Résumé jusqu’ici'),
  senscritique: tx('SensCritique'),
  seerr: tx('Seerr'),
  directions: tx('Y aller'),
  agenda: tx('Ajouter à l’agenda'),
  archive: tx('Garder une copie'),
  coverage: tx('Autres regards'),
  ask: tx('Demander à Claude'),
});

export const MODULE_DESCRIPTIONS: Readonly<Record<LinkModule, string>> = localized({
  coupons: tx('Claude cherche sur le web les codes qui marchent en ce moment dans la boutique, et d’autres façons de payer moins.'),
  cheaper: tx('Claude cherche le même article dans d’autres boutiques, et dit où il coûte le moins.'),
  secondhand: tx('Claude cherche l’article d’occasion ou reconditionné, avec son prix habituel, et ouvre les sites de revente.'),
  pricewatch: tx('Le serveur relit le prix sur la page de la boutique chaque jour, et le lien dit s’il a baissé ou monté, et depuis quand.'),
  servings: tx('Les quantités de la recette pour le nombre de personnes choisi, dans la liste de courses et en cuisine.'),
  groceries: tx('Les ingrédients d’une recette dans une liste à cocher, nouvelle ou déjà commencée.'),
  cooking: tx('La recette étape par étape, l’écran gardé allumé, les ingrédients à cocher et un minuteur d’un geste.'),
  ratings: tx('Claude cherche les notes de l’œuvre sur SensCritique, IMDb et Rotten Tomatoes.'),
  recap: tx('Claude résume la série jusqu’à l’endroit où vous vous êtes arrêté, sans rien dévoiler de la suite.'),
  senscritique: tx('Ouvre l’œuvre dans la recherche de SensCritique.'),
  seerr: tx('Ouvre le film ou la série dans votre Seerr, pour le demander ou voir s’il est disponible.'),
  directions: tx('Ouvre l’itinéraire dans Google Maps.'),
  agenda: tx('Claude lit la date, l’heure et le lieu du lien, et l’agenda s’ouvre sur l’événement prêt à enregistrer.'),
  archive: tx('Le texte et les images de l’article dans une page, lisible même si le site disparaît.'),
  coverage: tx('Claude cherche le même sujet dans d’autres médias, et ce que chacun ajoute ou contredit.'),
  ask: tx('Une question sur ce lien : Claude répond d’après la page, et d’après le web si vous le cochez.'),
});

/** Which links show it, in a few words. */
export const MODULE_FITS: Readonly<Record<LinkModule, string>> = localized({
  coupons: tx('Les liens avec un prix'),
  cheaper: tx('Les articles à acheter'),
  secondhand: tx('Les articles à acheter'),
  pricewatch: tx('Les articles à acheter'),
  servings: tx('Les recettes'),
  groceries: tx('Les recettes'),
  cooking: tx('Les recettes'),
  ratings: tx('Les films, séries, livres, musiques et jeux'),
  recap: tx('Les séries'),
  senscritique: tx('Les films, séries, livres, musiques et jeux'),
  seerr: tx('Les films et les séries'),
  directions: tx('Les restaurants, les lieux et les événements'),
  agenda: tx('Les événements, et les liens qui donnent une date'),
  archive: tx('Les lectures'),
  coverage: tx('Les lectures'),
  ask: tx('Tous les liens'),
});

/** The modules sheet's sections, in this order. */
export const MODULE_GROUPS: readonly { readonly title: string; readonly modules: readonly LinkModule[] }[] = [
  { title: tx('Achats'), modules: ['coupons', 'cheaper', 'secondhand', 'pricewatch'] },
  { title: tx('Recettes'), modules: ['servings', 'groceries', 'cooking'] },
  { title: tx('Films, séries, livres et jeux'), modules: ['ratings', 'recap', 'senscritique', 'seerr'] },
  { title: tx('Lieux et sorties'), modules: ['directions', 'agenda'] },
  { title: tx('Lectures'), modules: ['archive', 'coverage'] },
  { title: tx('Tous les liens'), modules: ['ask'] },
];
