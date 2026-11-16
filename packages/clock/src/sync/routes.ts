/**
 * Clock's server route: the weather where the phone is as an alarm rings (`GET /api/clock/weather`),
 * Open-Meteo's open data asked by the server (so no device talks to it), by coordinates rounded to
 * about a kilometre: the current hour, the day's highs and lows, and the next hours, for the phone to
 * keep (fetched the evening before and again as it rings, when a network is there).
 */
export const CLOCK_WEATHER_PATH = '/api/clock/weather';

export interface ClockWeatherRequest {
  readonly lat: number;
  readonly lon: number;
}

export interface WeatherHour {
  /** The hour's start, as an instant. */
  readonly at: number;
  readonly temp: number;
  /** WMO's weather code. */
  readonly code: number;
  /** Chance of rain, %. */
  readonly rain: number;
}

export interface WeatherDaily {
  /** `2026-11-17`, in the place's zone. */
  readonly day: string;
  readonly code: number;
  readonly max: number;
  readonly min: number;
  readonly rain: number;
}

export interface ClockWeatherResponse {
  /** When the server read it. */
  readonly at: number;
  readonly hours: readonly WeatherHour[];
  readonly days: readonly WeatherDaily[];
}

/** About a kilometre: enough for a forecast, and what the server keeps and passes on says no more of where the phone is. */
export const roundCoordinate = (value: number): number => Math.round(value * 100) / 100;

export function parseWeatherRequest(raw: { readonly lat?: unknown; readonly lon?: unknown }): ClockWeatherRequest | null {
  const lat = typeof raw.lat === 'string' ? Number(raw.lat) : raw.lat;
  const lon = typeof raw.lon === 'string' ? Number(raw.lon) : raw.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: roundCoordinate(lat), lon: roundCoordinate(lon) };
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** An answer as a client reads it back (from the server, or as it kept it): what is wrong is left out. */
export function readWeather(value: unknown): ClockWeatherResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (!isNumber(raw.at) || !Array.isArray(raw.hours) || !Array.isArray(raw.days)) return null;
  const hours = raw.hours.flatMap(entry => {
    const h = entry as Record<string, unknown>;
    return isNumber(h.at) && isNumber(h.temp) && isNumber(h.code) && isNumber(h.rain) ? [{ at: h.at, temp: h.temp, code: h.code, rain: h.rain }] : [];
  });
  const days = raw.days.flatMap(entry => {
    const d = entry as Record<string, unknown>;
    return typeof d.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.day) && isNumber(d.code) && isNumber(d.max) && isNumber(d.min) && isNumber(d.rain)
      ? [{ day: d.day, code: d.code, max: d.max, min: d.min, rain: d.rain }]
      : [];
  });
  return { at: raw.at, hours, days };
}
