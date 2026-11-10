/** « Modèles de fiche » on Carnet's web app: what its editor says that the phone's sheets do not (the rows' columns, the grip, the keys), and its lines of its own. The words both clients share are `phoneTemplates`'. */
import type { Dictionary } from '@unlease/core/i18n';

export const EN_WEB_TEMPLATES: Dictionary = {
  // The list.
  'Vos propres champs, pour les liens d’une collection : vins, plantes, jeux…': 'Your own fields, for the links in a collection: wines, plants, games…',
  // The editor.
  'Ce modèle n’existe plus': 'This template no longer exists',
  'Il a été supprimé, sur cet appareil ou sur un autre.': 'It was deleted, on this device or another.',
  'Lu sur les liens de {collections} une fois enregistré.': 'Read on the links in {collections} once saved.',
  '{links} · environ {cost} pour le relire': '{links} · about {cost} to read it again',
  // Its fields, as rows.
  'Nom': 'Name',
  'Champ {index}': 'Field {index}',
  'Champ sans nom': 'Unnamed field',
  'Nom du champ': 'Field name',
  'Nom du champ {index}': 'Name of field {index}',
  'Type du champ {index}': 'Type of field {index}',
  'Ce qu’il faut y mettre, champ {index}': 'What goes in field {index}',
  'Déplacer « {name} »': 'Move “{name}”',
  'Glisser pour déplacer, ou Alt+↑ et Alt+↓': 'Drag to move, or Alt+↑ and Alt+↓',
  '{name} : position {index} sur {count}': '{name}: position {index} of {count}',
  'Champ « {name} » ajouté': 'Field “{name}” added',
  'Actions de « {name} »': 'Actions for “{name}”',
  'Actions du champ': 'Field actions',
  // « Essayer ».
  'Adresse à essayer': 'Address to try',
};
