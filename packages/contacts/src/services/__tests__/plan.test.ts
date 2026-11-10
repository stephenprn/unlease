import { describe, expect, it } from 'vitest';

import { addressPlace, directionsUrl, lineDirectionsUrl, OFFERED_MAP_APPS } from '../addresses';
import { addressPlan } from '../plan';

describe('an address’s plan', () => {
  it('is the same for the same address, and another for another', () => {
    const one = addressPlan('12 rue des Lilas, 69003 Lyon, France');
    expect(addressPlan(' 12 RUE des Lilas, 69003 Lyon, France ')).toEqual(one);
    expect(addressPlan('8 quai de la Gare, 75013 Paris, France')).not.toEqual(one);
  });

  it('always has its two avenues and a few streets, drawn in numbers', () => {
    for (const key of ['a', 'b', 'Lyon', '21 Baker Lane, London', '']) {
      const plan = addressPlan(key);
      expect(plan.streets.length).toBeGreaterThanOrEqual(5);
      expect(plan.streets[0]!.width).toBeGreaterThan(plan.streets.at(-1)!.width);
      for (const street of plan.streets) expect(street.d).toMatch(/^M-?[\d.]+ -?[\d.]+ L-?[\d.]+ -?[\d.]+$/);
      if (plan.park) expect(plan.park).toMatch(/^M.* Z$/);
    }
  });
});

describe('an address on a map', () => {
  const lyon = { street: '12 rue des Lilas\nBâtiment B', postalCode: '69003', city: 'Lyon', region: '', country: 'France' };

  it('offers Google Maps then OpenStreetMap, each with its way there', () => {
    expect(OFFERED_MAP_APPS).toEqual(['google', 'openstreetmap']);
    expect(directionsUrl(lyon, 'google')).toBe('https://www.google.com/maps/dir/?api=1&destination=12%20rue%20des%20Lilas%2C%20B%C3%A2timent%20B%2C%2069003%20Lyon%2C%20France');
    expect(directionsUrl(lyon, 'openstreetmap')).toContain('https://www.openstreetmap.org/directions?to=12%20rue');
    expect(lineDirectionsUrl('  ')).toBeNull();
  });

  it('is a place the place field offers: its first line as its name', () => {
    expect(addressPlace(lyon)).toEqual({
      label: '12 rue des Lilas, Bâtiment B, 69003 Lyon, France',
      name: '12 rue des Lilas',
      detail: '69003 Lyon, France',
      street: '12 rue des Lilas',
      postalCode: '69003',
      city: 'Lyon',
      region: '',
      country: 'France',
      lat: null,
      lon: null,
    });
    expect(addressPlace({ street: '', postalCode: '', city: '', region: '', country: '' })).toBeNull();
  });
});
