/**
 * Places found as they are typed (`GET /api/places?q=…&lang=fr`): an event's place in Agenda, a
 * contact's address in Contacts. The server asks a geocoder (Photon, OpenStreetMap's data, no key;
 * `UNLEASE_PLACES_URL`) so no device talks to it, and keeps each answer a while. The apps put the
 * places they already know first (`knownPlaces`): a contact's address, an event's place used before.
 */
import { isLocale, type Locale } from '../i18n';
import { foldText } from '../services/search';

export const PLACES_PATH = '/api/places';

/** What is typed is searched once it holds this many letters. */
export const PLACE_QUERY_MIN = 3;
/** And at most this many. */
export const PLACE_QUERY_MAX = 200;

export interface Place {
  /** One line, as a person writes it: « 12 rue des Lilas, 69003 Lyon, France », « Arkose Montreuil, Montreuil ». */
  readonly label: string;
  /** Its first line: a venue's name, or the number and street. */
  readonly name: string;
  /** What tells it apart: « 69003 Lyon, France ». */
  readonly detail: string;
  readonly street: string;
  readonly postalCode: string;
  readonly city: string;
  readonly region: string;
  readonly country: string;
  /** Where it is, when the geocoder said (never for a place only typed or kept on the device). */
  readonly lat: number | null;
  readonly lon: number | null;
}

export interface PlacesRequest {
  readonly q: string;
  readonly lang: Locale;
  /** Near this point first (the device's last known place, a contact's city), when given. */
  readonly near: { readonly lat: number; readonly lon: number } | null;
}

export interface PlacesResponse {
  readonly places: readonly Place[];
}

const text = (value: unknown, max = 300): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const coordinate = (value: unknown, limit: number): number | null => (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null);

/** A request from an address's query (`URLSearchParams`); null when there is nothing to search. */
export function parsePlacesRequest(query: Readonly<Record<string, string | undefined>>): PlacesRequest | null {
  const q = (query.q ?? '').replace(/\s+/g, ' ').trim();
  if (q.length < PLACE_QUERY_MIN || q.length > PLACE_QUERY_MAX) return null;
  const lat = coordinate(query.lat === undefined ? undefined : Number(query.lat), 90);
  const lon = coordinate(query.lon === undefined ? undefined : Number(query.lon), 180);
  return { q, lang: isLocale(query.lang) ? query.lang : 'fr', near: lat !== null && lon !== null ? { lat, lon } : null };
}

/** The address's query for a request. */
export function placesQuery(request: PlacesRequest): string {
  const params = new URLSearchParams({ q: request.q, lang: request.lang });
  if (request.near) {
    params.set('lat', request.near.lat.toFixed(3));
    params.set('lon', request.near.lon.toFixed(3));
  }
  return params.toString();
}

/** A place from what was received, its line made when it came without one; null when it holds nothing. */
export function readPlace(value: unknown): Place | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object') return null;
  const parts = { street: text(v.street), postalCode: text(v.postalCode, 40), city: text(v.city), region: text(v.region), country: text(v.country) };
  const name = text(v.name) || parts.street || parts.city;
  const detail = text(v.detail) || placeDetail(parts, name);
  const label = text(v.label, 500) || [name, detail].filter(Boolean).join(', ');
  if (!label) return null;
  return { label, name: name || label, detail, ...parts, lat: coordinate(v.lat, 90), lon: coordinate(v.lon, 180) };
}

export function isPlacesResponse(value: unknown): value is PlacesResponse {
  const v = value as Record<string, unknown> | null;
  return !!v && Array.isArray(v.places);
}

/** The places of an answer, those that read. */
export function readPlaces(value: unknown): readonly Place[] {
  return isPlacesResponse(value) ? value.places.map(readPlace).filter((place): place is Place => place !== null) : [];
}

/** « 69003 Lyon, France » from the parts after a place's first line. */
export function placeDetail(parts: Pick<Place, 'postalCode' | 'city' | 'region' | 'country'>, name = ''): string {
  const town = [parts.postalCode, parts.city].filter(Boolean).join(' ');
  return [town !== name ? town : '', parts.city ? '' : parts.region, parts.country].filter(Boolean).join(', ');
}

/** A place known only by its line (an event's place typed before): its first part as its name, the rest as its detail. */
export function placeFromLine(line: string): Place {
  const label = line.replace(/\s+/g, ' ').trim();
  const [name = label, ...rest] = label.split(',').map(part => part.trim());
  return { label, name, detail: rest.join(', '), street: '', postalCode: '', city: '', region: '', country: '', lat: null, lon: null };
}

/**
 * The places a device knows that answer what is typed (each word found at a word's start, accents
 * and case aside), the most used first; every one, most used first, when nothing is typed. Each place
 * once: two that read the same in the list (the same name and detail: a flat's floor apart) are one.
 */
export function knownPlaces(known: readonly Place[], typed: string, max = 4): readonly Place[] {
  const words = foldText(typed).split(/[\s,]+/).filter(Boolean);
  const seen = new Map<string, { place: Place; count: number; order: number }>();
  known.forEach((place, order) => {
    const key = foldText(`${place.name}|${place.detail}`);
    if (!key) return;
    const entry = seen.get(key);
    if (entry) entry.count += 1;
    else seen.set(key, { place, count: 1, order });
  });
  const fits = (place: Place): boolean => {
    if (words.length === 0) return true;
    const starts = foldText(place.label).split(/[\s,'’-]+/);
    return words.every(word => starts.some(start => start.startsWith(word)));
  };
  return [...seen.values()]
    .filter(entry => fits(entry.place) && foldText(entry.place.label) !== foldText(typed))
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, max)
    .map(entry => entry.place);
}
