/**
 * Postal addresses: written in the order the country reads them (the postal code before the city in
 * France, after it in the English-speaking countries), on lines or on one line, and opened in maps.
 */
import { t } from '@unlease/core/i18n';
import { placeDetail, type Place } from '@unlease/core/sync/places';
import { lineDirectionsUrl, lineGeoUri, lineMapsUrl, type MapApp } from '@unlease/core/services/maps';
import { PHONE_KIND_NAMES, PLACE_KIND_NAMES, type AddressEntry, type EmailEntry, type PhoneEntry } from '../models/contacts';

type Postal = Pick<AddressEntry, 'street' | 'postalCode' | 'city' | 'region' | 'country'>;

/** Countries whose addresses put the city before the postal code. */
const CITY_FIRST = /^(us|usa|united states|états-unis|etats-unis|uk|united kingdom|royaume-uni|gb|canada|ca|australia|australie|au|ireland|irlande)$/i;

/** The address as lines: the street (as many lines as typed), the city's line, the country. */
export function addressLines(address: Postal): string[] {
  const street = address.street.split('\n').map(line => line.trim()).filter(Boolean);
  const postal = address.postalCode.trim();
  const city = address.city.trim();
  const region = address.region.trim();
  const country = address.country.trim();
  const cityLine = CITY_FIRST.test(country) ? [[city, region].filter(Boolean).join(', '), postal].filter(Boolean).join(' ') : [[postal, city].filter(Boolean).join(' '), region].filter(Boolean).join(', ');
  return [...street, cityLine, country].filter(Boolean);
}

/** On one line: « 12 rue des Lilas, 69003 Lyon, France ». */
export function addressLine(address: Postal): string {
  return addressLines(address).join(', ');
}

export function isEmptyAddress(address: Postal): boolean {
  return addressLines(address).length === 0;
}

/**
 * The maps an address opens in: Google Maps or OpenStreetMap, offered side by side where an address
 * is shown on the web; the phone hands it to the maps app chosen, or asks (`geoUri`). The place's
 * own addresses (`core/services/maps`) are shared with every app that shows a place.
 */
export { MAP_APPS, MAP_APP_NAMES, lineDirectionsUrl, lineGeoUri, lineMapsUrl, type MapApp } from '@unlease/core/services/maps';

/** Where `app` searches the address on the web; null for an empty address. */
export function mapsUrl(address: Postal, app: MapApp = 'google'): string | null {
  return lineMapsUrl(addressLine(address), app);
}

/** The two offered where an address is shown, in this order. */
export const OFFERED_MAP_APPS = ['google', 'openstreetmap'] as const satisfies readonly MapApp[];

/** The way from where one is to the address, in `app`; null for an empty address. */
export function directionsUrl(address: Postal, app: MapApp = 'google'): string | null {
  return lineDirectionsUrl(addressLine(address), app);
}

/** An address as a place the place field offers (`core/sync/places`): its first street line as its name; null for an empty one. */
export function addressPlace(address: Postal): Place | null {
  const label = addressLine(address);
  if (!label) return null;
  const street = address.street.split('\n').map(line => line.trim()).find(Boolean) ?? '';
  const parts = { postalCode: address.postalCode.trim(), city: address.city.trim(), region: address.region.trim(), country: address.country.trim() };
  const name = street || [parts.postalCode, parts.city].filter(Boolean).join(' ') || parts.country;
  return { label, name, detail: placeDetail(parts, name), street, ...parts, lat: null, lon: null };
}

/** The address for a phone's own maps apps (`geo:` with a query, `lineGeoUri`); null for an empty address. */
export function geoUri(address: Postal): string | null {
  return lineGeoUri(addressLine(address));
}

/** An entry's name: the person's own label, else its kind's (« Mobile », « Travail »). */
export function phoneKindName(entry: Pick<PhoneEntry, 'kind' | 'label'>): string {
  if (entry.label.trim()) return entry.label.trim();
  return Object.hasOwn(PHONE_KIND_NAMES, entry.kind) ? PHONE_KIND_NAMES[entry.kind as keyof typeof PHONE_KIND_NAMES] : t('Other');
}

export function placeKindName(entry: Pick<EmailEntry | AddressEntry, 'kind' | 'label'>): string {
  if (entry.label.trim()) return entry.label.trim();
  return Object.hasOwn(PLACE_KIND_NAMES, entry.kind) ? PLACE_KIND_NAMES[entry.kind as keyof typeof PLACE_KIND_NAMES] : t('Other');
}

/** A `mailto:` address; null for one that is no address. */
export function mailtoHref(address: string): string | null {
  const trimmed = address.trim();
  return /^[^\s@]+@[^\s@]+$/.test(trimmed) ? `mailto:${trimmed}` : null;
}
