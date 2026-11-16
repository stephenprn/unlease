/** Clock's French for its models and services, read on both clients. Keys are the English exactly as written in `t()` / `tx()`. */
import type { Dictionary } from '@unlease/core/i18n';

export const FR_SHARED: Dictionary = {
  // An alarm's days and its next ring
  'Once': 'Une fois',
  'Every day [alarm]': 'Tous les jours',
  'Weekdays': 'En semaine',
  'Workdays': 'Jours travaillés',
  'Weekends': 'Le week-end',
  'In less than a minute': 'Dans moins d’une minute',
  'In {days} d': 'Dans {days} j',
  'In {days} d {hours} h': 'Dans {days} j {hours} h',
  'Alarm set for less than a minute from now': 'Alarme réglée dans moins d’une minute',
  'Alarm set for {span} from now': 'Alarme réglée dans {span}',
  'Alarm set for {day} at {time}': 'Alarme réglée pour {day} à {time}',
  'Alarm': 'Alarme',
  'Alarms': 'Alarmes',
  'No alarms': 'Aucune alarme',

  // How it rings
  'Change the volume': 'Régler le volume',
  'Snooze': 'Répéter',
  'Stop': 'Arrêter',
  'Off': 'Désactivé',
  '1 minute': '1 minute',
  '{minutes} minutes': '{minutes} minutes',
  '{seconds} seconds': '{seconds} secondes',
  '{span} before': '{span} avant',
  'For “{title}”': 'Pour « {title} »',
  'Not on holidays and days off': 'Pas les jours fériés ni de congé',
  'From Agenda: its public holidays and your days off.': 'D’après Agenda : ses jours fériés et vos jours de congé.',
  'Unlink': 'Délier',
  'Rings before the event': 'Sonne avant l’événement',
  'Rings {span} before': 'Sonne {span} avant',

  // The evening check
  'Tomorrow, “{event}” starts before your alarm': 'Demain, « {event} » commence avant votre réveil',
  'Tomorrow, “{event}” starts as your alarm rings': 'Demain, « {event} » commence quand votre réveil sonne',
  'Tomorrow, “{event}” starts {span} after your alarm': 'Demain, « {event} » commence {span} après votre réveil',
  'Your alarm rings at {alarm}; “{event}” starts at {start}.': 'Votre réveil sonne à {alarm} ; « {event} » commence à {start}.',
  'Ring at {time}': 'Sonner à {time}',

  // Réglages
  'As it rings': 'Au réveil',
  'The evening before': 'La veille au soir',
  'Ring on this phone': 'Sonner sur ce téléphone',
  'Snooze length': 'Durée de répétition',
  'Stop ringing after': 'Arrêter de sonner après',
  'Volume rises over': 'Montée du volume',
  'Volume buttons': 'Boutons de volume',
  'A new alarm’s sound': 'Son d’une nouvelle alarme',
  'Notice before an alarm': 'Avis avant une alarme',
  'Weather for': 'Météo pour',
  'The day’s events': 'Les événements du jour',
  'Evening check': 'Vérification du soir',
  'Check at': 'Vérifier à',
  'Time to get ready': 'Temps pour se préparer',

  // Sounds
  'Sunrise': 'Lever de soleil',
  'Birdsong': 'Chant d’oiseaux',
  'Wind chimes': 'Carillon à vent',
  'Singing bowl': 'Bol chantant',
  'Bright melody': 'Mélodie claire',
  'Bell alarm clock': 'Réveil à cloche',
  'Digital beeps': 'Bips numériques',
  'Neon groove': 'Rythme néon',
  'Rooster': 'Coq',
  'Gentle': 'Doux',
  'Classic': 'Classique',
  'Lively': 'Énergique',
  'Silent (vibration only)': 'Silencieux (vibreur seul)',
  'A sound of the phone': 'Un son du téléphone',

  // The editor, as it is set
  'Rings in less than a minute': 'Sonnera dans moins d’une minute',
  'Rings in {span}': 'Sonnera dans {span}',
  'Rings in {days} d': 'Sonnera dans {days} j',
  'Rings in {days} d {hours} h': 'Sonnera dans {days} j {hours} h',
};
