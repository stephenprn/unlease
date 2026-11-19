/** Clock's French for the alarm engine's words, the ringing window and the notices (the evening check, the notice before an alarm). */
import type { Dictionary } from '@unlease/core/i18n';

export const FR_RING: Dictionary = {
  // The engine's own notifications
  'Snoozed until {time}': 'Répétée jusqu’à {time}',
  'Missed alarm': 'Alarme manquée',
  'Alarms ringing': 'Alarmes qui sonnent',
  'Snoozed and missed alarms': 'Alarmes répétées et manquées',

  // The notices
  'An event too soon after tomorrow’s alarm, said the evening before': 'Un événement trop tôt après le réveil du lendemain, signalé la veille au soir',
  'Upcoming alarms': 'Alarmes à venir',
  'A quiet notice before an alarm, to skip it': 'Un avis discret avant une alarme, pour l’ignorer',
  'Alarm at {time}': 'Alarme à {time}',
  'Skip': 'Ignorer',
  'Turn off': 'Désactiver',

  // The ringing window
  'Test alarm': 'Alarme d’essai',
  'Snoozed once': 'Répétée une fois',
  'Snoozed {count} times': 'Répétée {count} fois',
  'Snooze · {minutes}': 'Répéter · {minutes}',
  'Nothing in your calendar today.': 'Rien dans votre agenda aujourd’hui.',
  '+ 1 more': '+ 1 autre',
  '+ {count} more': '+ {count} autres',
  'View the day': 'Voir la journée',
  'Stop the alarm': 'Arrêter l’alarme',
  'Slide the button to the end': 'Faites glisser le bouton jusqu’au bout',
  'Slide to stop': 'Glisser pour arrêter',
};
