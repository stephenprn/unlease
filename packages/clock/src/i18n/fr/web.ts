/** Clock's French for its web app's screens. Keys are the English exactly as written in `t()` / `tx()`. */
import type { Dictionary } from '@unlease/core/i18n';

export const FR_WEB: Dictionary = {
  // The alarms
  'New alarm': 'Nouvelle alarme',
  'New alarm (C)': 'Nouvelle alarme (C)',
  'New alarm at {time}': 'Nouvelle alarme à {time}',
  'New alarm “{label}”': 'Nouvelle alarme « {label} »',
  'Edit the alarm at {time}': 'Modifier l’alarme de {time}',
  'Your alarms ring on your phones with {app} for Android, never in this browser.': 'Vos alarmes sonnent sur vos téléphones avec {app} pour Android, jamais dans ce navigateur.',
  'Set one here: it rings on every phone with {app}.': 'Réglez-en une ici : elle sonnera sur chaque téléphone qui a {app}.',

  // An alarm's form
  'Edit alarm': 'Modifier l’alarme',
  'Label': 'Libellé',
  'Sound': 'Son',
  'Days of the week': 'Jours de la semaine',
  'Type the time it rings.': 'Saisissez l’heure à laquelle elle sonne.',
  'Type a time like 7:30, 730 or 7:30 pm.': 'Saisissez une heure comme 7h30, 730 ou 19:30.',
  'Shown as it rings, and in your list.': 'Affiché quand elle sonne, et dans votre liste.',
  'Vibrate': 'Vibreur',
  'Weather as it rings': 'Météo au réveil',
  'The day’s weather where the phone is, on the alarm’s screen.': 'La météo du jour là où est le téléphone, sur l’écran de l’alarme.',
  'The day’s events as it rings': 'Événements du jour au réveil',
  'Your first events from {app}, on the alarm’s screen.': 'Vos premiers événements d’{app}, sur l’écran de l’alarme.',
  'Skip the next one': 'Ignorer la prochaine',
  'Next ring: {day}': 'Prochaine sonnerie : {day}',
  'Stays quiet on {day}': 'Ne sonnera pas le {day}',
  'Alarm deleted': 'Alarme supprimée',
  'Alarm not found': 'Alarme introuvable',
  'This alarm no longer exists.': 'Cette alarme n’existe plus.',

  // The sound
  '{sound} (this phone)': '{sound} (ce téléphone)',
  'Play the sound': 'Écouter le son',
  'Stop the sound': 'Arrêter le son',
  'This sound plays on its phone only': 'Ce son ne se joue que sur son téléphone',
  'No sound to play': 'Aucun son à écouter',
  'This browser can’t play the sound.': 'Ce navigateur ne peut pas jouer ce son.',
  'Picked on a phone: that phone rings it, the others their own sound.': 'Choisi sur un téléphone : celui-ci le fait sonner, les autres leur propre son.',

  // Réglages
  'An alarm made in this browser starts with it.': 'Une alarme créée dans ce navigateur commence avec ce son.',
  '7:30 PM rather than 19:30.': '7:30 PM plutôt que 19:30.',
  'How an alarm rings (its snooze, its volume, the evening check) is set on each phone, in {app} for Android.': 'La façon dont une alarme sonne (la répétition, le volume, la vérification du soir) se règle sur chaque téléphone, dans {app} pour Android.',
  'A new alarm shows the day’s weather where the phone is.': 'Une nouvelle alarme affiche la météo du jour là où est le téléphone.',
  'A new alarm shows your first events from {app}.': 'Une nouvelle alarme affiche vos premiers événements d’{app}.',
  // The timers, the stopwatch and the world clocks
  'A timer started here rings only while this page is open. Saved timers are on your phones too.': 'Un minuteur lancé ici ne sonne que tant que cette page reste ouverte. Les minuteurs enregistrés sont aussi sur vos téléphones.',
  'Save the ones you start again and again from “New timer”: pasta, tea, eggs… each with its label.': 'Enregistrez depuis « Nouveau minuteur » ceux que vous relancez souvent : pâtes, thé, œufs… chacun avec son libellé.',
  'Timer not found': 'Minuteur introuvable',
  'This timer no longer exists.': 'Ce minuteur n’existe plus.',
  'On the stopwatch': 'Sur le chronomètre',
  'Start or pause': 'Démarrer ou mettre en pause',
  'Start the stopwatch': 'Démarrer le chronomètre',
  'Laps': 'Tours',
  'Cities': 'Villes',
  'Add the cities you follow: a friend’s, a trip’s, your office’s. Their time, day or night there, and how far ahead they are.': 'Ajoutez les villes que vous suivez : celle d’un proche, d’un voyage, de votre bureau. Leur heure, le jour ou la nuit là-bas, et l’écart avec ici.',
};
