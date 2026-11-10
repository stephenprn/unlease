/**
 * The weather of the days shown (Open-Meteo's forecast through the server, `GET /api/calendar/weather`),
 * at the first of a day's places the forecast finds (its events', then the one chosen in Réglages):
 * asked once per place and visit, quiet when it cannot be (no server, offline, nowhere found, past 16 days).
 */
import { useEffect, useMemo, useState } from 'react';

import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { weatherTries } from '@unlease/calendar/services/weather';
import type { WeatherDay, WeatherResponse } from '@unlease/calendar/sync/routes';

import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { fetchWeather } from '../api';
import { usePrefsStore } from '../store/prefs';

const asked = new Map<string, Promise<WeatherResponse | null>>();
// What joins a day to its places, and one day to the next, in the effect's key.
const FIELD = '\u001f';
const ENTRY = '\u001e';
const NONE: ReadonlyMap<string, { readonly place: string; readonly day: WeatherDay }> = new Map();

function forecast(key: string, run: () => Promise<WeatherResponse>): Promise<WeatherResponse | null> {
  let found = asked.get(key);
  if (!found) {
    found = run().catch(() => null);
    asked.set(key, found);
  }
  return found;
}

/** Test seam: forget what was asked. */
export const resetWeather = (): void => asked.clear();

/** The weather of each day shown that has one: the place it is for, and the day's forecast. */
export function useWeather(days: readonly string[], items: readonly Occurrence[]): ReadonlyMap<string, { readonly place: string; readonly day: WeatherDay }> {
  const server = useSettingsStore(selectServer);
  const on = usePrefsStore(s => s.weather);
  const home = usePrefsStore(s => s.homePlace);
  // Each day's places in the order they are tried (`weatherTries`): its events', then home.
  const tries = useMemo(() => {
    const out = new Map<string, readonly string[]>();
    for (const day of days) {
      const places = weatherTries(
        items.filter(item => item.firstDay <= day && item.lastDay >= day).map(item => item.event.place),
        home,
      );
      if (places.length > 0) out.set(day, places);
    }
    return out;
  }, [days, items, home]);
  // The days and their places as one string: the effect follows what is asked, not the arrays it came in.
  const key = [...tries.entries()].map(([day, places]) => `${day}${FIELD}${places.join(FIELD)}`).join(ENTRY);
  const [found, setFound] = useState<{ key: string; days: Map<string, { place: string; day: WeatherDay }> } | null>(null);
  useEffect(() => {
    if (!server || !on || !key) return;
    let alive = true;
    const asked = key.split(ENTRY).map(entry => entry.split(FIELD));
    // A day takes the first of its places the forecast finds; each place is asked once whatever the days.
    const dayWeather = async ([day, ...places]: string[]): Promise<readonly [string, { place: string; day: WeatherDay }] | null> => {
      for (const place of places) {
        const answer = await forecast(`${server.url}|${place}`, () => fetchWeather(server, place));
        const weather = answer?.days.find(each => each.day === day);
        if (weather) return [day!, { place: answer!.place || place, day: weather }];
      }
      return null;
    };
    void Promise.all(asked.map(dayWeather)).then(answers => {
      if (alive) setFound({ key, days: new Map(answers.filter(answer => answer !== null)) });
    });
    return () => {
      alive = false;
    };
  }, [server, on, key]);
  return on && found?.key === key ? found.days : NONE;
}
