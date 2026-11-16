/** Clock's French for its phone app's screens. Keys are the English exactly as written in `t()` / `tx()`. */
import type { Dictionary } from '@unlease/core/i18n';

export const FR_PHONE: Dictionary = {
  // The alarms
  'The + button below sets one. Each alarm rings on every phone of yours, unless told not to.': 'Le bouton + en bas en règle une. Chaque alarme sonne sur tous vos téléphones, sauf ceux qui ne doivent pas sonner.',
  'It won’t ring on {day}': 'Elle ne sonnera pas le {day}',

  // The editor
  'Hours': 'Heures',
  'Morning or afternoon': 'Matin ou après-midi',
  'Shown as it rings, such as “Train to Lyon”.': 'Affiché quand elle sonne, comme « Train pour Lyon ».',
  'Silent and without vibration, it only shows on the screen.': 'Silencieuse et sans vibreur, elle ne fait que s’afficher.',
  'Skip the next one ({day})': 'Ignorer la prochaine ({day})',
  'It rings again the time after.': 'Elle sonnera de nouveau la fois suivante.',
  'Stop skipping': 'Ne plus ignorer',
  'Phone sound…': 'Son du téléphone…',
  'One of this phone’s alarm sounds': 'Une sonnerie d’alarme de ce téléphone',

  // Réglages: what keeps the alarms from ringing
  'So that your alarms ring': 'Pour que vos alarmes sonnent',
  'Allow them in Android’s settings: without them, an alarm can’t show as it rings.': 'Autorisez-les dans les paramètres d’Android : sans elles, une alarme ne peut pas s’afficher quand elle sonne.',
  'Alarms may ring late': 'Les alarmes peuvent sonner en retard',
  'The ringing screen can’t show': 'L’écran de l’alarme ne peut pas s’afficher',
  'Allow full-screen notifications, so an alarm lights the screen over the lock screen.': 'Autorisez les notifications en plein écran, pour qu’une alarme allume l’écran par-dessus l’écran de verrouillage.',
  'The alarm volume is off': 'Le volume des alarmes est coupé',
  'An alarm raises it to a third as it rings: set the volume you want to wake to.': 'Une alarme le monte au tiers en sonnant : réglez le volume auquel vous voulez vous réveiller.',
  'Do Not Disturb silences alarms': 'Ne pas déranger coupe les alarmes',
  'It lets no alarm through: allow alarms in it, or they ring unheard.': 'Il ne laisse passer aucune alarme : autorisez-les, sinon elles sonnent sans bruit.',
  '“Alarms ringing” turned down': '« Alarmes qui sonnent » atténuées',
  'Let these notifications pop up on screen: without it, no ringing screen and no Snooze or Stop.': 'Laissez ces notifications s’afficher à l’écran : sans cela, pas d’écran de sonnerie, ni Répéter ni Arrêter.',
  'The alarm volume is low': 'Le volume des alarmes est bas',
  'It may not wake you: raise the alarm volume.': 'Il risque de ne pas vous réveiller : montez le volume des alarmes.',
  'Alarms still ring, but the notices and the sync wait: under “Battery”, choose “Optimized” or “Unrestricted”.': 'Les alarmes sonnent quand même, mais les avis et la synchronisation attendent : sous « Batterie », choisissez « Optimisée » ou « Sans restriction ».',

  // Réglages: « Alarmes »
  'Off on a tablet or a second phone: your alarms ring on your other phones.': 'Désactivé sur une tablette ou un second téléphone : vos alarmes sonnent sur vos autres téléphones.',
  'Left ringing, an alarm stops and says it was missed.': 'Laissée sonner, une alarme s’arrête et indique qu’elle a été manquée.',
  'What they do while an alarm rings.': 'Ce qu’ils font quand une alarme sonne.',
  'A quiet notification before it rings, to skip it.': 'Une notification discrète avant qu’elle sonne, pour l’ignorer.',
  'Try an alarm': 'Essayer une alarme',
  'One rings in 10 seconds, with a new alarm’s sound.': 'Une alarme sonne dans 10 secondes, avec le son d’une nouvelle alarme.',
  'An alarm rings in 10 seconds, as yours ring on this phone.': 'Une alarme sonne dans 10 secondes, comme les vôtres sur ce téléphone.',

  // Réglages: « Au réveil »
  'A new alarm shows the weather as it rings.': 'Une nouvelle alarme affiche la météo quand elle sonne.',
  'A new alarm shows the day’s first events from your calendar as it rings.': 'Une nouvelle alarme affiche les premiers événements de votre agenda quand elle sonne.',
  'Here': 'Ici',
  'A place': 'Un lieu',
  'Where the phone last was, to a kilometre or so.': 'Là où le téléphone était en dernier, à un kilomètre près.',
  'The location isn’t allowed: the weather is read for the place below.': 'La localisation n’est pas autorisée : la météo est lue pour le lieu ci-dessous.',
  'Otherwise': 'Sinon',
  'Search for a town': 'Rechercher une ville',
  'When the phone says nothing of where it is.': 'Quand le téléphone ne dit pas où il est.',
  'The weather where you are': 'La météo là où vous êtes',
  'Only for the weather as an alarm rings: where the phone last was, to a kilometre or so, goes to your server, which asks for the forecast.': 'Uniquement pour la météo quand une alarme sonne : là où le téléphone était en dernier, à un kilomètre près, part vers votre serveur, qui demande les prévisions.',
  'The location is turned off for this app in Android’s settings.': 'La localisation est désactivée pour cette application dans les paramètres d’Android.',
  'Open settings': 'Ouvrir les paramètres',
  'Without the location, the weather is read for the place below.': 'Sans la localisation, la météo est lue pour le lieu ci-dessous.',
  'Pick a place from the list, so its weather can be found.': 'Choisissez un lieu dans la liste, pour que sa météo soit trouvée.',

  // Réglages: « La veille au soir »
  'A word the evening before when tomorrow’s first event comes too soon after your alarm, with a way to ring earlier.': 'Un mot la veille au soir quand le premier événement du lendemain arrive trop tôt après votre réveil, avec de quoi sonner plus tôt.',
  'Check at {time}': 'Vérifier à {time}',
  'Between your alarm and the first event.': 'Entre votre réveil et le premier événement.',

  '{app} · your alarms, at home': '{app} · vos alarmes, chez vous',
};
