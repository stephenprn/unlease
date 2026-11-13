/**
 * One-tap starter collections, shared by the phone and the web. Fixed ids, so two devices that
 * both tap "Films & séries" make one collection, not two. Each comes with its own facts, chosen as
 * it is made (`starterFacts`).
 */
import { EMBLEMS, isEmblem, type CollectionEmblem, type Emblem } from '@unlease/design/emblems';
import { cutIndex } from '@unlease/design/shapes';
import { t, tx } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';
import { INBOX_ID } from './entities';
import type { PresetField, TemplateFieldType } from './templates';

export interface SuggestedCollection {
  readonly id: string;
  readonly title: string;
  readonly code: string;
  readonly hint: string;
  readonly emblem: Emblem;
  readonly color: LineColor;
  /**
   * What Claude notes on its links (« Informations personnalisées »), chosen as it is made:
   * a kind's fields where they mean the same (their ids and words, so facts already read keep
   * matching), and what this collection needs besides. `TEMPLATE_LIMITS.fields` at most.
   */
  readonly facts: readonly PresetField[];
}

/** Its title and sentence read in the interface's language, so a tapped one is made in it. */
const starter = (made: SuggestedCollection): SuggestedCollection => ({ ...made, get title() { return t(made.title); }, get hint() { return t(made.hint); } });

/** A starter's fact, as a kind's preset is written (`KIND_TEMPLATES`): its words French, marked for the dictionary. */
const fact = (id: string, name: string, type: TemplateFieldType, hint: string): PresetField => ({ id, name, type, hint });

export const SUGGESTED_COLLECTIONS: readonly SuggestedCollection[] = [
  starter({
    id: 'line-mode',
    title: tx('Fashion'),
    code: 'M',
    hint: tx('Clothes, shoes and accessories to buy.'),
    emblem: 'fleur',
    color: 'pink',
    facts: [
      fact('brand', tx('Brand'), 'text', tx('The brand or maker')),
      fact('model', tx('Model'), 'text', tx('The model’s name or reference')),
      fact('colour', tx('Colour'), 'text', tx('Its colour, or the colours on offer')),
      fact('sizes', tx('Size(s)'), 'list', tx('The sizes on offer')),
      fact('material', tx('Material'), 'text', tx('The main materials')),
      fact('fit', tx('Fit'), 'text', tx('How a garment is cut: slim, straight, loose…')),
      fact('availability', tx('Availability'), 'text', tx('In stock, on pre-order or sold out')),
    ],
  }),
  starter({
    id: 'line-films',
    title: tx('Films & series'),
    code: 'F',
    hint: tx('Films and series to watch, at the cinema or streaming.'),
    emblem: 'etoile',
    color: 'yellow',
    facts: [
      fact('director', tx('Director'), 'text', tx('Who directed the film, or created the series')),
      fact('year', tx('Year'), 'number', tx('The year it came out, or of its first episode')),
      fact('genre', tx('Genre'), 'list', tx('Its genres')),
      fact('length', tx('Length'), 'duration', tx('How long the film runs, or one episode')),
      fact('seasons', tx('Seasons'), 'number', tx('For a series, how many seasons')),
      fact('rating', tx('Rating'), 'text', tx('The audience’s or the critics’ rating, with its scale')),
      fact('whereToWatch', tx('Where to watch'), 'list', tx('In cinemas, or the streaming services that have it')),
    ],
  }),
  starter({
    id: 'line-restos',
    title: tx('Restaurants'),
    code: 'R',
    hint: tx('Restaurants, cafés and bars to try.'),
    emblem: 'soleil',
    color: 'red',
    facts: [
      fact('cuisine', tx('Cuisine'), 'text', tx('The kind of food')),
      fact('neighbourhood', tx('Neighbourhood'), 'text', tx('The neighbourhood and the city')),
      fact('averagePrice', tx('Average price'), 'text', tx('Roughly what a meal costs')),
      fact('address', tx('Address'), 'text', tx('The full address')),
      fact('hours', tx('Opening hours'), 'text', tx('The days and hours it is open')),
      fact('booking', tx('Booking'), 'text', tx('How to book: online, by phone, or walk-in only')),
      fact('phone', tx('Phone'), 'text', tx('The number to book')),
    ],
  }),
  starter({
    id: 'line-lire',
    title: tx('To read'),
    code: 'L',
    hint: tx('Articles, essays and books to read.'),
    emblem: 'feuille',
    color: 'green',
    facts: [
      fact('author', tx('Author'), 'text', tx('Who wrote it')),
      fact('source', tx('Source'), 'text', tx('The paper, the blog, the site or the publisher')),
      fact('date', tx('Date'), 'date', tx('The day it was published')),
      fact('readingTime', tx('Reading time'), 'duration', tx('How long it takes to read')),
      fact('pages', tx('Pages'), 'number', tx('For a book, how many pages')),
    ],
  }),
  starter({
    id: 'line-maison',
    title: tx('Home'),
    code: 'H',
    hint: tx('Furniture, decor and things for the home.'),
    emblem: 'arche',
    color: 'ochre',
    facts: [
      fact('brand', tx('Brand'), 'text', tx('The brand or maker')),
      fact('model', tx('Model'), 'text', tx('The model’s name or reference')),
      fact('dimensions', tx('Dimensions'), 'text', tx('Width, depth and height, with the unit')),
      fact('material', tx('Material'), 'text', tx('The main materials')),
      fact('colour', tx('Colour'), 'text', tx('Its colour, or the colours on offer')),
      fact('delivery', tx('Delivery'), 'text', tx('How long delivery takes, and what it costs')),
      fact('availability', tx('Availability'), 'text', tx('In stock, on pre-order or sold out')),
    ],
  }),
  starter({
    id: 'line-voyages',
    title: tx('Travel'),
    code: 'V',
    hint: tx('Places, hotels and travel ideas.'),
    emblem: 'oiseau',
    color: 'blue',
    facts: [
      fact('destination', tx('Destination'), 'text', tx('The city, the region and the country')),
      fact('type', tx('Type'), 'text', tx('What it is: hotel, sight, restaurant, hike…')),
      fact('address', tx('Address'), 'text', tx('The full address')),
      fact('bestSeason', tx('When to go'), 'text', tx('The best season to go')),
      fact('budget', tx('Budget'), 'text', tx('Roughly what it costs: a night, a ticket…')),
      fact('access', tx('Getting there'), 'text', tx('How to get there: station, airport, transport')),
    ],
  }),
];

