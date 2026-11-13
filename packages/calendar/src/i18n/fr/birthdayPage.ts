/**
 * French for what Agenda's birthday page on the phone says of birthday notifications: Contacts'
 * (a setting of its phone app), opened there. « Souhaiter » and its ways are Contacts' words
 * (`packages/contacts/src/i18n/fr/wishes.ts`). Keys are the English exactly as written in `t()`,
 * single-quoted, one per line.
 */
import type { Dictionary } from '@unlease/core/i18n';

export const FR_BIRTHDAY_PAGE: Dictionary = {
  'Birthday notifications': 'Notifications d’anniversaire',
  'Opens {app}’s birthdays': 'Ouvre les anniversaires de {app}',
  'Sent by {app}: the hour and the day before are chosen there.': 'Envoyées par {app} : l’heure et la veille se choisissent là.',
  'Sent by {app}, once it is installed on this phone.': 'Envoyées par {app}, une fois installé sur ce téléphone.',
};
