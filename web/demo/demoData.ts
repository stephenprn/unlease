/**
 * The dev demo's notes, lines, links, pages and contacts: synthetic content written in English,
 * whatever the interface's language (it follows the browser, or `?lang=`); people, streets, wines and
 * a few places keep their own names. Written through the library's own door with past times, so cards
 * say they were edited yesterday and lines sort as they would after a few weeks of use. Development only.
 */
import { shiftDay } from '@unlease/core/services/dates';
import { finishStroke, serializeStrokes } from '@unlease/notes/services/drawing';
import { keysBetween } from '@unlease/core/services/fractionalIndex';
import { formatHlc } from '@unlease/core/sync/hlc';
import type { SyncRecord } from '@unlease/core/sync/record';
import { attachmentFields, checkFields, labelFields, linkFields, linkTemplateFields, noteFields } from '@unlease/notes/sync/entities';
import { KIND_TEMPLATES, type TemplateField } from '@unlease/notes/models/templates';
import { kindTemplateId, presetNames, templateSignature } from '@unlease/notes/services/templates';
import { blockFields } from '@unlease/pages/sync/entities';
import { contactFields, contactLabelFields } from '@unlease/contacts/sync/entities';
import { calendarChanges } from './demoCalendar';
import type { BlockKind, BlockTarget, CellValue, TableColumn } from '@unlease/pages/models/blocks';
import type { LineColor, NotePattern } from '@unlease/design/colors';
import type { DrawingInk, DrawingSize, DrawingTool } from '@unlease/notes/models/drawing';
import { DEFAULT_MODULES } from '@unlease/notes/models/modules';
import { PRICE_WATCH } from '@unlease/notes/services/priceWatch';
import { INBOX_ID, type LinkAttribute, type LinkKind, type LinkStatus, type NoteKind } from '@unlease/notes/models/entities';

import type { LocalChange } from '@notes/app/store/library';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface NoteSeed {
  readonly id: string;
  readonly kind: NoteKind;
  readonly title: string;
  readonly body?: string;
  /** The body is formatted lines (`notes/services/noteBody`). */
  readonly rich?: boolean;
  /** A drawing note's strokes (`notes/services/drawing`). */
  readonly drawing?: string;
  readonly color?: LineColor | null;
  readonly pattern?: NotePattern;
  readonly labels?: readonly string[];
  readonly pinned?: boolean;
  readonly archived?: boolean;
  readonly trashedAgo?: number;
  readonly reminder?: (now: number) => number;
  readonly ago: number;
  readonly checks?: readonly (readonly [string, boolean])[];
  readonly photo?: string;
  readonly code?: string;
  readonly hint?: string;
  /** The contacts it is about (`contactIds`). */
  readonly people?: readonly string[];
  /** A collection's link modules, when it picked them (`modules`). */
  readonly modules?: readonly string[];
  /** A collection's template of the person's own (`templateId`). */
  readonly templateId?: string;
}

interface LinkSeed {
  readonly line: string;
  readonly url: string;
  readonly ago: number;
  readonly title?: string;
  readonly kind?: LinkKind;
  readonly siteName?: string;
  readonly summary?: string;
  readonly price?: number;
  /** « Suivi des prix »: the price before it last moved, and how long ago (`priceBefore`, `priceChangedAt`). */
  readonly priceBefore?: number;
  readonly priceChangedAgo?: number;
  /** When the watch last read the price, when it did and the price never moved (`priceCheckedAt`). */
  readonly priceCheckedAgo?: number;
  readonly attributes?: readonly LinkAttribute[];
  readonly images?: readonly string[];
  readonly status?: LinkStatus;
  readonly error?: string;
  readonly doneAgo?: number;
  readonly comment?: string;
  /** The contacts it is for (`contactIds`): a gift idea's. */
  readonly people?: readonly string[];
  /** The template version it was read with (`readWith`, the server's); none: read before templates. */
  readonly readWith?: string;
}

/**
 * « Ce que Claude relève »: "Wines" notes its own facts on its links (a list named "Wine"), and the
 * recipe kind's usual facts are changed ("Vegetarian" added), so the overview shows « Modifiées » and
 * the recipe kept in « Non classé », noted with the preset, offers « Relever à nouveau ». Stored in
 * English, as the demo's readings.
 */
export const DEMO_WINE_TEMPLATE = 'demo-template-vin';
const field = (id: string, name: string, type: TemplateField['type'], hint = ''): TemplateField => ({ id, name, type, hint });
const WINE_FIELDS: readonly TemplateField[] = [
  field('domaine', 'Estate', 'text', 'The estate or château that makes it'),
  field('millesime', 'Vintage', 'number', 'The vintage year'),
  field('cepages', 'Grapes', 'list'),
  field('region', 'Region', 'text', 'The appellation, or the region'),
  field('accords', 'Pairings', 'text', 'The dishes to serve it with'),
];
/** The recipe kind's preset fields as an English speaker keeps them, by id (written out: `tools/demo/seed-server.ts` runs without the dictionary). */
const RECIPE_ENGLISH: Readonly<Record<string, readonly [name: string, hint: string]>> = {
  totalTime: ['Total time', 'Preparation and cooking included'],
  servings: ['Servings', 'For how many people, or how many pieces'],
  difficulty: ['Difficulty', 'Easy, medium or hard'],
};
const RECIPE_FIELDS: readonly TemplateField[] = [
  ...KIND_TEMPLATES.recipe.map(preset => field(preset.id, RECIPE_ENGLISH[preset.id]?.[0] ?? presetNames(preset).en, preset.type, RECIPE_ENGLISH[preset.id]?.[1] ?? preset.hint)),
  field('vegetarien', 'Vegetarian', 'yesno', 'No meat or fish'),
];
const WINE_READ = templateSignature(WINE_FIELDS);

const LABELS = [
  { id: 'demo-label-perso', name: 'Personal', color: 'blue' as const },
  { id: 'demo-label-travail', name: 'Work', color: 'orange' as const },
  { id: 'demo-label-maison', name: 'Home', color: 'green' as const },
  { id: 'demo-label-idees', name: 'Ideas', color: 'lilac' as const },
];

const at = (now: number, days: number, hour: number, minute = 0): number => {
  const date = new Date(now + days * DAY);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
};

/** A hand's wobble, the same on every run. */
function wobble(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648 - 0.5;
  };
}

type Pen = readonly [tool: DrawingTool, size: DrawingSize, ink: DrawingInk];

/** Strokes drawn by hand from shapes: each list of points traced with a little wobble. */
function sketch(seed: number, lines: readonly (readonly [Pen, readonly (readonly [number, number])[]])[]): string {
  const shake = wobble(seed);
  return serializeStrokes(
    lines.flatMap(([[tool, size, ink], points], index) => {
      const traced: number[] = [];
      points.forEach(([x, y], at) => {
        const next = points[at + 1];
        const steps = next ? Math.max(1, Math.round(Math.hypot(next[0] - x, next[1] - y) / 14)) : 1;
        for (let step = 0; step < steps; step += 1) {
          const t = step / steps;
          traced.push(x + (next ? (next[0] - x) * t : 0) + shake() * 3, y + (next ? (next[1] - y) * t : 0) + shake() * 3);
        }
      });
      const stroke = finishStroke(`000000${String(index).padStart(3, '0')}demo`, tool, size, ink, traced);
      return stroke ? [stroke] : [];
    }),
  );
}

