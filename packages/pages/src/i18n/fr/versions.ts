/** French for a page's version history, on both clients and in its package. Keys are the English exactly as written in `t()` / `tx()` / `plural()`, single-quoted, one per line. */
import type { Dictionary } from '@unlease/core/i18n';

export const FR_VERSIONS: Dictionary = {
  'Version history': 'Historique des versions',
  'Versions of {page}': 'Versions de {page}',
  'Your server keeps a version of each page a few minutes after you stop editing it: every one for a day, then one per day for 90 days.':
    'Votre serveur garde une version de chaque page quelques minutes après vos modifications : toutes pendant un jour, puis une par jour pendant 90 jours.',
  'Version history needs your server: connect one in Settings.': 'L’historique des versions a besoin de votre serveur : connectez-en un dans les réglages.',
  'No version yet: your server keeps one a few minutes after this page is edited.': 'Aucune version pour l’instant : votre serveur en garde une quelques minutes après une modification de la page.',
  'Couldn’t load the versions': 'Impossible de charger les versions',
  'Couldn’t load this version': 'Impossible de charger cette version',
  // The server's refusal of a version it let go.
  'This version is no longer kept': 'Cette version n’est plus conservée',
  'Yesterday': 'Hier',
  'The oldest version kept': 'La plus ancienne version conservée',
  'No change': 'Aucun changement',
  'block added': 'bloc ajouté',
  'blocks added': 'blocs ajoutés',
  'block removed': 'bloc retiré',
  'blocks removed': 'blocs retirés',
  'block changed': 'bloc modifié',
  'blocks changed': 'blocs modifiés',
  'block brought back': 'bloc rétabli',
  'blocks brought back': 'blocs rétablis',
  'Restore this version': 'Restaurer cette version',
  'Version restored': 'Version restaurée',
  'The page already reads as this version': 'La page est déjà dans cette version',
  'Changed since': 'Modifié depuis',
  'No longer on the page': 'N’est plus sur la page',
  'Restoring keeps the page’s sub-pages, its place and whether Claude may read it.': 'La restauration garde les sous-pages, la place de la page et son accès par Claude.',
  'This version is empty': 'Cette version est vide',
  'Back to the versions': 'Retour aux versions',
};
