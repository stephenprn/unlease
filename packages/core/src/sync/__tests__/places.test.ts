import { describe, expect, it } from 'vitest';

import { knownPlaces, parsePlacesRequest, placeFromLine, placesQuery, readPlaces } from '../places';

describe('places', () => {
  it('reads a request from an address, three letters at least', () => {
    expect(parsePlacesRequest({ q: '  12  rue ', lang: 'en', lat: '45.7', lon: '4.8' })).toEqual({ q: '12 rue', lang: 'en', near: { lat: 45.7, lon: 4.8 } });
    expect(parsePlacesRequest({ q: 'ly' })).toBeNull();
    expect(parsePlacesRequest({ q: 'lyon', lang: 'xx', lat: '200', lon: '4' })).toEqual({ q: 'lyon', lang: 'fr', near: null });
    expect(placesQuery({ q: 'gare de lyon', lang: 'fr', near: null })).toBe('q=gare+de+lyon&lang=fr');
  });

  it('reads the places of an answer, those that hold something', () => {
    const places = readPlaces({ places: [{ name: '12 Rue des Lilas', street: '12 Rue des Lilas', postalCode: '69003', city: 'Lyon', country: 'France', lat: 45.7, lon: 4.8 }, { name: '' }, null] });
    expect(places).toEqual([{ label: '12 Rue des Lilas, 69003 Lyon, France', name: '12 Rue des Lilas', detail: '69003 Lyon, France', street: '12 Rue des Lilas', postalCode: '69003', city: 'Lyon', region: '', country: 'France', lat: 45.7, lon: 4.8 }]);
    expect(readPlaces({})).toEqual([]);
  });

  it('offers the known places that answer the words typed, the most used first, each once', () => {
    const known = [placeFromLine('Arkose Montreuil, Montreuil'), placeFromLine('12 rue des Lilas, 69003 Lyon'), placeFromLine('Visio'), placeFromLine('12 rue des Lilas, 69003 Lyon'), placeFromLine('12 Rue des lilas,  69003 Lyon')];
    expect(knownPlaces(known, '').map(place => place.label)).toEqual(['12 rue des Lilas, 69003 Lyon', 'Arkose Montreuil, Montreuil', 'Visio']);
    expect(knownPlaces(known, 'lil ly').map(place => place.name)).toEqual(['12 rue des Lilas']);
    expect(knownPlaces(known, 'montr').map(place => place.name)).toEqual(['Arkose Montreuil']);
    // What is typed already, word for word, is not offered back.
    expect(knownPlaces(known, 'Visio')).toEqual([]);
  });
});
