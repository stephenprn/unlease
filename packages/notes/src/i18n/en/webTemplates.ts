/** « Ce que Claude relève » on Carnet's web app: what its page says that the phone's do not (the tab's name, the grip, the keys), and lines of its own. The words both clients share are `facts`'. */
import type { Dictionary } from '@unlease/core/i18n';

export const EN_WEB_TEMPLATES: Dictionary = {
  // The page: its tab's name.
  '{collection} · Ce que Claude relève': '{collection} · Facts Claude notes',
  // The editor.
  'Il a été supprimé, sur cet appareil ou sur un autre.': 'It was deleted, on this device or another.',
  'Lu sur les liens de {collections} une fois enregistré.': 'Read on the links in {collections} once saved.',
  '{links} · environ {cost} pour le relire': '{links} · about {cost} to read it again',
  // Its facts, as rows.
  'Nom': 'Name',
  'Déplacer « {name} »': 'Move “{name}”',
  'Glisser pour déplacer, ou Alt+↑ et Alt+↓': 'Drag to move, or Alt+↑ and Alt+↓',
  '{name} : position {index} sur {count}': '{name}: position {index} of {count}',
  // The preview.
  'Adresse à essayer': 'Address to try',
};
