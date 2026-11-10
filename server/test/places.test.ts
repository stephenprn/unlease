import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { placeFromFeature } from '../src/places/finder';
import { AUTH, createTestServer, type TestServer } from './helpers';

const feature = (properties: Record<string, unknown>, coordinates = [4.85, 45.76]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties });

const PHOTON = {
  type: 'FeatureCollection',
  features: [
    feature({ housenumber: '12', street: 'Rue des Lilas', postcode: '69003', city: 'Lyon', state: 'Auvergne-Rhône-Alpes', country: 'France', countrycode: 'FR', type: 'house' }),
    feature({ name: 'Arkose Montreuil', housenumber: '33', street: 'Rue du Progrès', postcode: '93100', city: 'Montreuil', country: 'France', countrycode: 'FR', type: 'house', osm_key: 'leisure' }),
    feature({ name: '(double) Arkose Montreuil', housenumber: '33', street: 'Rue du Progrès', postcode: '93100', city: 'Montreuil', country: 'France', countrycode: 'FR', type: 'house' }),
    feature({ name: 'Lisbonne', country: 'Portugal', countrycode: 'PT', type: 'city', state: 'Lisbonne' }),
  ],
};

let server: TestServer | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

describe('places', () => {
  it('reads Photon’s features as places a person writes', () => {
    expect(placeFromFeature(PHOTON.features[0])).toMatchObject({ label: '12 Rue des Lilas, 69003 Lyon', name: '12 Rue des Lilas', detail: '69003 Lyon, France', street: '12 Rue des Lilas', postalCode: '69003', city: 'Lyon', country: 'France', lat: 45.76, lon: 4.85 });
    expect(placeFromFeature(PHOTON.features[1])).toMatchObject({ label: 'Arkose Montreuil, 33 Rue du Progrès, 93100 Montreuil', name: 'Arkose Montreuil' });
    expect(placeFromFeature(PHOTON.features[3])).toMatchObject({ label: 'Lisbonne, Portugal', name: 'Lisbonne', city: 'Lisbonne', street: '' });
    // A street then its number where that is how it is written.
    expect(placeFromFeature(feature({ housenumber: '5', street: 'Hauptstraße', postcode: '10115', city: 'Berlin', country: 'Deutschland', countrycode: 'DE', type: 'house' }))?.name).toBe('Hauptstraße 5');
    expect(placeFromFeature(feature({ type: 'house' }))).toBeNull();
  });

  it('answers through the server, twins once, kept a while', async () => {
    const asked: string[] = [];
    server = createTestServer({
      placesFetch: async input => {
        asked.push(String(input));
        return new Response(JSON.stringify(PHOTON), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    const response = await server.app.request('/api/places?q=arkose%20montreuil&lang=fr&lat=48.86&lon=2.44', { headers: AUTH });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { places: { label: string }[] };
    expect(body.places.map(place => place.label)).toEqual(['12 Rue des Lilas, 69003 Lyon', 'Arkose Montreuil, 33 Rue du Progrès, 93100 Montreuil', 'Lisbonne, Portugal']);
    expect(asked[0]).toContain('https://photon.example.org/api/?q=arkose+montreuil');
    expect(asked[0]).toContain('lang=fr');
    expect(asked[0]).toContain('lat=48.86');
    await server.app.request('/api/places?q=Arkose%20Montreuil&lang=fr&lat=48.86&lon=2.44', { headers: AUTH });
    expect(asked).toHaveLength(1);
    // Too short: nothing asked.
    expect(await (await server.app.request('/api/places?q=ar', { headers: AUTH })).json()).toEqual({ places: [] });
    expect(asked).toHaveLength(1);
    expect((await server.app.request('/api/places?q=arkose')).status).toBe(401);
  });

  it('says when the geocoder does not answer, and answers nothing when it is off', async () => {
    server = createTestServer({ placesFetch: () => Promise.reject(new TypeError('fetch failed')) });
    expect((await server.app.request('/api/places?q=lyon%20centre', { headers: AUTH })).status).toBe(502);
    server.close();
    server = createTestServer();
    expect(await (await server.app.request('/api/places?q=lyon%20centre', { headers: AUTH })).json()).toEqual({ places: [] });
  });

  it('reads its address from the environment', () => {
    expect(loadConfig({ UNLEASE_TOKEN: 't' }).placesUrl).toBe('https://photon.komoot.io');
    expect(loadConfig({ UNLEASE_TOKEN: 't', UNLEASE_PLACES_URL: 'http://192.168.1.20:2322/' }).placesUrl).toBe('http://192.168.1.20:2322');
    expect(loadConfig({ UNLEASE_TOKEN: 't', UNLEASE_PLACES_URL: 'off' }).placesUrl).toBeNull();
    expect(() => loadConfig({ UNLEASE_TOKEN: 't', UNLEASE_PLACES_URL: 'photon' })).toThrow(/UNLEASE_PLACES_URL/);
  });
});
