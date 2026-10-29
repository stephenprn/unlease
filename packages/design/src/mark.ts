/**
 * The Carnet mark: a beige note card with habits-garden's uneven corners, turned a little, a leaf
 * and its stem cut out of it, so the matcha tile shows through as the leaf. Two colours; the card
 * alone is the one-colour silhouette. Paths on the 100 grid of the visible tile (the launcher
 * shows 72 of its 108 dp); the phone, the web, the launcher, the widget and the notification icon
 * draw them. Drafted by tools/icons/draft_mark.mjs.
 */
export const MARK_VIEWBOX = 100;

/** The pebble the mark sits on in the app and the widget (the launcher's own mask replaces it there). */
export const MARK_PEBBLE =
  'M50 4C70 3 90 13 95 34C100 55 93 79 75 91C57 102 31 99 16 85C2 72 1 49 8 31C15 13 30 5 50 4Z';

/** The card, the leaf and its stem cut out of it (even-odd). */
export const MARK_CARD =
  'M35.01 20.39L63.86 17.36A11.6 11.6 0 0 1 76.6 27.69L80.23 62.18A19.72 19.72 0 0 1 62.68 83.85L38.45 86.4A13.92 13.92 0 0 1 23.15 74.01L19.53 39.52A17.4 17.4 0 0 1 35.01 20.39ZM39.44 61.31C33.06 46.04 43.68 32.24 64.43 30.06C69.52 49.47 59.14 64.78 41.85 63.33Q40.02 66.5 39.2 70.73Q37.63 71.88 37.11 69.8Q37.83 65.18 39.44 61.31Z';

/** Where the card sits on its grid. */
export const MARK_BOUNDS = { x: 17.71, y: 16.15, width: 64.58, height: 71.7 } as const;
