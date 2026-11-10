/**
 * The demo's places found as they are typed (`GET /api/places`): a few made-up streets and real
 * towns, matched by the start of their words, so the field's suggestions show without a geocoder.
 */
import { foldText } from '@unlease/core/services/search';
import { parsePlacesRequest, placeDetail, type Place } from '@unlease/core/sync/places';

const place = (name: string, parts: { street?: string; postalCode?: string; city: string; country: string; region?: string }, lat: number, lon: number): Place => {
  const street = parts.street ?? '';
  const town = [parts.postalCode, parts.city].filter(Boolean).join(' ');
  const label = [...new Set([name, street !== name ? street : '', town !== name ? town : ''].filter(Boolean))].join(', ');
  return { label, name, detail: placeDetail({ postalCode: parts.postalCode ?? '', city: parts.city, region: parts.region ?? '', country: parts.country }, name), street, postalCode: parts.postalCode ?? '', city: parts.city, region: parts.region ?? '', country: parts.country, lat, lon };
};

const PLACES: readonly Place[] = [
  place('12 Rue des Lilas', { street: '12 Rue des Lilas', postalCode: '69003', city: 'Lyon', country: 'France' }, 45.757, 4.861),
  place('12 Rue des Lilas', { street: '12 Rue des Lilas', postalCode: '75019', city: 'Paris', country: 'France' }, 48.877, 2.394),
  place('8 Quai de la Gare', { street: '8 Quai de la Gare', postalCode: '75013', city: 'Paris', country: 'France' }, 48.835, 2.373),
  place('Arkose Montreuil', { street: '33 Rue du Progrès', postalCode: '93100', city: 'Montreuil', country: 'France' }, 48.857, 2.436),
  place('Cinéma du quartier', { street: '4 Rue de la Lune', postalCode: '75002', city: 'Paris', country: 'France' }, 48.87, 2.35),
  place('Gare de Lyon', { street: 'Place Louis-Armand', postalCode: '75012', city: 'Paris', country: 'France' }, 48.844, 2.374),
  place('Gare Part-Dieu', { street: '5 Place Charles Béraudier', postalCode: '69003', city: 'Lyon', country: 'France' }, 45.761, 4.86),
  place('21 Baker Lane', { street: '21 Baker Lane', postalCode: 'NW1 6XE', city: 'London', country: 'United Kingdom' }, 51.523, -0.158),
  { label: 'Lyon, France', name: 'Lyon', detail: 'Auvergne-Rhône-Alpes, France', street: '', postalCode: '', city: 'Lyon', region: 'Auvergne-Rhône-Alpes', country: 'France', lat: 45.758, lon: 4.835 },
  { label: 'Lisbonne, Portugal', name: 'Lisbonne', detail: 'Portugal', street: '', postalCode: '', city: 'Lisbonne', region: '', country: 'Portugal', lat: 38.722, lon: -9.139 },
  { label: 'Paris, France', name: 'Paris', detail: 'Île-de-France, France', street: '', postalCode: '', city: 'Paris', region: 'Île-de-France', country: 'France', lat: 48.857, lon: 2.352 },
];

/** The places whose words start as the typed ones do; the request as the server reads it. */
export function fakePlaces(url: URL): Response {
  const request = parsePlacesRequest(Object.fromEntries(url.searchParams));
  const words = request ? foldText(request.q).split(/[\s,]+/).filter(Boolean) : [];
  const places = words.length
    ? PLACES.filter(each => {
        const starts = foldText(each.label).split(/[\s,'’-]+/);
        return words.every(word => starts.some(start => start.startsWith(word)));
      }).slice(0, 6)
    : [];
  return new Response(JSON.stringify({ places }), { status: 200, headers: { 'content-type': 'application/json' } });
}
