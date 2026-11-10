import { describe, expect, it } from 'vitest';

import { weatherKind, weatherTries, WEATHER_TRIES } from '../weather';

describe('weatherTries', () => {
  it('tries the events’ places once each, the first few, then home', () => {
    expect(weatherTries(['Visio', ' lyon ', 'Lyon', '', 'Lisbonne', 'Porto', 'Nice'], 'Paris')).toEqual(['Visio', 'lyon', 'Lisbonne', 'Paris']);
    expect(WEATHER_TRIES).toBe(3);
  });

  it('asks home once, and nothing when nothing is known', () => {
    expect(weatherTries(['Paris'], ' paris ')).toEqual(['Paris']);
    expect(weatherTries([], '')).toEqual([]);
  });
});

describe('weatherKind', () => {
  it('groups WMO codes as people say them', () => {
    expect([0, 2, 45, 61, 73, 95].map(weatherKind)).toEqual(['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm']);
  });
});
