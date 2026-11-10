/**
 * JSON-LD, reduced to what helps describe a link. Shops, film databases and
 * restaurant guides publish their facts here more reliably than in the page
 * text, but the raw blocks are huge (breadcrumbs, reviews, every variant), so
 * each kept entity is trimmed to the fields that matter for its type.
 */
export type Category =
  | 'product'
  | 'offer'
  | 'film'
  | 'series'
  | 'restaurant'
  | 'place'
  | 'recipe'
  | 'book'
  | 'article'
  | 'video'
  | 'event'
  | 'music';

export interface StructuredItem {
  readonly type: string;
  readonly category: Category;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface Price {
  readonly amount: number;
  readonly currency: string | null;
}

export interface StructuredData {
  readonly items: readonly StructuredItem[];
  /** Image URLs as written (possibly relative). */
  readonly images: readonly string[];
  /** The lowest current offer price found on a product, if any. */
  readonly price: Price | null;
}

const TYPES: Record<string, Category> = {
  Product: 'product',
  ProductGroup: 'product',
  ProductModel: 'product',
  IndividualProduct: 'product',
  Vehicle: 'product',
  Car: 'product',
  Offer: 'offer',
  AggregateOffer: 'offer',
  Movie: 'film',
  TVSeries: 'series',
  TVSeason: 'series',
  TVEpisode: 'series',
  Restaurant: 'restaurant',
  FoodEstablishment: 'restaurant',
  CafeOrCoffeeShop: 'restaurant',
  BarOrPub: 'restaurant',
  Bakery: 'restaurant',
  Brewery: 'restaurant',
  Winery: 'restaurant',
  IceCreamShop: 'restaurant',
  Distillery: 'restaurant',
  LocalBusiness: 'place',
  Place: 'place',
  TouristAttraction: 'place',
  Museum: 'place',
  Park: 'place',
  LandmarksOrHistoricalBuildings: 'place',
  LodgingBusiness: 'place',
  Hotel: 'place',
  MovieTheater: 'place',
  Recipe: 'recipe',
  Book: 'book',
  Audiobook: 'book',
  Article: 'article',
  NewsArticle: 'article',
  BlogPosting: 'article',
  Report: 'article',
  TechArticle: 'article',
  ScholarlyArticle: 'article',
  VideoObject: 'video',
  Event: 'event',
  Festival: 'event',
  MusicRecording: 'music',
  MusicAlbum: 'music',
  MusicPlaylist: 'music',
  MusicGroup: 'music',
};

const COMMON = ['name', 'headline', 'alternateName', 'description', 'image'];
const FIELDS: Record<Category, readonly string[]> = {
  product: ['brand', 'model', 'sku', 'color', 'material', 'size', 'category', 'offers', 'aggregateRating'],
  offer: ['price', 'lowPrice', 'highPrice', 'priceCurrency', 'availability', 'offerCount'],
  film: ['director', 'datePublished', 'dateCreated', 'duration', 'genre', 'actor', 'aggregateRating', 'contentRating', 'countryOfOrigin'],
  series: ['creator', 'director', 'startDate', 'endDate', 'numberOfSeasons', 'numberOfEpisodes', 'genre', 'actor', 'aggregateRating', 'partOfSeries'],
  restaurant: ['address', 'servesCuisine', 'priceRange', 'openingHours', 'openingHoursSpecification', 'telephone', 'aggregateRating', 'acceptsReservations'],
  place: ['address', 'openingHours', 'openingHoursSpecification', 'telephone', 'priceRange', 'aggregateRating'],
  recipe: ['author', 'totalTime', 'prepTime', 'cookTime', 'recipeYield', 'recipeCategory', 'recipeCuisine', 'recipeIngredient', 'aggregateRating'],
  book: ['author', 'isbn', 'numberOfPages', 'datePublished', 'publisher', 'bookFormat', 'inLanguage', 'genre', 'aggregateRating'],
  article: ['author', 'datePublished', 'publisher', 'articleSection', 'wordCount', 'timeRequired'],
  video: ['duration', 'uploadDate', 'author', 'creator', 'publisher'],
  event: ['startDate', 'endDate', 'location', 'offers', 'performer', 'organizer', 'eventStatus'],
  music: ['byArtist', 'inAlbum', 'duration', 'datePublished', 'genre', 'numTracks', 'recordLabel'],
};
const DURATIONS = new Set(['duration', 'totalTime', 'prepTime', 'cookTime', 'timeRequired']);
const LIST_LIMITS: Record<string, number> = { actor: 5, recipeIngredient: 15, image: 2, genre: 4, openingHoursSpecification: 7 };
const DAYS: Record<string, string> = {
  Monday: 'Mo',
  Tuesday: 'Tu',
  Wednesday: 'We',
  Thursday: 'Th',
  Friday: 'Fr',
  Saturday: 'Sa',
  Sunday: 'Su',
};
const MAX_ITEMS = 6;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const lastSegment = (value: string): string => value.replace(/^https?:\/\/schema\.org\//i, '').replace(/^schema:/i, '');

function typesOf(entity: Json): string[] {
  return asArray(entity['@type']).filter((type): type is string => typeof type === 'string').map(lastSegment);
}

function categoryOf(types: readonly string[]): Category | null {
  for (const type of types) {
    const known = TYPES[type];
    if (known) return known;
    if (type.endsWith('Restaurant')) return 'restaurant';
    if (type.endsWith('Event')) return 'event';
    if (type.endsWith('Article')) return 'article';
    if (type.endsWith('Store')) return 'place';
  }
  return null;
}

function cleanText(value: string, max: number): string {
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ ([,.])/g, '$1')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** "PT2H46M" as "2 h 46 min". Anything else is returned unchanged. */
export function formatDuration(value: string): string {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(value.trim());
  if (!match || value.trim().toUpperCase() === 'P' || value.trim().toUpperCase() === 'PT') return value;
  const totalMinutes =
    Number(match[1] ?? 0) * 1440 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) + Math.round(Number(match[4] ?? 0) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function parsePriceValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  let text = value.replace(/[^\d.,]/g, '');
  if (!/\d/.test(text)) return null;
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma > dot) {
    // 49,90 or 1.299,90 (decimal comma); 1,299 (thousands comma)
    text = text.length - comma - 1 <= 2 ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (dot > comma) {
    // 49.90 or 1,299.90; 1.299 is a thousands dot
    text = text.length - dot - 1 === 3 && comma < 0 && /^\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, '') : text.replace(/,/g, '');
  }
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function currencyOf(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z]{3}$/.test(value.trim()) ? value.trim().toUpperCase() : null;
}

function simplifyOffer(offer: Json): Json | undefined {
  const spec = isObject(offer.priceSpecification) ? offer.priceSpecification : {};
  const out: Json = {};
  const price = parsePriceValue(offer.price ?? spec.price);
  const low = parsePriceValue(offer.lowPrice);
  const high = parsePriceValue(offer.highPrice);
  if (price !== null) out.price = price;
  if (low !== null) out.lowPrice = low;
  if (high !== null) out.highPrice = high;
  const currency = currencyOf(offer.priceCurrency ?? spec.priceCurrency);
  if (currency) out.priceCurrency = currency;
  if (typeof offer.availability === 'string') out.availability = lastSegment(offer.availability);
  if (typeof offer.offerCount === 'number' || typeof offer.offerCount === 'string') out.offerCount = offer.offerCount;
  return Object.keys(out).length > 0 ? out : undefined;
}

function formatAddress(address: Json): string | undefined {
  const parts = [
    address.streetAddress,
    [address.postalCode, address.addressLocality].filter(part => typeof part === 'string' || typeof part === 'number').join(' '),
    typeof address.addressCountry === 'string' ? address.addressCountry : isObject(address.addressCountry) ? address.addressCountry.name : undefined,
  ]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map(part => cleanText(part, 120));
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function formatRating(rating: Json): string | undefined {
  const value = rating.ratingValue;
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const best = typeof rating.bestRating === 'number' || typeof rating.bestRating === 'string' ? rating.bestRating : 5;
  const count = rating.ratingCount ?? rating.reviewCount;
  return `${value}/${best}${typeof count === 'number' || typeof count === 'string' ? ` (${count} votes)` : ''}`;
}

function formatHours(spec: Json): string | undefined {
  const days = asArray(spec.dayOfWeek)
    .filter((day): day is string => typeof day === 'string')
    .map(day => DAYS[lastSegment(day)] ?? lastSegment(day));
  if (typeof spec.opens !== 'string' || typeof spec.closes !== 'string') return undefined;
  return `${days.join(',')} ${spec.opens.slice(0, 5)}-${spec.closes.slice(0, 5)}`.trim();
}

function simplify(value: unknown, key: string, depth: number): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const text = cleanText(value, key === 'description' ? 500 : 200);
    if (!text) return undefined;
    return DURATIONS.has(key) ? formatDuration(text) : text;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 3) return undefined;
  if (Array.isArray(value)) {
    const items = value.map(item => simplify(item, key, depth + 1)).filter(item => item !== undefined);
    const unique = [...new Map(items.map(item => [JSON.stringify(item), item])).values()].slice(0, LIST_LIMITS[key] ?? 5);
    if (unique.length === 0) return undefined;
    return unique.length === 1 ? unique[0] : unique;
  }
  if (!isObject(value)) return undefined;
  const types = typesOf(value);
  if (types.includes('PostalAddress')) return formatAddress(value);
  if (types.includes('AggregateRating') || types.includes('Rating') || 'ratingValue' in value) return formatRating(value);
  if (types.includes('OpeningHoursSpecification')) return formatHours(value);
  if (types.includes('Offer') || types.includes('AggregateOffer') || 'price' in value || 'lowPrice' in value) return simplifyOffer(value);
  if (types.includes('ImageObject')) return simplify(value.url ?? value.contentUrl, key, depth + 1);
  if (types.includes('GeoCoordinates')) return undefined;
  if (types.includes('QuantitativeValue')) return simplify(`${value.value ?? ''} ${value.unitText ?? ''}`, key, depth + 1);
  if (key === 'location') {
    const name = typeof value.name === 'string' ? cleanText(value.name, 120) : '';
    const address = isObject(value.address) ? formatAddress(value.address) : typeof value.address === 'string' ? value.address : '';
    return [name, address].filter(Boolean).join(', ') || undefined;
  }
  if (typeof value.name === 'string') return cleanText(value.name, 120);
  if (typeof value['@id'] === 'string' || typeof value.url === 'string') return undefined;
  return undefined;
}