const ring = (cx: number, cy: number, r: number, from = 0, to = 360): [number, number][] =>
  Array.from({ length: 25 }, (_, k) => {
    const angle = ((from + ((to - from) * k) / 24) * Math.PI) / 180;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });

/** "Vegetable garden plan": beds, a path, the sun and where the water is. */
const GARDEN = sketch(7, [
  [['pen', 1, 'ink'], [[90, 140], [470, 130], [480, 420], [95, 430], [90, 140]]],
  [['pen', 1, 'ink'], [[560, 150], [910, 140], [905, 430], [555, 420], [560, 150]]],
  [['marker', 1, 'brown'], [[120, 560], [300, 520], [520, 560], [720, 520], [900, 560]]],
  [['marker', 0, 'green'], [[140, 200], [180, 170], [220, 205], [260, 170], [300, 205], [340, 170], [380, 205], [420, 175]]],
  [['marker', 0, 'green'], [[140, 300], [180, 270], [220, 305], [260, 270], [300, 305], [340, 270], [380, 305], [420, 275]]],
  [['pen', 2, 'red'], ring(640, 230, 26)],
  [['pen', 2, 'red'], ring(740, 260, 26)],
  [['pen', 2, 'red'], ring(820, 210, 26)],
  [['pen', 2, 'red'], ring(690, 340, 26)],
  [['marker', 1, 'yellow'], ring(860, 620, 48)],
  [['pen', 1, 'yellow'], [[860, 548], [860, 520]]],
  [['pen', 1, 'yellow'], [[932, 620], [962, 620]]],
  [['pen', 1, 'yellow'], [[910, 570], [935, 548]]],
  [['highlighter', 1, 'sky'], [[150, 660], [420, 660]]],
  [['pen', 0, 'blue'], [[170, 650], [200, 640], [230, 655], [260, 640], [290, 655], [320, 640], [350, 655], [380, 642]]],
]);

/** The route from the hotel to the river, drawn in the Lisbon page. */
const ROUTE = sketch(11, [
  [['marker', 2, 'blue'], [[40, 600], [260, 560], [520, 610], [760, 560], [980, 600]]],
  [['pen', 1, 'ink'], [[120, 120], [180, 520]]],
  [['pen', 1, 'ink'], [[60, 300], [900, 260]]],
  [['pen', 1, 'ink'], [[520, 90], [560, 540]]],
  [['pen', 1, 'ink'], [[300, 120], [860, 140]]],
  [['highlighter', 2, 'yellow'], [[180, 300], [540, 285], [555, 520]]],
  [['pen', 2, 'red'], [[170, 270], [185, 300], [215, 305], [192, 325], [200, 355], [172, 340], [146, 357], [152, 326], [128, 306], [158, 300], [170, 270]]],
  [['pen', 2, 'green'], ring(560, 520, 30)],
]);

/** Board order, first to last. */
const NOTES: readonly NoteSeed[] = [
  { id: 'demo-portail', kind: 'text', title: 'Gate code', body: 'Gate: 4512B\nIntercom: Martin, 3rd floor left', labels: ['demo-label-perso'], pinned: true, ago: 2 * DAY },
  {
    id: 'demo-courses',
    kind: 'checklist',
    title: 'Saturday shopping',
    labels: ['demo-label-maison'],
    pinned: true,
    ago: 3 * DAY,
    checks: [
      ['Oat milk', false],
      ['Rye bread', false],
      ['Cherry tomatoes', false],
      ['Parmesan', false],
      ['Coffee beans', false],
      ['Lemons', false],
      ['Eggs', true],
      ['Salted butter', true],
    ],
  },
  { id: 'line-films', kind: 'links', title: 'Films & series', code: 'F', color: 'violet', hint: 'Films and series to watch, at the cinema or streaming.', pinned: true, ago: 35 * DAY },
  { id: 'demo-resto', kind: 'text', title: 'Léa’s birthday', rich: true, body: 'Book a table for six on Saturday evening, around Oberkampf. Ask {@contact=demo-contact-lea} whether she’d like Italian or Lebanese.', color: 'orange', people: ['demo-contact-lea'], reminder: now => at(now, 1, 18), ago: 40 * MINUTE },
  { id: 'demo-garage', kind: 'text', title: 'Call the garage', body: 'Car inspection before the 30th. Ask whether they change the oil too.', reminder: now => at(now, 1, 9), ago: 5 * HOUR },
  { id: 'demo-mutuelle', kind: 'text', title: 'Send back the health insurance form', body: 'Signed, with the bank details. The envelope is in the hall.', reminder: now => at(now, -1, 18), ago: 4 * DAY },
  {
    id: 'demo-lyon',
    kind: 'text',
    title: 'Weekend in Lyon',
    rich: true,
    body: '# Saturday\nArrive at {b:10:12}, Part-Dieu station.\nLunch at {i:Café des Fédérations}, the table is booked.\n## Sunday\nQuai Saint-Antoine market, then {u:Fourvière hill} on foot.\n### Don’t forget\nThe {b:return tickets} and the charger.',
    color: 'sky',
    labels: ['demo-label-perso'],
    ago: 3 * HOUR,
  },
  {
    id: 'demo-cadeaux',
    kind: 'checklist',
    title: 'Gift ideas for Mum',
    color: 'lilac',
    labels: ['demo-label-idees'],
    ago: 1 * DAY,
    checks: [
      ['A ceramics workshop', false],
      ['A wool throw', false],
      ['A photo book of gardens', false],
      ['A day at the spa', true],
    ],
  },
  {
    id: 'demo-rive',
    kind: 'text',
    title: 'Rive project meeting',
    body: 'To cover:\n- last quarter’s budget\n- the delivery schedule\n- who takes over the client file in January?',
    labels: ['demo-label-travail'],
    reminder: now => at(now, 2, 9, 30),
    ago: 6 * DAY,
  },
  { id: 'demo-potager', kind: 'drawing', title: 'Vegetable garden plan', drawing: GARDEN, pattern: 'grid', labels: ['demo-label-maison'], ago: 7 * HOUR },
  { id: 'demo-balcon', kind: 'text', title: 'Balcony plan', body: 'Star jasmine along the wall, three pots of basil, cherry tomatoes if the sun is enough.', color: 'green', photo: 'demo-balcony', ago: 5 * DAY },
  {
    id: 'demo-crepes',
    kind: 'text',
    title: 'Crêpe batter',
    body: '250 g flour\n4 eggs\n500 ml milk\n1 pinch of salt\n2 tablespoons sugar\n50 g melted butter\n\nMix the flour and the eggs, then whisk in the milk a little at a time. Leave to rest for an hour. Cook over a medium heat, one ladle per crêpe, turning as soon as the edges turn golden.',
    color: 'yellow',
    labels: ['demo-label-maison'],
    ago: 12 * DAY,
  },
  {
    id: 'demo-valise',
    kind: 'checklist',
    title: 'Lisbon packing',
    color: 'sky',
    labels: ['demo-label-perso'],
    ago: 20 * DAY,
    checks: [
      ['Passport', false],
      ['Adapter', false],
      ['Swimsuit', false],
      ['Sunscreen', false],
      ['Charger', false],
      ['Sunglasses', false],
      ['Notebook', false],
      ['Printed tickets', true],
      ['Hotel booking', true],
    ],
  },
  { id: 'demo-citation', kind: 'text', title: '', body: '“We don’t lack time; time lacks us.”\nTo look up: who wrote it?', labels: ['demo-label-idees'], ago: 30 * DAY },
  { id: 'demo-velo', kind: 'text', title: 'Bike', body: 'Rear tyre to replace, 700×28. Keep the spare inner tube.', ago: 26 * DAY },
  // « Suivi des prix » switched on, with the defaults: its products' prices are read each day.
  { id: 'line-mode', kind: 'links', title: 'Fashion', code: 'F', color: 'magenta', hint: 'Clothes, shoes and accessories to buy.', modules: [...DEFAULT_MODULES, PRICE_WATCH], ago: 35 * DAY },
  { id: 'line-restos', kind: 'links', title: 'Restaurants', code: 'R', color: 'orange', hint: 'Restaurants, cafés and bars to try.', ago: 35 * DAY },
  { id: 'line-lire', kind: 'links', title: 'To read', code: 'T', color: 'blue', hint: 'Articles, essays and books to read.', ago: 35 * DAY },
  { id: 'line-maison', kind: 'links', title: 'Home', code: 'H', color: 'green', hint: 'Furniture, decor and things for the home.', modules: [...DEFAULT_MODULES, PRICE_WATCH], ago: 35 * DAY },
  { id: 'line-voyages', kind: 'links', title: 'Travel', code: 'T', color: 'sky', hint: 'Places, hotels and travel ideas.', ago: 35 * DAY },
  { id: 'line-cadeaux', kind: 'links', title: 'Gifts', code: 'G', color: 'red', hint: 'Gift ideas for the people close to you, kept from Contacts.', ago: 30 * DAY },
  { id: 'line-vins', kind: 'links', title: 'Wines', code: 'W', color: 'lilac', hint: 'Bottles to taste, give or buy again.', templateId: DEMO_WINE_TEMPLATE, ago: 20 * DAY },
  { id: 'demo-wifi', kind: 'text', title: 'Old wifi', body: 'Network: Home-5G\nTo delete from the router.', archived: true, ago: 60 * DAY },
  { id: 'demo-brouillon', kind: 'text', title: 'Draft letter', body: 'Dear Sir or Madam, I am writing to…', trashedAgo: 2 * DAY, ago: 9 * DAY },
];

