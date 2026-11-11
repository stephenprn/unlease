/** English for Pages' words its two clients share. Keys are the French exactly as written in `t()` / `tx()`, single-quoted, one per line. */
import type { Dictionary } from '@unlease/core/i18n';

export const EN_SHARED: Dictionary = {
  'Agenda': 'Calendar',
  'Événements montrés': 'Events shown',
  'Libellé': 'Label',
  'Tous les événements': 'All events',
  '{count} j': '{count} d',
  'Jours montrés': 'Days shown',
  'Rien de prévu les {count} prochains jours.': 'Nothing planned in the next {count} days.',
  'Vos prochains événements, ceux d’un libellé ou tous': 'Your next events, a label’s or all of them',
  'Cet événement n’existe plus.': 'This event no longer exists.',
  'Une page, un contact, un événement, une note, une collection ou un lien': 'A page, a contact, an event, a note, a collection or a link',
  'Ouvrir l’agenda': 'Open the calendar',
  'Pages, contacts, événements, notes, collections, liens et dates': 'Pages, contacts, events, notes, collections, links and dates',
  'Événement': 'Event',
  // « [[ » with nothing typed and no other page (both clients)
  'Aucune autre page pour l’instant.': 'No other page yet.',
  // A select column's options, none yet (both clients)
  'Tapez le nom d’une option pour la créer.': 'Type an option’s name to create it.',
  // A code block's language search finding none (both clients)
  'Aucun langage ne correspond.': 'No language matches.',
  // A link's or an embed's address that cannot be read (both clients)
  'Ce n’est pas une adresse : tapez par exemple example.org ou https://example.org/page.': 'That isn’t an address: type for example example.org or https://example.org/page.',
};
