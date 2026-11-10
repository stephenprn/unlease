/** `GET /api/places?q=…&lang=…`: places that answer what is typed (`finder.ts`), for every app that asks for one. */
import type { Hono } from 'hono';
import { parsePlacesRequest, PLACES_PATH } from '@unlease/core/sync/places';
import type { Env } from '../apps/types';
import type { PlaceFinder } from './finder';

export function placesRoute(app: Hono<Env>, { places }: { readonly places: PlaceFinder }): void {
  app.get(PLACES_PATH, async c => {
    const request = parsePlacesRequest({ q: c.req.query('q'), lang: c.req.query('lang'), lat: c.req.query('lat'), lon: c.req.query('lon') });
    if (!request) return c.json({ places: [] }, 200);
    try {
      return c.json(await places.find(request), 200, { 'Cache-Control': 'private, max-age=86400' });
    } catch {
      return c.json({ error: 'Recherche de lieux injoignable' }, 502);
    }
  });
}
