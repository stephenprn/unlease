/**
 * Places found as they are typed (`GET /api/places`, `core/sync/places`), asked of the server with a
 * short pause after the last key, each answer kept for the page's life so typing back finds it again.
 */
import { getLocale } from '@unlease/core/i18n';
import { isPlacesResponse, PLACE_QUERY_MIN, PLACES_PATH, placesQuery, readPlaces, type Place } from '@unlease/core/sync/places';

import type { ServerConfig } from './store/settings';
import { getJson } from './sync/transport';

const kept = new Map<string, readonly Place[]>();

const keyOf = (typed: string): string => `${getLocale()}|${typed.replace(/\s+/g, ' ').trim().toLowerCase()}`;

/** The places already found for what is typed; undefined until asked. */
export function placesFound(typed: string): readonly Place[] | undefined {
  return kept.get(keyOf(typed));
}

/** The places that answer what is typed (nothing under three letters). */
export async function findPlaces(config: ServerConfig, typed: string, signal?: AbortSignal): Promise<readonly Place[]> {
  const q = typed.replace(/\s+/g, ' ').trim();
  if (q.length < PLACE_QUERY_MIN) return [];
  const key = keyOf(q);
  const known = kept.get(key);
  if (known) return known;
  const places = await getJson(config, `${PLACES_PATH}?${placesQuery({ q, lang: getLocale(), near: null })}`, value => (isPlacesResponse(value) ? readPlaces(value) : null), signal);
  if (kept.size > 300) kept.delete(kept.keys().next().value!);
  kept.set(key, places);
  return places;
}
