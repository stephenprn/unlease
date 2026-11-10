/** English for a collection's order and filter, « Tout lire », and what a link's row says of its price and note (both clients and `notes/services/lineView`, `linkRow`). Keys are the French exactly as written in `t()` / `tx()`, single-quoted, one per line. */
import type { Dictionary } from '@unlease/core/i18n';

export const EN_LINE_VIEWS: Dictionary = {
  'Ordre de la collection': 'Collection order',
  'Ajoutés récemment': 'Recently added',
  'Prix croissant': 'Price: low to high',
  'Prix décroissant': 'Price: high to low',
  'Non lus': 'Unread',
  'Lecture impossible [filter]': 'Couldn’t be read',
  'Prix en baisse': 'Price dropped',
  '« {note} »': '“{note}”',
  'Aucun lien non lu dans {collection}.': 'No unread links in {collection}.',
  'Tous les liens de {collection} ont pu être lus.': 'Every link in {collection} could be read.',
  'Aucun prix en baisse dans {collection} pour l’instant.': 'No price has dropped in {collection} for now.',
  'Tout afficher': 'Show all',
  'Liens affichés : {filter}': 'Links shown: {filter}',
  'Ordre : {order}': 'Order: {order}',
  '{links} · environ {cost} pour tout lire': '{links} · about {cost} to read them all',
  '{links} · environ {cost} pour tout relire': '{links} · about {cost} to read them all again',
  'lien gardé sans lecture': 'link kept unread',
  'liens gardés sans lecture': 'links kept unread',
  'lecture impossible': 'link that couldn’t be read',
  'lectures impossibles': 'links that couldn’t be read',
  'Tout lire': 'Read all',
  'Tout réessayer': 'Retry all',
  'Votre note : {note}': 'Your note: {note}',
};
