/**
 * The weather where a phone wakes up (`GET /api/clock/weather?lat=&lon=`): Open-Meteo, open data
 * and no key, asked by the server through the suite's guarded reader, so no device talks to it. The
 * phone sends where it is rounded to about a kilometre (or the place chosen in its Réglages); the
 * answer is the hours of today and tomorrow (temperature, weather code, chance of rain) and both
 * days' highs and lows, which the phone keeps and reads as an alarm rings, network or not. Kept an
 * hour per place.
 */
import type { ClockWeatherRequest, ClockWeatherResponse, WeatherDaily, WeatherHour } from '@unlease/clock/sync/routes';
import type { Fetcher } from '../../reading/fetcher';

const TTL_MS = 3_600_000;
const KEPT_MAX = 200;
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

export class ClockWeatherUnreachable extends Error {}

const number = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Open-Meteo's answer as Clock reads it: its local hours turned into instants with the place's offset. */
export function readForecast(body: Record<string, unknown>, at: number): ClockWeatherResponse {
  const offsetMs = (number(body.utc_offset_seconds) ?? 0) * 1000;
  const instant = (local: unknown): number | null => (typeof local === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? Date.parse(`${local}:00Z`) - offsetMs : null);
  const hourly = (body.hourly ?? {}) as Record<string, unknown>;
  const daily = (body.daily ?? {}) as Record<string, unknown>;
  const list = (from: Record<string, unknown>, name: string): unknown[] => (Array.isArray(from[name]) ? (from[name] as unknown[]) : []);
  const hours: WeatherHour[] = list(hourly, 'time').flatMap((time, index) => {
    const start = instant(time);
    const temp = number(list(hourly, 'temperature_2m')[index]);
    const code = number(list(hourly, 'weather_code')[index]);
    if (start === null || temp === null || code === null) return [];
    return [{ at: start, temp, code, rain: number(list(hourly, 'precipitation_probability')[index]) ?? 0 }];
  });
  const days: WeatherDaily[] = list(daily, 'time').flatMap((day, index) => {
    const max = number(list(daily, 'temperature_2m_max')[index]);
    const min = number(list(daily, 'temperature_2m_min')[index]);
    const code = number(list(daily, 'weather_code')[index]);
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || max === null || min === null || code === null) return [];
    return [{ day, code, max, min, rain: number(list(daily, 'precipitation_probability_max')[index]) ?? 0 }];
  });
  return { at, hours, days };
}

export class ClockWeather {
  private readonly kept = new Map<string, { readonly at: number; readonly answer: ClockWeatherResponse }>();
  private readonly running = new Map<string, Promise<ClockWeatherResponse>>();

  constructor(
    private readonly fetcher: Fetcher,
    private readonly now: () => number,
  ) {}

  forecast(request: ClockWeatherRequest): Promise<ClockWeatherResponse> {
    const key = `${request.lat},${request.lon}`;
    const kept = this.kept.get(key);
    if (kept && this.now() - kept.at < TTL_MS) return Promise.resolve(kept.answer);
    const running = this.running.get(key);
    if (running) return running;
    const job = this.read(request)
      .then(answer => {
        if (this.kept.size >= KEPT_MAX) this.kept.delete(this.kept.keys().next().value!);
        this.kept.set(key, { at: this.now(), answer });
        return answer;
      })
      .finally(() => this.running.delete(key));
    this.running.set(key, job);
    return job;
  }

  private async read({ lat, lon }: ClockWeatherRequest): Promise<ClockWeatherResponse> {
    const url =
      `${FORECAST}?latitude=${lat}&longitude=${lon}` +
      '&hourly=temperature_2m,weather_code,precipitation_probability' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&timezone=auto&forecast_days=2';
    let response;
    try {
      response = await this.fetcher.fetch(url, { headers: { accept: 'application/json' }, maxBytes: 512 * 1024, timeoutMs: 15_000 });
    } catch {
      throw new ClockWeatherUnreachable('Météo injoignable');
    }
    if (response.status < 200 || response.status >= 300) throw new ClockWeatherUnreachable('Météo injoignable');
    let body: unknown;
    try {
      body = JSON.parse(response.body.toString('utf8'));
    } catch {
      throw new ClockWeatherUnreachable('Météo injoignable');
    }
    return readForecast(typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}, this.now());
  }
}
