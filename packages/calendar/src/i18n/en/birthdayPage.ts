/**
 * English for what Agenda's birthday page on the phone says of birthday notifications: Contacts'
 * (a setting of its phone app), opened there. « Souhaiter » and its ways are Contacts' words
 * (`packages/contacts/src/i18n/en/wishes.ts`). Keys are the French exactly as written in `t()`,
 * single-quoted, one per line.
 */
import type { Dictionary } from '@unlease/core/i18n';

export const EN_BIRTHDAY_PAGE: Dictionary = {
  'Notifications d’anniversaire': 'Birthday notifications',
  'Ouvre les anniversaires de {app}': 'Opens {app}’s birthdays',
  'Envoyées par {app} : l’heure et la veille se choisissent là.': 'Sent by {app}: the hour and the day before are chosen there.',
  'Envoyées par {app}, une fois installé sur ce téléphone.': 'Sent by {app}, once it is installed on this phone.',
};
