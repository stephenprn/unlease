/**
 * Places found as they are typed (`GET /api/places`, `core/sync/places`), for an event's place and a
 * contact's address: Photon (komoot's geocoder on OpenStreetMap's data, no key; or one's own, from
 * `UNLEASE_PLACES_URL`, which may be on the LAN: its address is the server's own setting, never a
 * device's, so the guarded reader is not needed). The server asks, so no device talks to it. Each
 * answer is kept a day; the same question asked twice at once is asked once.
 */
import { placeDetail, type Place, type PlacesRequest, type PlacesResponse } from '@unlease/core/sync/places';

const TTL_MS = 24 * 3_600_000;
const KEPT_MAX = 1000;
const LIMIT = 6;
/** Photon's public instance asks to be told who asks. */
const USER_AGENT = 'Unlease (self-hosted; https://github.com/stephenprn/unlease)';

export class PlacesUnreachable extends Error {}

/** Countries that write the number after the street (« Hauptstraße 12 », « Calle Mayor 5 »). */
const NUMBER_AFTER = new Set(['DE', 'AT', 'CH', 'NL', 'BE', 'IT', 'ES', 'PT', 'PL', 'CZ', 'SK', 'DK', 'NO', 'SE', 'FI', 'IS', 'HU', 'HR', 'SI', 'RS', 'BA', 'GR', 'TR', 'EE', 'LV', 'LT', 'RU', 'UA', 'BR', 'AR', 'MX', 'CL', 'CO', 'PE', 'UY']);
/** What Photon calls a town or wider: the place is the town itself. */
const TOWNS = new Set(['city', 'town', 'village', 'locality', 'district', 'county', 'state', 'country', 'hamlet', 'suburb']);

const text = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/** A place from one of Photon's features; null when it says nothing usable. */
export function placeFromFeature(feature: unknown): Place | null {
  const f = feature as { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } } | null;
  const p = f?.properties;
  if (!p) return null;
  const country = text(p.country);
  const code = text(p.countrycode).toUpperCase();
  const number = text(p.housenumber);
  const streetName = text(p.street);
  const street = streetName ? (number ? (NUMBER_AFTER.has(code) ? `${streetName} ${number}` : `${number} ${streetName}`) : streetName) : '';
  const type = text(p.type);
  // OpenStreetMap's mappers mark a twin « (double) »: the place is the same.
  const own = text(p.name).replace(/^\([^)]*\)\s*/, '');
  const isTown = TOWNS.has(type);
  const city = text(p.city) || (isTown && type !== 'state' && type !== 'country' && type !== 'county' ? own : '') || text(p.locality) || text(p.district);
  const postalCode = text(p.postcode).split(/[;,]/)[0]!.trim();
  const region = text(p.state);
  // A venue's name, else the street with its number, else the town.
  const name = own && own !== streetName ? own : street || own || city;
  if (!name) return null;
  const town = [postalCode, city].filter(Boolean).join(' ');
  const detail = isTown ? [type === 'state' || type === 'country' ? '' : region, country].filter(part => part && part !== name).join(', ') : placeDetail({ postalCode, city, region, country }, name);
  // The line kept: the name, a venue's street, the town; a town alone says its country.
  const line = isTown ? [name, country !== name ? country : ''] : [name, name !== street ? street : '', town !== name ? town : ''];
  const label = [...new Set(line.filter(Boolean))].join(', ');
  const coordinates = Array.isArray(f.geometry?.coordinates) ? (f.geometry.coordinates as unknown[]) : [];
  const lon = typeof coordinates[0] === 'number' ? coordinates[0] : null;
  const lat = typeof coordinates[1] === 'number' ? coordinates[1] : null;
  return { label, name, detail, street: isTown ? '' : street, postalCode, city, region, country, lat, lon };
}

export class PlaceFinder {
  private readonly kept = new Map<string, { readonly at: number; readonly answer: PlacesResponse }>();
  private readonly running = new Map<string, Promise<PlacesResponse>>();

  constructor(
    /** Photon's address (`https://photon.komoot.io`); null when the search is off. */
    private readonly base: string | null,
    private readonly now: () => number = Date.now,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get on(): boolean {
    return this.base !== null;
  }

  find(request: PlacesRequest): Promise<PlacesResponse> {
    if (!this.base) return Promise.resolve({ places: [] });
    const key = `${request.lang}|${request.q.toLowerCase()}|${request.near ? `${request.near.lat.toFixed(1)},${request.near.lon.toFixed(1)}` : ''}`;
    const kept = this.kept.get(key);
    if (kept && this.now() - kept.at < TTL_MS) return Promise.resolve(kept.answer);
    const running = this.running.get(key);
    if (running) return running;
    const job = this.ask(this.base, request)
      .then(answer => {
        if (this.kept.size >= KEPT_MAX) this.kept.delete(this.kept.keys().next().value!);
        this.kept.set(key, { at: this.now(), answer });
        return answer;
      })
      .finally(() => this.running.delete(key));
    this.running.set(key, job);
    return job;
  }

  private async ask(base: string, request: PlacesRequest): Promise<PlacesResponse> {
    const params = new URLSearchParams({ q: request.q, limit: String(LIMIT + 2) });
    // Photon speaks French, English and German; another language takes the places' own names.
    if (request.lang === 'fr' || request.lang === 'en') params.set('lang', request.lang);
    if (request.near) {
      params.set('lat', String(request.near.lat));
      params.set('lon', String(request.near.lon));
    }
    let body: unknown;
    try {
      const response = await this.fetchImpl(`${base.replace(/\/+$/, '')}/api/?${params.toString()}`, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new PlacesUnreachable('Recherche de lieux injoignable');
      const raw = await response.text();
      if (raw.length > 1024 * 1024) throw new PlacesUnreachable('Recherche de lieux injoignable');
      body = JSON.parse(raw);
    } catch {
      throw new PlacesUnreachable('Recherche de lieux injoignable');
    }
    const features = Array.isArray((body as { features?: unknown } | null)?.features) ? (body as { features: unknown[] }).features : [];
    const seen = new Set<string>();
    const places: Place[] = [];
    for (const feature of features) {
      const place = placeFromFeature(feature);
      if (!place || seen.has(place.label.toLowerCase())) continue;
      seen.add(place.label.toLowerCase());
      places.push(place);
      if (places.length >= LIMIT) break;
    }
    return { places };
  }
}
