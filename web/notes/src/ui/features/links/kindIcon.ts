import type { GlyphName } from '@unlease/design/glyphs';
import type { LinkKind } from '@unlease/notes/models/entities';

/** The glyph that stands in for a link with no image yet (the phone's table). */
export const KIND_ICONS: Record<LinkKind, GlyphName> = {
  product: 'bag',
  film: 'film',
  series: 'tv',
  book: 'book',
  music: 'music',
  game: 'gamepad',
  restaurant: 'utensils',
  place: 'mapPin',
  recipe: 'chefHat',
  article: 'newspaper',
  video: 'play',
  event: 'ticket',
  other: 'globe',
};
