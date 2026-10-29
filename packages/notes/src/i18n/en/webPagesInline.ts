/** English for the web pages' dates, emojis, keys, [[ and tables of contents. Keys are the French exactly as written in `t()` / `tx()`, single-quoted, one per line. */
import type { Dictionary } from '@unlease/core/i18n';

export const EN_WEB_PAGES_INLINE: Dictionary = {
  // DateEditor
  'Retirer la date': 'Remove the date',
  'Mois précédent': 'Previous month',
  'Mois suivant': 'Next month',

  // FormatBar
  'Touches': 'Keys',

  // InlineEmoji
  'Insérer un emoji': 'Insert an emoji',

  // Menus
  'Dates': 'Dates',
  'Emoji': 'Emoji',
  'Citer une page': 'Cite a page',
  'Pages, notes, collections, liens et dates': 'Pages, notes, collections, links and dates',

  // slashCommands
  'Dans le texte': 'In the text',
  'Aujourd’hui, à changer ensuite': 'Today, to change after',
  'Un emoji dans la phrase': 'An emoji in the sentence',

  // TocBlock
  'Table des matières': 'Table of contents',
  'Ajoutez des titres à la page : ils apparaîtront ici.': 'Add headings to the page: they will show here.',
};
