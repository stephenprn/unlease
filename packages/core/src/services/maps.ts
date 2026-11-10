/**
 * A place written on one line (« 12 rue des Lilas, 69003 Lyon, France », an event's place) opened in
 * maps: Google Maps', OpenStreetMap's or Apple's address for it on the web, the way there in each, and
 * the `geo:` address a phone's own maps apps read. Every app that shows a place uses these
 * (Contacts' addresses, Agenda's places); the brands' names are the same in every language.
 */

/** The maps on the web. Apple's Plans stays for the settings that still name it. */
export const MAP_APPS = ['openstreetmap', 'google', 'apple'] as const;
export type MapApp = (typeof MAP_APPS)[number];

/** Their names: brands, the same in every language. */
export const MAP_APP_NAMES: Readonly<Record<MapApp, string>> = { openstreetmap: 'OpenStreetMap', google: 'Google Maps', apple: 'Plans (Apple)' };

/** The place on one line, its spaces folded; '' for nothing written. */
const placeLine = (place: string): string => place.replace(/\s+/g, ' ').trim();

/** Where `app` searches a place written on one line; null for nothing written. */
export function lineMapsUrl(place: string, app: MapApp = 'google'): string | null {
  const line = placeLine(place);
  if (!line) return null;
  const query = encodeURIComponent(line);
  switch (app) {
    case 'openstreetmap':
      return `https://www.openstreetmap.org/search?query=${query}`;
    case 'apple':
      return `https://maps.apple.com/?q=${query}`;
    default:
      return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }
}

/** The way to a place written on one line, in `app`; null for nothing written. */
export function lineDirectionsUrl(place: string, app: MapApp = 'google'): string | null {
  const line = placeLine(place);
  if (!line) return null;
  const query = encodeURIComponent(line);
  switch (app) {
    case 'openstreetmap':
      return `https://www.openstreetmap.org/directions?to=${query}`;
    case 'apple':
      return `https://maps.apple.com/?daddr=${query}`;
    default:
      return `https://www.google.com/maps/dir/?api=1&destination=${query}`;
  }
}

/**
 * The place for a phone's own maps apps (RFC 5870's `geo:` with a query, as Android reads it):
 * Organic Maps, OsmAnd, Google Maps… each opens it. Null for nothing written.
 */
export function lineGeoUri(place: string): string | null {
  const line = placeLine(place);
  return line ? `geo:0,0?q=${encodeURIComponent(line)}` : null;
}

/** Waze's way to a place (its own link: `geo:` only shows the place there); null for nothing written. */
export function lineWazeUrl(place: string): string | null {
  const line = placeLine(place);
  return line ? `https://waze.com/ul?q=${encodeURIComponent(line)}&navigate=yes` : null;
}
