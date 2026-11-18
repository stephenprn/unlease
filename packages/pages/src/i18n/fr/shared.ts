/** French for Pages' words its two clients share. Keys are the English exactly as written in `t()` / `tx()`, single-quoted, one per line. */
import type { Dictionary } from '@unlease/core/i18n';

export const FR_SHARED: Dictionary = {
  'Calendar': 'Agenda',
  'Events shown': 'Événements montrés',
  'Label': 'Libellé',
  'All events': 'Tous les événements',
  '{count} d': '{count} j',
  'Days shown': 'Jours montrés',
  'Nothing planned in the next {count} days.': 'Rien de prévu les {count} prochains jours.',
  'Your next events, a label’s or all of them': 'Vos prochains événements, ceux d’un libellé ou tous',
  'This event no longer exists.': 'Cet événement n’existe plus.',
  'A page, a contact, an event, a note, a collection or a link': 'Une page, un contact, un événement, une note, une collection ou un lien',
  'Open the calendar': 'Ouvrir l’agenda',
  'Pages, contacts, events, notes, collections, links and dates': 'Pages, contacts, événements, notes, collections, liens et dates',
  'Event': 'Événement',
  // « [[ » with nothing typed and no other page (both clients)
  'No other page yet.': 'Aucune autre page pour l’instant.',
  // A select column's options, none yet (both clients)
  'Type an option’s name to create it.': 'Tapez le nom d’une option pour la créer.',
  // A code block's language search finding none (both clients)
  'No language matches.': 'Aucun langage ne correspond.',
  // A link's or an embed's address that cannot be read (both clients)
  'That isn’t an address: type for example example.org or https://example.org/page.': 'Ce n’est pas une adresse : tapez par exemple example.org ou https://example.org/page.',
  // Protected pages, and Carnet's protected notes shown here (both clients)
  'A page above this one is protected: it opens with the password.': 'Une page au-dessus de celle-ci est protégée : elle s’ouvre avec le mot de passe.',
  'Choose the password that will protect this page.': 'Choisissez le mot de passe qui protégera cette page.',
  'Page protected: it opens with the password': 'Page protégée : elle s’ouvre avec le mot de passe',
  'Protect with a password': 'Protéger par mot de passe',
  'Protected by a password': 'Protégée par mot de passe',
  'Protected link': 'Lien protégé',
  'Remove the protection': 'Retirer la protection',
  'This note is protected: it opens in {app} with the password.': 'Cette note est protégée : elle s’ouvre dans {app} avec le mot de passe.',
  'This page is protected: it opens with the password.': 'Cette page est protégée : elle s’ouvre avec le mot de passe.',
  'This page no longer asks for the password': 'Cette page ne demande plus le mot de passe',
};