/** Each line's links, first to last. */
const LINKS: readonly LinkSeed[] = [
  {
    line: 'line-vins',
    url: 'https://www.hillside-cellar.example/wines/saumur-champigny-les-terres-rouges-2020',
    ago: 6 * DAY,
    title: 'Saumur-Champigny Les Terres rouges 2020',
    kind: 'product',
    siteName: 'Hillside Cellar',
    summary: 'A supple, fruity Loire red, aged in vats, to drink cool within three years.',
    price: 14.5,
    attributes: [
      { label: 'Estate', value: 'Domaine des Varinelles' },
      { label: 'Vintage', value: '2020' },
      { label: 'Grapes', value: 'Cabernet franc' },
      { label: 'Region', value: 'Saumur-Champigny, Loire' },
      { label: 'Pairings', value: 'Charcuterie, roast poultry' },
    ],
    readWith: WINE_READ,
  },
  {
    line: 'line-vins',
    url: 'https://www.hillside-cellar.example/wines/chablis-premier-cru-montmains-2021',
    ago: 12 * DAY,
    title: 'Chablis premier cru Montmains 2021',
    kind: 'product',
    siteName: 'Hillside Cellar',
    summary: 'A taut, mineral white Burgundy with notes of citrus.',
    price: 27,
    attributes: [
      { label: 'Estate', value: 'Domaine Laroche' },
      { label: 'Vintage', value: '2021' },
      { label: 'Grapes', value: 'Chardonnay' },
      { label: 'Region', value: 'Chablis, Burgundy' },
      { label: 'Pairings', value: 'Oysters, grilled fish' },
    ],
    readWith: WINE_READ,
    comment: 'For New Year’s Eve.',
  },
  {
    line: 'line-cadeaux',
    url: 'https://www.garden-books.example/gardens-of-light',
    ago: 2 * DAY,
    title: 'Gardens of Light',
    kind: 'book',
    siteName: 'Garden Books',
    summary: 'A beautiful photo book: fifty European gardens through the seasons.',
    price: 45,
    attributes: [{ label: 'Author', value: 'Claire Dumas' }],
    people: ['demo-contact-lea'],
  },
  {
    line: 'line-cadeaux',
    url: 'https://www.northside-atelier.example/engraved-leather-notebook',
    ago: 5 * DAY,
    title: 'Engraved leather notebook',
    kind: 'product',
    siteName: 'Northside Atelier',
    price: 32,
    attributes: [{ label: 'Material', value: 'Vegan leather' }],
    people: ['demo-contact-noah', 'demo-contact-sarah'],
  },
  {
    line: 'line-mode',
    url: 'https://www.slow-loom.example/linen-shirt',
    ago: 3 * MINUTE,
    status: 'pending',
  },
  {
    line: 'line-mode',
    url: 'https://www.northside-atelier.example/boiled-wool-jacket',
    ago: 2 * DAY,
    title: 'Boiled wool jacket',
    kind: 'product',
    siteName: 'Northside Atelier',
    summary: 'A straight boiled-wool jacket, cotton lining, two patch pockets. A slightly loose cut: take your usual size.',
    price: 189,
    priceBefore: 215,
    priceChangedAgo: 1 * DAY,
    attributes: [
      { label: 'Colour', value: 'Camel' },
      { label: 'Material', value: 'Boiled wool' },
      { label: 'Sizes', value: 'S to XL' },
    ],
    images: ['demo-jacket'],
    comment: 'Size M. See it in the shop first.',
  },
  {
    line: 'line-mode',
    url: 'https://www.side-step.example/white-leather-sneakers',
    ago: 4 * DAY,
    title: 'White leather sneakers',
    kind: 'product',
    siteName: 'Side Step',
    summary: 'Low-top full-grain leather sneakers with a stitched sole, made in Portugal.',
    price: 129,
    priceCheckedAgo: 5 * HOUR,
    attributes: [{ label: 'Shoe size', value: '42' }],
    images: ['demo-sneakers'],
  },
  {
    line: 'line-mode',
    url: 'https://closed-shop.example/tote-bag',
    ago: 6 * DAY,
    status: 'failed',
    // The server's own sentence, stored in French as the real server writes it: the apps show it in their language (`t`).
    error: 'Page protégée contre les robots',
  },
  {
    line: 'line-mode',
    url: 'https://www.knit-and-purl.example/merino-roll-neck',
    ago: 8 * DAY,
    title: 'Merino roll-neck jumper',
    kind: 'product',
    siteName: 'Knit & Purl',
    summary: 'A fine extra-fine merino roll-neck jumper, worn on its own or under a jacket.',
    price: 89.9,
    attributes: [{ label: 'Colour', value: 'Navy' }],
    images: ['demo-sweater'],
  },
  {
    line: 'line-mode',
    url: 'https://www.northside-atelier.example/cashmere-scarf',
    ago: 15 * DAY,
    title: 'Cashmere scarf',
    kind: 'product',
    siteName: 'Northside Atelier',
    price: 75,
    attributes: [{ label: 'Colour', value: 'Burgundy' }],
    images: ['demo-scarf'],
    doneAgo: 9 * DAY,
  },
  {
    line: 'line-films',
    url: 'https://www.lumiere-cinema.example/films/september-fires',
    ago: 1 * DAY,
    title: 'September Fires',
    kind: 'film',
    siteName: 'Lumière Cinema',
    summary: 'In a village in Provence, a summer of wildfires brings two estranged brothers back together. A luminous drama, carried by its two leads.',
    attributes: [
      { label: 'Running time', value: '1h 52m' },
      { label: 'Genre', value: 'Drama' },
    ],
    images: ['demo-poster1'],
  },
  {
    line: 'line-films',
    url: 'https://www.evening-screens.example/series/station-north',
    ago: 3 * DAY,
    title: 'Station North, season 2',
    kind: 'series',
    siteName: 'Evening Screens',
    summary: 'A thriller on an Arctic research base. The second season follows the polar winter.',
    attributes: [{ label: 'Episodes', value: '8' }],
    images: ['demo-poster2'],
  },
  {
    line: 'line-films',
    url: 'https://www.lumiere-cinema.example/films/the-last-platform',
    ago: 18 * DAY,
    title: 'The Last Platform',
    kind: 'film',
    siteName: 'Lumière Cinema',
    images: ['demo-poster4'],
    doneAgo: 11 * DAY,
  },
  {
    line: 'line-restos',
    url: 'https://www.the-market-counter.example',
    ago: 2 * DAY,
    title: 'The Market Counter',
    kind: 'restaurant',
    siteName: 'The Market Counter',
    summary: 'Neighbourhood bistro, market cooking, a menu board that changes every day.',
    attributes: [
      { label: 'Cuisine', value: 'Bistro' },
      { label: 'Neighbourhood', value: 'Châtelet' },
      { label: 'Price', value: '€25 to €40 a head' },
    ],
    images: ['demo-plate'],
  },
  {
    line: 'line-restos',
    url: 'https://www.mezze-and-co.example',
    ago: 9 * DAY,
    title: 'Mezze & Co',
    kind: 'restaurant',
    siteName: 'Mezze & Co',
    attributes: [{ label: 'Cuisine', value: 'Lebanese' }],
    images: ['demo-mezze'],
  },
  {
    line: 'line-lire',
    url: 'https://www.urban-review.example/why-cities-are-slowing-down',
    ago: 4 * DAY,
    title: 'Why cities are slowing down',
    kind: 'article',
    siteName: 'The Urban Review',
    summary: '30 km/h zones, school streets, squares given back to pedestrians: an inquiry into ten years of slower cities.',
    attributes: [{ label: 'Reading time', value: '12 min' }],
    images: ['demo-article'],
  },
  {
    line: 'line-maison',
    url: 'https://www.clair-home.example/adjustable-desk-lamp',
    ago: 7 * DAY,
    title: 'Adjustable desk lamp',
    kind: 'product',
    siteName: 'Clair Home',
    price: 64,
    priceBefore: 59,
    priceChangedAgo: 3 * DAY,
    attributes: [{ label: 'Colour', value: 'Mustard yellow' }],
    images: ['demo-lamp'],
  },
  {
    line: 'line-voyages',
    url: 'https://www.lakeside-cottages.example/annecy-lakeside',
    ago: 10 * DAY,
    title: 'Cottage on Lake Annecy',
    kind: 'place',
    siteName: 'Lakeside Cottages',
    price: 145,
    attributes: [{ label: 'Capacity', value: '4 people' }],
    images: ['demo-lake'],
  },
  {
    line: INBOX_ID,
    url: 'https://www.travel-notes.example/three-days-in-porto',
    ago: 5 * HOUR,
    title: 'Three days in Porto, a travel journal',
    kind: 'article',
    siteName: 'Travel Notes',
  },
  {
    // Saved while reading was off: kept plain until someone asks for it to be read.
    line: INBOX_ID,
    url: 'https://www.knit-and-purl.example/fisherman-rib-beanie',
    ago: 2 * DAY,
    status: 'skipped',
  },
  {
    // The same evening: two kept unread, so the collection offers to read them all.
    line: INBOX_ID,
    url: 'https://www.urban-review.example/the-return-of-trams',
    ago: 2 * DAY + 20 * MINUTE,
    status: 'skipped',
  },
  {
    line: INBOX_ID,
    url: 'https://www.todays-kitchen.example/recipes/thin-apple-tart',
    ago: 3 * DAY,
    title: 'Thin apple tart',
    kind: 'recipe',
    siteName: 'Today’s Kitchen',
    summary: 'Puff pastry, four thinly sliced apples, butter and sugar: ready in forty minutes.',
    attributes: [
      { label: 'Total time', value: '40 min' },
      { label: 'Servings', value: '6' },
    ],
  },
];


