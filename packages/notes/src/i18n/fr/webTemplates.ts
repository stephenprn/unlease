/** « Ce que Claude relève » on Carnet's web app: what its page says that the phone's do not (the tab's name, the grip, the keys), and lines of its own. The words both clients share are `facts`'. */
import type { Dictionary } from '@unlease/core/i18n';

export const FR_WEB_TEMPLATES: Dictionary = {
  // The page: its tab's name.
  '{collection} · Facts Claude notes': '{collection} · Ce que Claude relève',
  // The editor.
  'It was deleted, on this device or another.': 'Il a été supprimé, sur cet appareil ou sur un autre.',
  'Read on the links in {collections} once saved.': 'Lu sur les liens de {collections} une fois enregistré.',
  '{links} · about {cost} to read it again': '{links} · environ {cost} pour le relire',
  // Its facts, as rows.
  'Name': 'Nom',
  'Move “{name}”': 'Déplacer « {name} »',
  'Drag to move, or Alt+↑ and Alt+↓': 'Glisser pour déplacer, ou Alt+↑ et Alt+↓',
  '{name}: position {index} of {count}': '{name} : position {index} sur {count}',
  // The preview.
  'Address to try': 'Adresse à essayer',
};