function* entities(node: unknown, depth = 0): Generator<Json> {
  if (depth > 5) return;
  if (Array.isArray(node)) {
    for (const item of node) yield* entities(item, depth + 1);
    return;
  }
  if (!isObject(node)) return;
  if (node['@graph'] !== undefined) yield* entities(node['@graph'], depth + 1);
  if (node['@type'] !== undefined) yield node;
  if (isObject(node.mainEntity) || Array.isArray(node.mainEntity)) yield* entities(node.mainEntity, depth + 1);
}

function parseLenient(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^<!--/, '')
    .replace(/-->$/, '')
    .replace(/^\/\/\s*<!\[CDATA\[/, '')
    .replace(/\/\/\s*\]\]>$/, '')
    .trim()
    .replace(/;$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    // Raw newlines and tabs inside strings are the usual hand-written mistake.
    try {
      return JSON.parse(trimmed.replace(/[\u0000-\u001f]+/g, ' '));
    } catch {
      return undefined;
    }
  }
}

function imagesOf(entity: Json): string[] {
  return [...asArray(entity.image), ...asArray(entity.thumbnailUrl)]
    .map(image => (typeof image === 'string' ? image : isObject(image) ? (image.url ?? image.contentUrl) : undefined))
    .filter((url): url is string => typeof url === 'string' && url.length > 0);
}

