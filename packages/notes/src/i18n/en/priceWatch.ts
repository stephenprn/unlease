/** English for « Suivi des prix » (the module, the link page's lines and slips on both clients, the server's words). Keys are the French exactly as written in `t()` / `tx()`, single-quoted, one per line. */
import type { Dictionary } from '@unlease/core/i18n';

export const EN_PRICE_WATCH: Dictionary = {
  // The module (`notes/models/modules`, `notes/services/modules`)
  'Suivi des prix': 'Price watch',
  'Le serveur relit le prix sur la page de la boutique chaque jour, et le lien dit s’il a baissé ou monté, et depuis quand.': 'The server reads the price on the shop’s page every day, and the link says whether it went down or up, and since when.',
  'Gratuit, ou Claude une fois par semaine si la page cache son prix': 'Free, or Claude once a week when the page hides its price',

  // Under the price (`notes/services/priceWatch`)
  'Avant {price} · en baisse aujourd’hui': 'Was {price} · down today',
  'Avant {price} · en baisse depuis hier': 'Was {price} · down since yesterday',
  'Avant {price} · en baisse depuis le {day}': 'Was {price} · down since {day}',
  'Avant {price} · en hausse aujourd’hui': 'Was {price} · up today',
  'Avant {price} · en hausse depuis hier': 'Was {price} · up since yesterday',
  'Avant {price} · en hausse depuis le {day}': 'Was {price} · up since {day}',
  'Suivi chaque jour, pas encore vérifié': 'Watched daily, not checked yet',
  'Vérifié aujourd’hui à {time}': 'Checked today at {time}',
  'Vérifié hier à {time}': 'Checked yesterday at {time}',
  'Vérifié le {day}': 'Checked on {day}',

  // « Vérifier le prix » and its slip
  'Vérifier le prix': 'Check the price',
  'Prix inchangé : {price}': 'Price unchanged: {price}',
  'Prix relevé : {price}': 'Price read: {price}',
  'Le prix a baissé : {price}, contre {before} avant': 'The price went down: {price}, from {before}',
  'Le prix a augmenté : {price}, contre {before} avant': 'The price went up: {price}, from {before}',
  'Cette page ne montre pas son prix.': 'This page does not show its price.',

  // The server's words (`server/src/apps/notes/priceWatch.ts`)
  'Demande de vérification du prix invalide': 'Invalid price check request',
  'Prix vérifié à l’instant : réessayez dans une minute.': 'Price checked a moment ago: try again in a minute.',
  'Trop de vérifications de prix : réessayez dans un moment.': 'Too many price checks: try again in a while.',
  'Cette page cache son prix, et Claude l’a déjà relu cette semaine.': 'This page hides its price, and Claude already read it this week.',
  'Cette page cache son prix, et Claude a lu assez de prix pour aujourd’hui.': 'This page hides its price, and Claude has read enough prices for today.',
  'Cette page cache son prix, et le budget Claude du mois est atteint.': 'This page hides its price, and this month’s Claude budget is reached.',
  'Claude n’a pas trouvé de prix sur cette page.': 'Claude found no price on this page.',
};