/** A collection's name as two names compare: case and accents aside. */
const nameKey = (title: string): string => title.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * The starters not made yet: by their fixed id, and by their name (a collection restored or made on
 * another device has its own id, and « À lire » twice reads as one).
 */
export function suggestionsFor(lines: readonly { readonly id: string; readonly title: string }[]): SuggestedCollection[] {
  const ids = new Set(lines.map(line => line.id));
  const names = new Set(lines.map(line => nameKey(line.title)));
  return SUGGESTED_COLLECTIONS.filter(suggestion => !ids.has(suggestion.id) && !names.has(nameKey(suggestion.title)));
}

/**
 * The emblem a collection wears: its own choice, else a starter's designed one (they predate
 * emblems on older devices), else one picked from its id: stable everywhere.
 */
export function emblemOf(id: string, chosen: string | null): Emblem {
  if (isEmblem(chosen)) return chosen;
  return SUGGESTED_COLLECTIONS.find(starter => starter.id === id)?.emblem ?? EMBLEMS[cutIndex(id, EMBLEMS.length)]!;
}

/** What a collection draws: "Non classé" is always the tray. */
export function collectionEmblem(id: string, chosen: string | null): CollectionEmblem {
  return id === INBOX_ID ? 'bac' : emblemOf(id, chosen);
}

/** The first emblem no collection shows yet, stored or derived, in order. */
export function nextEmblem(collections: readonly { readonly id: string; readonly emblem: string | null }[]): Emblem {
  const shown = new Set<string>(collections.map(collection => collectionEmblem(collection.id, collection.emblem)));
  return EMBLEMS.find(emblem => !shown.has(emblem)) ?? EMBLEMS[collections.length % EMBLEMS.length]!;
}