/** Every price-bearing offer under a product (offers, aggregate offers, variants). */
function pricesOf(node: unknown, depth: number, out: Price[]): void {
  if (depth > 4) return;
  if (Array.isArray(node)) {
    for (const item of node) pricesOf(item, depth + 1, out);
    return;
  }
  if (!isObject(node)) return;
  const spec = isObject(node.priceSpecification) ? node.priceSpecification : {};
  const amount = parsePriceValue(node.lowPrice) ?? parsePriceValue(node.price ?? spec.price);
  if (amount !== null && amount > 0) out.push({ amount, currency: currencyOf(node.priceCurrency ?? spec.priceCurrency) });
  pricesOf(node.offers, depth + 1, out);
  pricesOf(node.hasVariant, depth + 1, out);
}

export interface RecipeData {
  /** Every ingredient line, as the recipe writes it. */
  readonly ingredients: readonly string[];
  /** What it makes ("4 personnes"), or ''. */
  readonly servings: string;
  /** The method, in order, each step under its part of the recipe (''); empty when the page gives none. */
  readonly steps: readonly { readonly section: string; readonly text: string }[];
}

const STEPS_MAX = 80;

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾' };

/** Entities some sites leave in their structured data ("200&nbsp;g", "l&#39;eau"). */
function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Longer than this, a piece of method is cut into steps: a method written as one block of text. */
const STEP_SPLIT = 500;

