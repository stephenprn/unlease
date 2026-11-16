/**
 * Clock's route, beside the platform's under `/api` and behind the same token, answered while Clock
 * is on: the weather where a phone wakes up (`weather.ts`).
 */
import type { Hono } from 'hono';
import { CLOCK_WEATHER_PATH, parseWeatherRequest } from '@unlease/clock/sync/routes';
import type { Env } from '../types';
import type { ClockWeather } from './weather';

export function clockRoutes(app: Hono<Env>, { weather }: { readonly weather: ClockWeather }): void {
  app.get(CLOCK_WEATHER_PATH, async c => {
    const request = parseWeatherRequest({ lat: c.req.query('lat'), lon: c.req.query('lon') });
    if (!request) return c.json({ error: 'Lieu invalide' }, 400);
    try {
      return c.json(await weather.forecast(request), 200, { 'Cache-Control': 'private, max-age=900' });
    } catch {
      return c.json({ error: 'Météo injoignable' }, 502);
    }
  });
}
