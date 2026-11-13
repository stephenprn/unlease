/** French for « Suivi des prix » (the module, the link page's lines and slips on both clients, the server's words). Keys are the English exactly as written in `t()` / `tx()`, single-quoted, one per line. */
import type { Dictionary } from '@unlease/core/i18n';

export const FR_PRICE_WATCH: Dictionary = {
  // The module (`notes/models/modules`, `notes/services/modules`)
  'Price watch': 'Suivi des prix',
  'The server reads the price on the shop’s page every day, and the link says whether it went down or up, and since when.': 'Le serveur relit le prix sur la page de la boutique chaque jour, et le lien dit s’il a baissé ou monté, et depuis quand.',
  'Free, or Claude once a week when the page hides its price': 'Gratuit, ou Claude une fois par semaine si la page cache son prix',

  // Under the price (`notes/services/priceWatch`)
  'Was {price} · down today': 'Avant {price} · en baisse aujourd’hui',
  'Was {price} · down since yesterday': 'Avant {price} · en baisse depuis hier',
  'Was {price} · down since {day}': 'Avant {price} · en baisse depuis le {day}',
  'Was {price} · up today': 'Avant {price} · en hausse aujourd’hui',
  'Was {price} · up since yesterday': 'Avant {price} · en hausse depuis hier',
  'Was {price} · up since {day}': 'Avant {price} · en hausse depuis le {day}',
  'Watched daily, not checked yet': 'Suivi chaque jour, pas encore vérifié',
  'Checked today at {time}': 'Vérifié aujourd’hui à {time}',
  'Checked yesterday at {time}': 'Vérifié hier à {time}',
  'Checked on {day}': 'Vérifié le {day}',

  // « Vérifier le prix » and its slip
  'Check the price': 'Vérifier le prix',
  'Price unchanged: {price}': 'Prix inchangé : {price}',
  'Price read: {price}': 'Prix relevé : {price}',
  'The price went down: {price}, from {before}': 'Le prix a baissé : {price}, contre {before} avant',
  'The price went up: {price}, from {before}': 'Le prix a augmenté : {price}, contre {before} avant',
  'This page does not show its price.': 'Cette page ne montre pas son prix.',

  // The server's words (`server/src/apps/notes/priceWatch.ts`)
  'Invalid price check request': 'Demande de vérification du prix invalide',
  'Price checked a moment ago: try again in a minute.': 'Prix vérifié à l’instant : réessayez dans une minute.',
  'Too many price checks: try again in a while.': 'Trop de vérifications de prix : réessayez dans un moment.',
  'This page hides its price, and Claude already read it this week.': 'Cette page cache son prix, et Claude l’a déjà relu cette semaine.',
  'This page hides its price, and Claude has read enough prices for today.': 'Cette page cache son prix, et Claude a lu assez de prix pour aujourd’hui.',
  'This page hides its price, and this month’s Claude budget is reached.': 'Cette page cache son prix, et le budget Claude du mois est atteint.',
  'Claude found no price on this page.': 'Claude n’a pas trouvé de prix sur cette page.',
};