/** A long piece of method in steps: before each « Étape n » it names, else by its sentences, a few at a time. */
function splitStep(text: string): string[] {
  if (text.length <= STEP_SPLIT) return [text];
  const out: string[] = [];
  for (const part of text.split(/(?<![\p{L}\d])(?=(?:étape|step)\s*\d{1,2}\s*[.):-](?!\d))/iu).map(each => each.trim()).filter(Boolean)) {
    if (part.length <= STEP_SPLIT) {
      out.push(part);
      continue;
    }
    let chunk = '';
    for (const sentence of part.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [part]) {
      if (chunk && chunk.length + sentence.length > STEP_SPLIT) {
        out.push(chunk.trim());
        chunk = '';
      }
      chunk += sentence;
    }
    if (chunk.trim()) out.push(chunk.trim());
  }
  return out;
}

/** A method written as one text: its lines, without their markup or their own numbers ("1.", "Étape 2 :", never the start of "1-2 minutes"). */
function methodLines(value: string): string[] {
  return decodeEntities(value.replace(/<\s*(br|\/p|\/li|\/div)\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' '))
    .split(/\n+/)
    .flatMap(line => splitStep(line.replace(/\s+/g, ' ').trim()))
    .map(line => cleanText(line.replace(/^\s*(?:(?:étape|step)\s*)?\d{1,2}\s*[.):-](?!\d)\s*/iu, ''), 1200))
    .filter(line => line.length > 0);
}

/** `recipeInstructions`: a text, steps (`HowToStep`), or parts holding steps (`HowToSection`, an `ItemList`). */
function stepsOf(value: unknown, section: string, out: { section: string; text: string }[], depth: number): void {
  if (depth > 3) return;
  for (const item of asArray(value)) {
    if (out.length >= STEPS_MAX) return;
    if (typeof item === 'string') {
      for (const text of methodLines(item)) out.push({ section, text });
      continue;
    }
    if (!isObject(item)) continue;
    if (item.itemListElement !== undefined && typeof item.text !== 'string') {
      const name = typeof item.name === 'string' ? cleanText(decodeEntities(item.name), 120) : '';
      stepsOf(item.itemListElement, name || section, out, depth + 1);
      continue;
    }
    // A step's name is often its text cut short: the text first.
    const text = [item.text, item.description, item.name].find((part): part is string => typeof part === 'string' && part.trim().length > 0);
    if (text) for (const line of methodLines(text)) out.push({ section, text: line });
  }
}

/** A recipe's whole ingredient list, what it makes and its method, from the page's structured data; null when it gives no ingredients. */
export function parseRecipe(scripts: readonly string[]): RecipeData | null {
  for (const script of scripts) {
    for (const entity of entities(parseLenient(script))) {
      if (!typesOf(entity).includes('Recipe')) continue;
      const ingredients = asArray(entity.recipeIngredient ?? entity.ingredients)
        .filter((line): line is string => typeof line === 'string')
        .map(line => cleanText(decodeEntities(line), 200))
        .filter(line => line.length > 0);
      if (ingredients.length === 0) continue;
      const yields = asArray(entity.recipeYield).filter((value): value is string | number => typeof value === 'string' || typeof value === 'number').map(value => cleanText(decodeEntities(String(value)), 80));
      // ["4", "4 personnes"]: the one that says what.
      const servings = yields.find(value => /\p{L}/u.test(value)) ?? yields.find(value => value.length > 0) ?? '';
      const steps: { section: string; text: string }[] = [];
      stepsOf(entity.recipeInstructions, '', steps, 0);
      return { ingredients, servings, steps: steps.slice(0, STEPS_MAX) };
    }
  }
  return null;
}

export function parseJsonLd(scripts: readonly string[]): StructuredData {
  const items: StructuredItem[] = [];
  const images: string[] = [];
  const prices: Price[] = [];
  const seen = new Set<string>();
  for (const script of scripts) {
    for (const entity of entities(parseLenient(script))) {
      const types = typesOf(entity);
      const category = categoryOf(types);
      if (!category) continue;
      const data: Json = {};
      for (const key of [...COMMON, ...FIELDS[category]]) {
        const value = simplify(entity[key], key, 0);
        if (value !== undefined) data[key] = value;
      }
      if (Object.keys(data).length === 0) continue;
      if (category === 'product' || category === 'offer') pricesOf(entity, 0, prices);
      images.push(...imagesOf(entity));
      const key = JSON.stringify([types[0], data]);
      if (seen.has(key) || items.length >= MAX_ITEMS) continue;
      seen.add(key);
      items.push({ type: types[0] ?? category, category, data });
    }
  }
  const withCurrency = prices.filter(price => price.currency !== null);
  const pool = withCurrency.length > 0 ? withCurrency : prices;
  const price = pool.length > 0 ? pool.reduce((low, next) => (next.amount < low.amount ? next : low)) : null;
  return { items, images: [...new Set(images)], price };
}