interface BlockSeed {
  readonly kind: BlockKind;
  /** Rich text markup (`core/services/richText`), a code block's source, a page's title; or markup made from the demo's day (a date close to it). */
  readonly text?: string | ((now: number) => string);
  readonly checked?: boolean;
  readonly language?: string;
  readonly icon?: string;
  readonly color?: LineColor;
  readonly columns?: readonly TableColumn[];
  readonly cells?: Readonly<Record<string, CellValue>>;
  readonly target?: BlockTarget;
  readonly caption?: string;
  /** A drawing block's strokes. */
  readonly drawing?: string;
  readonly children?: readonly BlockSeed[];
  /** A page's own id, so pages can point at each other. */
  readonly id?: string;
  readonly ago?: number;
}

const row = (cells: Readonly<Record<string, CellValue>>): BlockSeed => ({ kind: 'row', cells });

const BUDGET: TableColumn[] = [
  { id: 'poste', name: 'Item', type: 'text', width: 220 },
  { id: 'montant', name: 'Amount', type: 'number', unit: '€', width: 120 },
  { id: 'paye', name: 'Paid', type: 'checkbox', width: 90 },
  {
    id: 'categorie',
    name: 'Category',
    type: 'select',
    width: 150,
    options: [
      { id: 'transport', name: 'Transport', color: 'blue' },
      { id: 'logement', name: 'Lodging', color: 'lilac' },
      { id: 'sorties', name: 'Outings', color: 'orange' },
    ],
  },
  { id: 'date', name: 'Date', type: 'date', width: 140 },
];

