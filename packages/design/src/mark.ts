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

/**
 * The drive's mark, for Seafile's logo and favicon: the card become a folder, the same corners and
 * turn, the fold of its flap cut out (even-odd) so the pebble shows through. Drafted by
 * tools/icons/draft_drive_mark.mjs.
 */
export const MARK_DRIVE =
  'M14.2 30.11A4.5 4.5 0 0 1 18.21 25.16L35.61 23.33C41.25 22.74 43.44 31.56 49.08 30.96L71.36 28.62A9 9 0 0 1 81.25 36.63L84.07 63.48A12 12 0 0 1 73.39 76.67L28.64 81.38A9 9 0 0 1 18.75 73.37L14.2 30.11ZM26.51 44.4L70.77 39.75A2.75 2.75 0 0 1 73.79 42.19L73.79 42.19A2.75 2.75 0 0 1 71.34 45.22L27.09 49.87A2.75 2.75 0 0 1 24.07 47.42L24.07 47.42A2.75 2.75 0 0 1 26.51 44.4Z';

/**
 * Pages' mark: the card become a sheet of paper, the same corners and turn, its top right corner
 * folded down (a crease apart from the sheet) and a title and three lines of writing cut out of it
 * (even-odd), so the pebble shows through. Its phone app's launcher and its brand in the app.
 * Drafted by tools/icons/draft_page_mark.mjs.
 */
export const MARK_PAGE =
  'M35.31 19.36L56.39 17.14L58.27 35.04L76.17 33.16L79.41 63.95A19.04 19.04 0 0 1 62.46 84.88L39.07 87.34A13.44 13.44 0 0 1 24.3 75.37L20.36 37.82A16.8 16.8 0 0 1 35.31 19.36ZM59.25 19.45L60.59 32.18L73.32 30.85ZM33.54 34.12L48.46 32.55A3.5 3.5 0 0 1 52.31 35.67L52.31 35.67A3.5 3.5 0 0 1 49.19 39.52L34.27 41.08A3.5 3.5 0 0 1 30.43 37.97L30.43 37.97A3.5 3.5 0 0 1 33.54 34.12ZM33.94 49.36L65.16 46.08A2.3 2.3 0 0 1 67.69 48.13L67.69 48.13A2.3 2.3 0 0 1 65.65 50.66L34.42 53.94A2.3 2.3 0 0 1 31.89 51.89L31.89 51.89A2.3 2.3 0 0 1 33.94 49.36ZM34.98 59.31L66.21 56.03A2.3 2.3 0 0 1 68.74 58.07L68.74 58.07A2.3 2.3 0 0 1 66.69 60.6L35.46 63.88A2.3 2.3 0 0 1 32.93 61.84L32.93 61.84A2.3 2.3 0 0 1 34.98 59.31ZM36.03 69.26L54.33 67.33A2.3 2.3 0 0 1 56.85 69.38L56.85 69.38A2.3 2.3 0 0 1 54.81 71.91L36.51 73.83A2.3 2.3 0 0 1 33.98 71.78L33.98 71.78A2.3 2.3 0 0 1 36.03 69.26Z';

/**
 * Contacts' mark: the card become an address book's card, the same corners and turn, a person cut
 * out of it (a round head over round shoulders, even-odd), so the pebble shows through. Its phone
 * app's launcher and its brand in the app. Drafted by tools/icons/draft_contact_mark.mjs.
 */
export const MARK_CONTACT =
  'M35.01 20.39L63.86 17.36A11.6 11.6 0 0 1 76.6 27.69L80.23 62.18A19.72 19.72 0 0 1 62.68 83.85L38.45 86.4A13.92 13.92 0 0 1 23.15 74.01L19.53 39.52A17.4 17.4 0 0 1 35.01 20.39ZM39.81 43.02A9.2 9.2 0 1 1 58.1 41.09A9.2 9.2 0 1 1 39.81 43.02ZM37.77 74.4Q34.79 74.71 34.48 71.73A17.5 17.5 0 0 1 69.29 68.07Q69.6 71.06 66.62 71.37Z';

/**
 * Agenda's mark: the card become a calendar's page, the same corners and turn, a slit under its
 * band and two rows of days cut out of it (one round, the day marked; even-odd), so the pebble
 * shows through. Its phone app's launcher and its brand in the app. Drafted by
 * tools/icons/draft_calendar_mark.mjs.
 */
export const MARK_CALENDAR =
  'M35.01 20.39L63.86 17.36A11.6 11.6 0 0 1 76.6 27.69L80.23 62.18A19.72 19.72 0 0 1 62.68 83.85L38.45 86.4A13.92 13.92 0 0 1 23.15 74.01L19.53 39.52A17.4 17.4 0 0 1 35.01 20.39ZM30.14 37.19L66.34 33.39A1.8 1.8 0 0 1 68.32 34.99L68.32 34.99A1.8 1.8 0 0 1 66.72 36.97L30.52 40.77A1.8 1.8 0 0 1 28.54 39.17L28.54 39.17A1.8 1.8 0 0 1 30.14 37.19ZM33.66 47.68L38.23 47.2A2.2 2.2 0 0 1 40.65 49.16L41.13 53.74A2.2 2.2 0 0 1 39.17 56.15L34.6 56.64A2.2 2.2 0 0 1 32.18 54.68L31.7 50.1A2.2 2.2 0 0 1 33.66 47.68ZM47.09 46.27L51.66 45.79A2.2 2.2 0 0 1 54.08 47.75L54.56 52.33A2.2 2.2 0 0 1 52.6 54.74L48.03 55.22A2.2 2.2 0 0 1 45.61 53.27L45.13 48.69A2.2 2.2 0 0 1 47.09 46.27ZM60.51 44.86L65.09 44.38A2.2 2.2 0 0 1 67.5 46.34L67.99 50.91A2.2 2.2 0 0 1 66.03 53.33L61.45 53.81A2.2 2.2 0 0 1 59.03 51.85L58.55 47.28A2.2 2.2 0 0 1 60.51 44.86ZM35.07 61.11L39.65 60.63A2.2 2.2 0 0 1 42.06 62.59L42.54 67.16A2.2 2.2 0 0 1 40.59 69.58L36.01 70.06A2.2 2.2 0 0 1 33.59 68.1L33.11 63.53A2.2 2.2 0 0 1 35.07 61.11ZM46.18 64.47A5.1 5.1 0 1 1 56.33 63.4A5.1 5.1 0 1 1 46.18 64.47ZM61.92 58.29L66.5 57.81A2.2 2.2 0 0 1 68.92 59.77L69.4 64.34A2.2 2.2 0 0 1 67.44 66.76L62.86 67.24A2.2 2.2 0 0 1 60.45 65.28L59.96 60.71A2.2 2.2 0 0 1 61.92 58.29Z';
