/** French for the morning digest (`services/digest`: its words, and its rows in both clients' Réglages). Keys are the English exactly as written in `t()` / `tx()`, single-quoted, one per line. */
import type { Dictionary } from '@unlease/core/i18n';

export const FR_DIGEST: Dictionary = {
  // The notification
  'Today: {summary}': 'Aujourd’hui : {summary}',
  '{reminders} overdue': '{reminders} en retard',
  'And {items}': 'Et {items}',
  'more item': 'autre élément',
  'more items': 'autres éléments',
  'birthday': 'anniversaire',
  'birthdays': 'anniversaires',
  'reminder': 'rappel',
  'reminders': 'rappels',
  'Morning summary': 'Résumé du matin',
  'Your day summed up each morning, at the time you choose': 'Votre journée résumée chaque matin, à l’heure choisie',
  // Réglages
  'Your day in one notification each morning: events, birthdays, reminders and pages.': 'Votre journée en une notification chaque matin : événements, anniversaires, rappels et pages.',
  'At': 'À',
  'Even on days with nothing': 'Même les jours sans rien',
  'Says so when the day holds nothing.': 'Le dit quand la journée est vide.',
  'Morning summary on in this browser': 'Résumé du matin activé dans ce navigateur',
  'This browser’s morning summary turned off': 'Résumé du matin désactivé dans ce navigateur',
  'The morning summary goes through your server: connect one first.': 'Le résumé du matin passe par votre serveur : connectez-en un d’abord.',
};