const LECTURES: TableColumn[] = [
  { id: 'titre', name: 'Title', type: 'text', width: 220 },
  { id: 'auteur', name: 'Author', type: 'text', width: 150 },
  { id: 'note', name: 'Rating', type: 'number', unit: '/5', width: 90 },
  { id: 'lu', name: 'Read', type: 'checkbox', width: 70 },
  {
    id: 'genre',
    name: 'Genre',
    type: 'select',
    width: 120,
    options: [
      { id: 'roman', name: 'Novel', color: 'pink' },
      { id: 'essai', name: 'Essay', color: 'blue' },
      { id: 'bd', name: 'Comics', color: 'green' },
    ],
  },
  {
    id: 'themes',
    name: 'Themes',
    type: 'multi',
    width: 170,
    options: [
      { id: 'mer', name: 'Sea', color: 'sky' },
      { id: 'famille', name: 'Family', color: 'lilac' },
      { id: 'ville', name: 'City', color: 'ochre' },
    ],
  },
  { id: 'fini', name: 'Finished on', type: 'date', width: 140 },
  { id: 'lien', name: 'Link', type: 'url', width: 200 },
];

const PROPORTIONS: TableColumn[] = [
  { id: 'ingredient', name: 'Ingredient', type: 'text', width: 200 },
  { id: 'quantite', name: 'Quantity', type: 'number', unit: 'g', width: 120 },
  { id: 'bio', name: 'Organic', type: 'checkbox', width: 80 },
];

/** A day of the Lisbon trip, counted from its Thursday six or seven weeks after the demo's day: ahead of it, and the days the page's words name. */
function tripDay(now: number, fromThursday: number): string {
  const ahead = new Date(now);
  ahead.setDate(ahead.getDate() + 42);
  return shiftDay(ahead.getTime(), ((4 - ahead.getDay() + 7) % 7) + fromThursday);
}

