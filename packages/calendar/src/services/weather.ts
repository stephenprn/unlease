/**
 * The weather an event's day may have (Open-Meteo's daily forecast, `GET /api/calendar/weather`): its
 * WMO code as a word and a glyph, the highs and lows. Shown on the day and week views and in an
 * event with a place, up to 16 days ahead.
 */
import { localized, tx } from '@unlease/core/i18n';

export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

/** WMO's weather codes, grouped as people say them. */
export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'rain';
}

export const WEATHER_WORDS: Readonly<Record<WeatherKind, string>> = localized({
  clear: tx('Ensoleillé'),
  cloudy: tx('Nuageux'),
  fog: tx('Brouillard'),
  rain: tx('Pluie'),
  snow: tx('Neige'),
  storm: tx('Orage'),
});

/** « 18° / 9° ». */
export const temperatures = (max: number, min: number): string => `${Math.round(max)}° / ${Math.round(min)}°`;

/** How many of a day's event places are tried for its weather before the person's own. */
export const WEATHER_TRIES = 3;

/**
 * Where a day's weather is asked, in order: its events' places (each once, the first few), then the
 * person's own. The first the forecast finds is the day's, so a place no map knows (« Visio »,
 * « Salle 3 ») gives way to the next instead of leaving the day without weather.
 */
export function weatherTries(places: readonly string[], home: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (place: string): void => {
    const clean = place.trim();
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };
  for (const place of places) {
    if (out.length >= WEATHER_TRIES) break;
    add(place);
  }
  add(home);
  return out;
}
