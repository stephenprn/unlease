/**
 * The weather as an alarm rings, from what the phone kept (`ClockWeatherResponse`): the hour it rings
 * in, the day's highs and lows and its chance of rain, and how it reads (« 12° · Nuageux »). An answer
 * older than a day says nothing.
 */
import { t } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import { WEATHER_WORDS, temperatures, weatherKind, type WeatherKind } from '@unlease/calendar/services/weather';
import type { ClockWeatherResponse, WeatherDaily, WeatherHour } from '../sync/routes';

/** A forecast older than this is not shown. */
export const WEATHER_STALE_MS = 24 * 3_600_000;
/** The phone asks again after this long (the evening before, and as an alarm rings). */
export const WEATHER_FRESH_MS = 3 * 3_600_000;

export interface MorningWeather {
  readonly now: WeatherHour | null;
  readonly day: WeatherDaily | null;
  readonly kind: WeatherKind;
}

/** What the forecast says for the moment `at` (an alarm ringing): its hour, and its day. */
export function weatherAt(weather: ClockWeatherResponse | null, at: number, day: string): MorningWeather | null {
  if (!weather || at - weather.at > WEATHER_STALE_MS) return null;
  let now: WeatherHour | null = null;
  for (const hour of weather.hours) if (hour.at <= at && at - hour.at < 3_600_000) now = hour;
  const daily = weather.days.find(entry => entry.day === day) ?? null;
  if (!now && !daily) return null;
  return { now, day: daily, kind: weatherKind((now ?? daily)!.code) };
}

/** « 12° · Nuageux ». */
export function nowWords(weather: MorningWeather): string {
  const words = WEATHER_WORDS[weather.kind];
  return weather.now ? `${Math.round(weather.now.temp)}° · ${words}` : words;
}

/** « 17° / 9° · 40 % de pluie ». */
export function dayWords(daily: WeatherDaily): string {
  const range = temperatures(daily.max, daily.min);
  return daily.rain >= 20 ? `${range} · ${t('{chance}% chance of rain', { chance: Math.round(daily.rain) })}` : range;
}

/** Each kind's Onde glyph (the cloud raised over its rain, its snow, its storm). */
export const WEATHER_GLYPHS: Readonly<Record<WeatherKind, GlyphName>> = { clear: 'sun', cloudy: 'cloud', fog: 'fog', rain: 'rain', snow: 'snow', storm: 'storm' };

export { weatherKind, type WeatherKind };