/** The top-level pages, first to last, with what each holds (sub-pages among it). */
const PAGES: readonly BlockSeed[] = [
  {
    id: 'demo-page-lisbonne',
    kind: 'page',
    text: 'Trip to Lisbon',
    icon: '✈️',
    ago: 2 * DAY,
    children: [
      { kind: 'text', text: 'Four days, {b:Thursday} to {b:Sunday}. The hotel is booked near the {a=https\\://en.wikipedia.org/wiki/Alfama:Alfama district}. {@contact=demo-contact-lea} lived there: ask her for her cafés.' },
      { kind: 'callout', icon: '💡', color: 'yellow', text: 'Take {b:tram 28} early in the morning: after 10am it’s packed.' },
      { kind: 'toc' },
      { kind: 'h2', text: 'Getting ready' },
      { kind: 'todo', text: 'Book the hotel', checked: true },
      { kind: 'todo', text: 'Buy the plane tickets', checked: true },
      { kind: 'todo', text: 'Print the boarding passes' },
      { kind: 'todo', text: now => `Tell the bank: {@date=${shiftDay(now, 1)}}` },
      { kind: 'todo', text: now => `Online check-in: {@date=${tripDay(now, -1)}}` },
      { kind: 'text', text: now => `Leaving {@date=${tripDay(now, 0)}T0715} from Orly, back {@date=${tripDay(now, 3)}}.` },
      { kind: 'text', text: 'The packing list is in {@note=demo-valise}, and ideas for outings in {@note=line-voyages}.' },
      { kind: 'h2', text: 'Budget' },
      {
        kind: 'table',
        columns: BUDGET,
        children: [
          row({ poste: 'Return flights', montant: 186, paye: true, categorie: 'transport', date: '2026-03-02' }),
          row({ poste: 'Hotel, three nights', montant: 342, paye: true, categorie: 'logement', date: '2026-03-04' }),
          row({ poste: 'Azulejo Museum', montant: 10, paye: false, categorie: 'sorties' }),
          row({ poste: 'Fado dinner', montant: 70, paye: false, categorie: 'sorties' }),
        ],
      },
      { kind: 'h2', text: 'Itinerary' },
      { kind: 'drawing', drawing: ROUTE, caption: 'From the hotel to the Tagus, through the Baixa.' },
      {
        kind: 'columns',
        children: [
          { kind: 'column', children: [{ kind: 'h3', text: 'Thursday' }, { kind: 'bullet', text: 'Arrive around 11am' }, { kind: 'bullet', text: 'Alfama and the Santa Luzia {i:miradouro}' }, { kind: 'bullet', text: 'Fado dinner' }] },
          { kind: 'column', children: [{ kind: 'h3', text: 'Friday' }, { kind: 'bullet', text: 'Belém: the monastery, then pastéis' }, { kind: 'bullet', text: 'LX Factory in the evening' }] },
        ],
      },
      { kind: 'toggle', text: 'Useful addresses', children: [{ kind: 'text', text: 'Pharmacy: Rua Augusta, 98' }, { kind: 'text', text: 'Consulate: Rua de São Domingos à Lapa, 2' }] },
      { kind: 'h3', text: 'For the rest of the trip' },
      { kind: 'bookmark', target: { type: 'link', id: 'demo-link-inbox-0' }, caption: 'To read before the train to Porto.' },
      {
        id: 'demo-page-restos',
        kind: 'page',
        text: 'Restaurants to try',
        icon: '🍽️',
        children: [
          { kind: 'text', text: 'What Claude filed in {@note=line-restos}, to keep at hand:' },
          { kind: 'embed', target: { type: 'note', id: 'line-restos' } },
          { kind: 'h3', text: 'Not to miss' },
          { kind: 'numbered', text: 'Pastéis de Belém' },
          { kind: 'numbered', text: 'Cervejaria Ramiro, for the prawns' },
        ],
      },
    ],
  },
  {
    id: 'demo-page-recettes',
    kind: 'page',
    text: 'Recipes',
    icon: '🍳',
    ago: 12 * DAY,
    children: [
      { kind: 'text', text: 'Tried and approved recipes. Each has its own page; the shopping is in {@note=demo-courses}. The crêpe batter comes from {@contact=demo-contact-paul}.' },
      {
        id: 'demo-page-crepes',
        kind: 'page',
        text: 'Crêpe batter',
        icon: '🥞',
        children: [
          { kind: 'embed', target: { type: 'note', id: 'demo-crepes' } },
          { kind: 'callout', icon: '🔥', color: 'orange', text: 'Let the batter rest {b:an hour}: it will only be better for it.' },
        ],
      },
      {
        id: 'demo-page-levain',
        kind: 'page',
        text: 'Sourdough bread',
        icon: '🍞',
        children: [
          { kind: 'h2', text: 'Steps' },
          { kind: 'numbered', text: 'Refresh the starter the night before' },
          { kind: 'numbered', text: 'Mix the flour and water, rest for an hour ({i:autolyse})' },
          { kind: 'numbered', text: 'Add the starter and the salt, knead for ten minutes' },
          { kind: 'numbered', text: 'Bulk rise: four hours, with a fold every 30 minutes' },
          { kind: 'numbered', text: 'Shape, then a night in the fridge' },
          { kind: 'numbered', text: 'Bake 20 minutes at 250 °C covered, then 25 minutes uncovered' },
          { kind: 'toggle', text: 'If the dough doesn’t rise', children: [{ kind: 'bullet', text: 'Check that the starter doubles in six hours' }, { kind: 'bullet', text: 'Let the bulk rise run an hour longer' }] },
          { kind: 'h2', text: 'Proportions' },
          {
            kind: 'table',
            columns: PROPORTIONS,
            children: [row({ ingredient: 'T80 flour', quantite: 500, bio: true }), row({ ingredient: 'Water', quantite: 350, bio: false }), row({ ingredient: 'Starter', quantite: 100, bio: true }), row({ ingredient: 'Salt', quantite: 10, bio: false })],
          },
          // Three levels further down: a deep breadcrumb, folded on a narrow window.
          {
            id: 'demo-page-levain-maison',
            kind: 'page',
            text: 'A homemade sourdough starter, from the first day to its upkeep',
            icon: '🫙',
            children: [
              { kind: 'text', text: 'Rye flour and water in equal parts, five days running, somewhere warm.' },
              {
                id: 'demo-page-levain-nourrir',
                kind: 'page',
                text: 'Feed the starter every week',
                icon: '🥄',
                children: [
                  { kind: 'text', text: 'A spoonful of starter, 50 g flour, 50 g warm water.' },
                  {
                    id: 'demo-page-levain-calendrier',
                    kind: 'page',
                    text: 'Feeding schedule',
                    icon: '📅',
                    children: [
                      { kind: 'text', text: 'On Sunday evening, before it goes back in the fridge.' },
                      { kind: 'text', text: 'On Friday morning when a bake is planned for Saturday.' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'demo-page-technique',
    kind: 'page',
    text: 'Tech notes',
    icon: '💻',
    ago: 5 * DAY,
    children: [
      { kind: 'text', text: 'What I often need on the home server.' },
      { kind: 'h2', text: 'Backup' },
      { kind: 'code', language: 'bash', text: 'rsync -avh --delete ~/Documents/ /mnt/backup/documents/\n\n# every night at 2am\n0 2 * * * /usr/local/bin/backup.sh', caption: 'The cron line goes in crontab -e, on the server.' },
      { kind: 'h2', text: 'Small scripts' },
      { kind: 'code', language: 'typescript', text: "type Note = { title: string; tags: string[] };\n\nexport function byTag(notes: Note[], tag: string): Note[] {\n  return notes.filter(note => note.tags.includes(tag));\n}" },
      { kind: 'code', language: 'python', text: "from pathlib import Path\n\n\ndef size(folder: str) -> int:\n    \"\"\"Bytes a folder takes up.\"\"\"\n    return sum(f.stat().st_size for f in Path(folder).rglob('*') if f.is_file())" },
      { kind: 'text', text: 'The default port is {c:8080}; change it in the {c:.env} file.' },
      { kind: 'callout', icon: '⚠️', color: 'red', text: 'Never put the token in a repository.' },
      { kind: 'h3', text: 'In the pages' },
      { kind: 'bullet', text: '{b:/} opens the block menu, {b:@} cites a note, a collection, a link or a page' },
      { kind: 'bullet', text: '{i:Esc} selects the block; {b:Ctrl+Shift+↑} moves it up' },
      { kind: 'bullet', text: 'Some {fg=blue:blue text}, some {bg=yellow:highlighting} and some {s:strikethrough}' },
      { kind: 'bullet', text: '{k:Ctrl+K} links the chosen words, {k:[[} cites a page and {k::} followed by a word offers its emoji' },
    ],
  },
  {
    id: 'demo-page-lectures',
    kind: 'page',
    text: 'Reading in 2026',
    icon: '📚',
    ago: 20 * DAY,
    children: [
      { kind: 'text', text: 'What I’m reading this year, and what I made of it.' },
      {
        kind: 'table',
        columns: LECTURES,
        children: [
          row({ titre: 'The Night of the Lighthouses', auteur: 'Inès Garnier', note: 4, lu: true, genre: 'roman', themes: ['mer', 'famille'], fini: '2026-02-11', lien: '' }),
          row({ titre: 'Why cities are slowing down', auteur: 'The Urban Review', note: 3.5, lu: true, genre: 'essai', themes: ['ville'], fini: '2026-03-20', lien: 'https://www.urban-review.example/why-cities-are-slowing-down' }),
          row({ titre: 'Station North', auteur: '', note: null, lu: false, genre: 'bd', themes: ['mer'], fini: '', lien: '' }),
        ],
      },
      { kind: 'h2', text: 'Read next' },
      { kind: 'embed', target: { type: 'note', id: 'line-lire' } },
      { kind: 'text', text: 'See also {@page=demo-page-technique}.' },
    ],
  },
];
// ── Contacts ────────────────────────────────────────────────────────────────

const CONTACT_LABELS = [
  { id: 'demo-clabel-famille', name: 'Family', color: 'red' as const },
  { id: 'demo-clabel-travail', name: 'Work', color: 'blue' as const },
  { id: 'demo-clabel-escalade', name: 'Climbing', color: 'green' as const },
  { id: 'demo-clabel-voisins', name: 'Neighbours', color: 'ochre' as const },
];

interface ContactSeed {
  readonly id: string;
  readonly first: string;
  readonly last: string;
  readonly company?: string;
  readonly job?: string;
  readonly phones?: readonly (readonly [string, string])[];
  readonly emails?: readonly (readonly [string, string])[];
  readonly address?: { readonly kind: string; readonly street: string; readonly postalCode: string; readonly city: string; readonly country: string };
  /** `YYYY-MM-DD`, `--MM-DD`, or days from today (a birthday soon, its year given). */
  readonly birthday?: string | { readonly inDays: number; readonly year: number | null };
  readonly labels?: readonly string[];
  readonly favorite?: boolean;
  readonly photo?: string;
  readonly note?: string;
  readonly ago: number;
  readonly trashedAgo?: number;
}

const CONTACTS: readonly ContactSeed[] = [
  { id: 'demo-contact-lea', first: 'Léa', last: 'Martin', phones: [['06 12 34 56 78', 'mobile']], emails: [['lea.martin@example.org', 'home']], birthday: { inDays: 3, year: 1991 }, labels: ['demo-clabel-famille'], favorite: true, photo: 'demo-portrait-1', note: 'Allergic to nuts. Prefers calls in the evening.', ago: 40 * DAY },
  { id: 'demo-contact-paul', first: 'Paul', last: 'Martin', phones: [['06 98 76 54 32', 'mobile'], ['04 78 12 34 56', 'home']], address: { kind: 'home', street: '12 rue des Lilas', postalCode: '69003', city: 'Lyon', country: 'France' }, birthday: '1962-11-28', labels: ['demo-clabel-famille'], favorite: true, ago: 40 * DAY },
  { id: 'demo-contact-camille', first: 'Camille', last: 'Durand', company: 'Northside Atelier', job: 'Architect', phones: [['07 11 22 33 44', 'mobile'], ['01 23 45 67 89', 'work']], emails: [['camille@atelier-nord.example', 'work']], address: { kind: 'work', street: '8 quai de la Gare', postalCode: '75013', city: 'Paris', country: 'France' }, labels: ['demo-clabel-travail'], photo: 'demo-portrait2-1', ago: 30 * DAY },
  { id: 'demo-contact-noah', first: 'Noah', last: 'Bernard', phones: [['06 55 44 33 22', 'mobile']], emails: [['noah.b@example.org', 'home']], birthday: { inDays: 12, year: 1994 }, labels: ['demo-clabel-escalade'], favorite: true, ago: 25 * DAY },
  { id: 'demo-contact-ines', first: 'Inès', last: 'Lefèvre', company: '3rd district town hall', job: 'Project officer', phones: [['04 72 00 11 22', 'work']], emails: [['ines.lefevre@example.org', 'work']], labels: ['demo-clabel-travail'], ago: 20 * DAY },
  { id: 'demo-contact-hugo', first: 'Hugo', last: 'Moreau', phones: [['+44 7700 900123', 'mobile']], emails: [['hugo.moreau@example.co.uk', 'home']], address: { kind: 'home', street: '21 Baker Lane', postalCode: 'NW1 6XE', city: 'London', country: 'United Kingdom' }, birthday: '--04-17', labels: ['demo-clabel-escalade'], note: 'Met at the Fontainebleau boulders.', ago: 18 * DAY },
  { id: 'demo-contact-chloe', first: 'Chloé', last: 'Petit', phones: [['06 01 02 03 04', 'mobile']], birthday: { inDays: 27, year: null }, labels: ['demo-clabel-voisins'], photo: 'demo-portrait3-1', ago: 12 * DAY },
  { id: 'demo-contact-marc', first: 'Marc', last: 'Garnier', company: 'Garnier Plumbing', job: 'Plumber', phones: [['06 77 88 99 00', 'mobile']], note: 'Comes on Saturday mornings. Free quote.', ago: 9 * DAY },
  { id: 'demo-contact-sarah', first: 'Sarah', last: 'Cohen', phones: [['06 45 67 89 01', 'mobile']], emails: [['sarah.cohen@example.org', 'home'], ['s.cohen@example.com', 'work']], birthday: '1989-02-09', labels: ['demo-clabel-famille', 'demo-clabel-escalade'], ago: 6 * DAY },
  { id: 'demo-contact-julien', first: 'Julien', last: 'Roux', company: 'Northside Atelier', job: 'Draughtsman', emails: [['julien@atelier-nord.example', 'work']], labels: ['demo-clabel-travail'], ago: 4 * DAY },
  // Her birthday is today: « Souhaiter » on her page, today's birthdays and Agenda's.
  { id: 'demo-contact-amelie', first: 'Amélie', last: 'Fontaine', phones: [['06 31 41 59 26', 'mobile']], emails: [['amelie.fontaine@example.org', 'home']], birthday: { inDays: 0, year: 1996 }, address: { kind: 'home', street: '12 rue des Lilas', postalCode: '69003', city: 'Lyon', country: 'France' }, labels: ['demo-clabel-voisins'], ago: 3 * DAY },
  { id: 'demo-contact-old', first: 'Bruno', last: 'Lambert', phones: [['06 00 00 00 01', 'mobile']], ago: 50 * DAY, trashedAgo: 2 * DAY },
];

/** A birthday a few days from now, in its stored form. */
function birthdayOf(seed: ContactSeed, now: number): string | null {
  if (!seed.birthday) return null;
  if (typeof seed.birthday === 'string') return seed.birthday;
  const day = new Date(now + seed.birthday.inDays * DAY);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${seed.birthday.year === null ? '-' : seed.birthday.year}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

function contactChanges(now: number): { readonly time: number; readonly changes: LocalChange[] }[] {
  const labelKeys = keysBetween(null, null, CONTACT_LABELS.length);
  const out: { time: number; changes: LocalChange[] }[] = [
    {
      time: now - 45 * DAY,
      changes: CONTACT_LABELS.map((label, index) => ({ type: 'contactLabel', id: label.id, patch: contactLabelFields({ name: label.name, color: label.color, position: labelKeys[index]!, createdAt: now - 45 * DAY, deletedAt: null }) })),
    },
  ];
  for (const seed of CONTACTS) {
    const time = now - seed.ago;
    out.push({
      time,
      changes: [
        {
          type: 'contact',
          id: seed.id,
          patch: contactFields({
            firstName: seed.first,
            lastName: seed.last,
            company: seed.company ?? '',
            jobTitle: seed.job ?? '',
            phones: (seed.phones ?? []).map(([number, kind], index) => ({ id: `${seed.id}-p${index}`, number, kind, label: '' })),
            emails: (seed.emails ?? []).map(([address, kind], index) => ({ id: `${seed.id}-e${index}`, address, kind, label: '' })),
            addresses: seed.address ? [{ id: `${seed.id}-a0`, label: '', region: '', ...seed.address }] : [],
            birthday: birthdayOf(seed, now),
            note: seed.note ?? '',
            labelIds: [...(seed.labels ?? [])],
            favorite: seed.favorite ?? false,
            photoId: seed.photo ?? null,
            photoUploaded: seed.photo !== undefined,
            photoMime: seed.photo ? 'image/svg+xml' : '',
            trashedAt: seed.trashedAgo !== undefined ? now - seed.trashedAgo : null,
            mergedInto: null,
            createdAt: time,
            deletedAt: null,
          }),
        },
      ],
    });
  }
  return out;
}

/**
 * The demo as sync records, with clocks at each record's own time. Pure: it
 * imports nothing but core and types, so `tools/demo/seed-server.ts` can push
 * the same dataset to a real server for the phone.
 */
export function buildDemoRecords(now: number = Date.now()): SyncRecord[] {
  const events: { readonly time: number; readonly changes: LocalChange[] }[] = [];
  const add = (time: number, changes: LocalChange[]): void => {
    events.push({ time, changes });
  };

  const labelKeys = keysBetween(null, null, LABELS.length);
  add(now - 45 * DAY, LABELS.map((label, index) => ({ type: 'label' as const, id: label.id, patch: labelFields({ name: label.name, color: label.color, position: labelKeys[index]!, createdAt: now - 45 * DAY, deletedAt: null }) })));

  // The templates, before the collection that reads with one.
  add(now - 21 * DAY, [{ type: 'linkTemplate', id: DEMO_WINE_TEMPLATE, patch: linkTemplateFields({ name: 'Wine', kind: null, fields: WINE_FIELDS, createdAt: now - 21 * DAY, deletedAt: null }) }]);
  add(now - 2 * DAY, [{ type: 'linkTemplate', id: kindTemplateId('recipe'), patch: linkTemplateFields({ name: '', kind: 'recipe', fields: RECIPE_FIELDS, createdAt: now - 2 * DAY, deletedAt: null }) }]);

  const noteKeys = keysBetween(null, null, NOTES.length);
  NOTES.forEach((seed, index) => {
    const time = now - seed.ago;
    const changes: LocalChange[] = [
      {
        type: 'note',
        id: seed.id,
        patch: noteFields({
          kind: seed.kind,
          title: seed.title,
          body: seed.body ?? '',
          rich: seed.rich,
          drawing: seed.drawing,
          color: seed.color ?? null,
          ...(seed.pattern ? { pattern: seed.pattern } : {}),
          pinned: seed.pinned ?? false,
          archived: seed.archived ?? false,
          trashedAt: seed.trashedAgo !== undefined ? now - seed.trashedAgo : null,
          labelIds: [...(seed.labels ?? [])],
          position: noteKeys[index]!,
          reminderAt: seed.reminder ? seed.reminder(now) : null,
          code: seed.code ?? '',
          hint: seed.hint ?? '',
          contactIds: seed.people ?? [],
          ...(seed.modules ? { modules: seed.modules } : {}),
          ...(seed.templateId ? { templateId: seed.templateId } : {}),
          createdAt: time,
          deletedAt: null,
        }),
      },
    ];
    const checkKeys = keysBetween(null, null, seed.checks?.length ?? 0);
    seed.checks?.forEach(([text, checked], i) => {
      changes.push({ type: 'check', id: `${seed.id}-c${i}`, patch: checkFields({ noteId: seed.id, text, checked, position: checkKeys[i]!, indent: 0, createdAt: time, deletedAt: null }) });
    });
    if (seed.photo) {
      changes.push({
        type: 'attachment',
        id: seed.photo,
        patch: attachmentFields({ noteId: seed.id, mime: 'image/jpeg', width: 640, height: 480, bytes: 0, position: 'a0', uploaded: true, createdAt: time, deletedAt: null }),
      });
    }
    add(time, changes);
  });

  const byLine = new Map<string, LinkSeed[]>();
  for (const link of LINKS) byLine.set(link.line, [...(byLine.get(link.line) ?? []), link]);
  for (const [line, links] of byLine) {
    const keys = keysBetween(null, null, links.length);
    links.forEach((seed, index) => {
      const time = now - seed.ago;
      add(time, [
        {
          type: 'link',
          id: `demo-link-${line}-${index}`,
          patch: {
            ...linkFields({
              noteId: line,
              url: seed.url,
              status: seed.status ?? 'ready',
              autoFile: false,
              filedBy: line === INBOX_ID ? null : 'claude',
              // The demo's readings are written in English.
              lang: 'en',
              title: seed.title ?? '',
              summary: seed.summary ?? '',
              siteName: seed.siteName ?? '',
              kind: seed.kind ?? 'other',
              price: seed.price ?? null,
              currency: seed.price !== undefined ? 'EUR' : null,
              attributes: seed.attributes ?? [],
              imageIds: seed.images ?? [],
              imageUrl: null,
              done: seed.doneAgo !== undefined,
              doneAt: seed.doneAgo !== undefined ? now - seed.doneAgo : null,
              comment: seed.comment ?? '',
              position: keys[index]!,
              error: seed.error ?? null,
              analyzedAt: seed.status === 'pending' || seed.status === 'skipped' ? null : time,
              createdAt: time,
              deletedAt: null,
              copy: null,
              contactIds: seed.people ?? [],
              ...(seed.readWith ? { readWith: seed.readWith } : {}),
            }),
            ...(seed.priceBefore !== undefined ? { priceBefore: seed.priceBefore, priceChangedAt: now - (seed.priceChangedAgo ?? 0), priceCheckedAt: now - HOUR } : {}),
            ...(seed.priceCheckedAgo !== undefined ? { priceCheckedAt: now - seed.priceCheckedAgo } : {}),
          },
        },
      ]);
    });
  }

  // Pages: each block under its parent, siblings in order, at its page's time.
  let blockCount = 0;
  const placeBlocks = (seeds: readonly BlockSeed[], parentId: string | null, time: number): void => {
    const keys = keysBetween(null, null, seeds.length);
    seeds.forEach((seed, index) => {
      const id = seed.id ?? `demo-block-${(blockCount += 1)}`;
      const at = seed.ago !== undefined ? now - seed.ago : time;
      add(at, [
        {
          type: 'block',
          id,
          patch: blockFields({
            parentId,
            position: keys[index]!,
            kind: seed.kind,
            createdAt: at,
            text: typeof seed.text === 'function' ? seed.text(now) : (seed.text ?? ''),
            ...(seed.checked !== undefined || seed.kind === 'todo' ? { checked: seed.checked ?? false } : {}),
            ...(seed.language ? { language: seed.language } : {}),
            ...(seed.icon ? { icon: seed.icon } : {}),
            ...(seed.color ? { color: seed.color } : {}),
            ...(seed.columns ? { columns: seed.columns } : {}),
            ...(seed.cells ? { cells: seed.cells } : {}),
            ...(seed.target ? { target: seed.target } : {}),
            ...(seed.caption ? { caption: seed.caption } : {}),
            ...(seed.drawing ? { drawing: seed.drawing } : {}),
            ...(seed.kind === 'page' ? { trashedAt: null } : {}),
          }),
        },
      ]);
      placeBlocks(seed.children ?? [], id, at);
    });
  };
  placeBlocks(PAGES, null, now - DAY);

  // Contacts: the labels, then each person at the time they were added.
  for (const event of contactChanges(now)) add(event.time, event.changes);
  // Agenda: its labels, events and a calendar subscribed to.
  for (const event of calendarChanges(now)) add(event.time, event.changes);

  // Clocks at each record's own time (as a Keep import does), so "Modifiée hier" says yesterday.
  let counter = 0;
  const records: SyncRecord[] = [];
  for (const event of events) {
    for (const change of event.changes) {
      counter += 1;
      const clock = formatHlc(event.time, counter, 'demoseed');
      records.push({ type: change.type, id: change.id, fields: change.patch, clocks: Object.fromEntries(Object.keys(change.patch).map(key => [key, clock])) });
    }
  }
  return records;
}

/** Image blob ids the demo records refer to (link images and the note photo). */
export const DEMO_IMAGE_IDS: readonly string[] = [
  ...new Set([...LINKS.flatMap(link => link.images ?? []), ...NOTES.flatMap(note => (note.photo ? [note.photo] : [])), ...CONTACTS.flatMap(contact => (contact.photo ? [contact.photo] : []))]),
];
