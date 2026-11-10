/**
 * The weather at a place for the days ahead (`GET /api/calendar/weather`, Open-Meteo through the
 * server), kept a few hours in memory by place; a day's places tried in order until one is found
 * (« Visio » gives way to home); nothing without a server, with the setting off, or for a day more
 * than 16 days away.
 */
import { useEffect, useState } from 'react';

import type { WeatherDay } from '@unlease/calendar/sync/routes';
import { selectServer, useSettingsStore, type ServerConfig } from '@shared/app/store/settingsStore';

import { selectPrefs, useCalendarUiStore } from '../store/calendarUi';
import { fetchWeather } from '../sync/transport';

const KEPT_MS = 3 * 3_600_000;
/** What the forecast said of a place: the name it found it under ('' when nowhere) and its days. */
interface Kept {
  readonly at: number;
  readonly place: string;
  readonly days: readonly WeatherDay[];
}
const cache = new Map<string, Kept>();

/** A day's weather and the place it is for (the name the forecast found, else the one asked). */
export interface PlacedWeather {
  readonly place: string;
  readonly day: WeatherDay;
}

/** Test seam. */
export function forgetWeather(): void {
  cache.clear();
}

const keyOf = (place: string): string => place.trim().toLowerCase();

function keptFor(place: string): Kept | null {
  const kept = cache.get(keyOf(place));
  return kept && Date.now() - kept.at < KEPT_MS ? kept : null;
}

/** `day` at the first of `places` the forecast finds, from what is kept only. */
function keptWeather(places: readonly string[], day: string): PlacedWeather | null {
  for (const place of places) {
    const kept = keptFor(place);
    if (!kept) return null;
    const weather = kept.days.find(each => each.day === day);
    if (weather) return { place: kept.place || place.trim(), day: weather };
  }
  return null;
}

/** `day` at the first of `places` the forecast finds, asking for those not kept; null when none has it. */
async function firstWeather(server: ServerConfig, places: readonly string[], day: string, signal?: AbortSignal): Promise<PlacedWeather | null> {
  for (const place of places) {
    let kept = keptFor(place);
    if (!kept) {
      const answer = await fetchWeather(server, place.trim(), signal);
      kept = { at: Date.now(), place: answer?.place ?? '', days: answer?.days ?? [] };
      cache.set(keyOf(place), kept);
    }
    const weather = kept.days.find(each => each.day === day);
    if (weather) return { place: kept.place || place.trim(), day: weather };
  }
  return null;
}

/**
 * Today's forecast without a screen (« Aujourd'hui »'s widget) at the first of `places` the forecast
 * finds, the ones kept while fresh (and kept for the screens too); null without a server, the
 * setting off, or when it cannot be had.
 */
export async function weatherOf(places: readonly string[], day: string): Promise<PlacedWeather | null> {
  const server = useSettingsStore.getState().server;
  if (!server || !useCalendarUiStore.getState().prefs.weather || places.length === 0) return null;
  try {
    return await firstWeather(server, places, day);
  } catch {
    return null;
  }
}

/** The forecast of `day` at the first of `places` the forecast finds (an event's own place, or « Aujourd'hui »'s tries), or null. */
export function useWeather(places: string | readonly string[], day: string): PlacedWeather | null {
  const server = useSettingsStore(selectServer);
  const on = useCalendarUiStore(selectPrefs).weather;
  // The places as one string: the effect follows what is asked, not the array it came in.
  const key = (typeof places === 'string' ? [places] : places)
    .map(place => place.trim())
    .filter(Boolean)
    .join('\n');
  const [found, setFound] = useState<{ readonly key: string; readonly weather: PlacedWeather | null }>(() => ({ key: `${day}|${key}`, weather: keptWeather(key ? key.split('\n') : [], day) }));
  useEffect(() => {
    const asked = `${day}|${key}`;
    if (!server || !on || !key || !day) {
      setFound({ key: asked, weather: null });
      return undefined;
    }
    const abort = new AbortController();
    firstWeather(server, key.split('\n'), day, abort.signal)
      .then(weather => {
        if (!abort.signal.aborted) setFound({ key: asked, weather });
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, [server, on, key, day]);
  return on && found.key === `${day}|${key}` ? found.weather : null;
}
