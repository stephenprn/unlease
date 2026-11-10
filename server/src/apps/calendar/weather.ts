/**
 * The weather on the days ahead for a place (`GET /api/calendar/weather`): Open-Meteo, open data and
 * no key, through the suite's guarded reader. The place is found by its whole name, else by its last
 * part (« 12 rue de la Paix, Lyon » finds Lyon); then the daily forecast for 16 days. Kept three
 * hours per place.
 */
import type { WeatherDay, WeatherResponse } from '@unlease/calendar/sync/routes';
import type { Fetcher } from '../../reading/fetcher';

const TTL_MS = 3 * 3_600_000;
const KEPT_MAX = 200;
const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

export class WeatherUnreachable extends Error {}

interface Place {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}

export class WeatherService {
  private readonly kept = new Map<string, { readonly at: number; readonly answer: WeatherResponse }>();
  private readonly running = new Map<string, Promise<WeatherResponse>>();

  constructor(
    private readonly fetcher: Fetcher,
    private readonly now: () => number,
  ) {}

  private async json(url: string): Promise<Record<string, unknown>> {
    let response;
    try {
      response = await this.fetcher.fetch(url, { headers: { accept: 'application/json' }, maxBytes: 1024 * 1024, timeoutMs: 15_000 });
    } catch {
      throw new WeatherUnreachable('Météo injoignable');
    }
    if (response.status < 200 || response.status >= 300) throw new WeatherUnreachable('Météo injoignable');
    try {
      const body = JSON.parse(response.body.toString('utf8')) as unknown;
      return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    } catch {
      throw new WeatherUnreachable('Météo injoignable');
    }
  }

  private async find(name: string): Promise<Place | null> {
    const body = await this.json(`${GEOCODING}?name=${encodeURIComponent(name)}&count=1&language=fr&format=json`);
    const first = Array.isArray(body.results) ? (body.results[0] as Record<string, unknown> | undefined) : undefined;
    if (!first || typeof first.latitude !== 'number' || typeof first.longitude !== 'number') return null;
    const label = [first.name, first.country].filter(part => typeof part === 'string' && part).join(', ');
    return { name: label, latitude: first.latitude, longitude: first.longitude };
  }

  /** The forecast for a place, or no days when it is nowhere to be found. */
  forecast(place: string): Promise<WeatherResponse> {
    const key = place.trim().toLowerCase().replace(/\s+/g, ' ');
    const kept = this.kept.get(key);
    if (kept && this.now() - kept.at < TTL_MS) return Promise.resolve(kept.answer);
    const running = this.running.get(key);
    if (running) return running;
    const job = this.read(place.trim())
      .then(answer => {
        if (this.kept.size >= KEPT_MAX) this.kept.delete(this.kept.keys().next().value!);
        this.kept.set(key, { at: this.now(), answer });
        return answer;
      })
      .finally(() => this.running.delete(key));
    this.running.set(key, job);
    return job;
  }

  private async read(place: string): Promise<WeatherResponse> {
    const parts = place.split(',').map(part => part.trim()).filter(Boolean);
    const tries = [...new Set([place, parts[parts.length - 1] ?? '', parts[parts.length - 1]?.replace(/^\d{4,5}\s+/, '') ?? ''].filter(Boolean))];
    let found: Place | null = null;
    for (const name of tries) {
      found = await this.find(name);
      if (found) break;
    }
    if (!found) return { place: '', days: [] };
    const body = await this.json(
      `${FORECAST}?latitude=${found.latitude}&longitude=${found.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`,
    );
    const daily = (body.daily ?? {}) as Record<string, unknown>;
    const list = (name: string): unknown[] => (Array.isArray(daily[name]) ? (daily[name] as unknown[]) : []);
    const number = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
    const days: WeatherDay[] = list('time').flatMap((day, index) =>
      typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
        ? [{ day, code: number(list('weather_code')[index]), max: number(list('temperature_2m_max')[index]), min: number(list('temperature_2m_min')[index]), rain: number(list('precipitation_probability_max')[index]) }]
        : [],
    );
    return { place: found.name, days };
  }
}
