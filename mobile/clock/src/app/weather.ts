/**
 * The weather as an alarm rings (`GET /api/clock/weather`, Open-Meteo through the server): where the
 * phone is (the place Android last knew, coarse, while « Météo pour » is « Ici » and the location is
 * allowed), else the place chosen in Réglages. It is asked ahead (the app in front, the hourly refresh
 * with the app closed, so the evening before) and again as an alarm rings when a network is there, and
 * kept in the app's preferences: a ring with no network still shows the morning's forecast.
 *
 * Android gives the place only to an app in front (a background location grant is never asked): what
 * the phone said last is remembered, and the hourly refresh asks for it.
 */
import { CLOCK_WEATHER_PATH, readWeather, roundCoordinate, type ClockWeatherResponse } from '@unlease/clock/sync/routes';
import { WEATHER_FRESH_MS } from '@unlease/clock/services/weather';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { getFromServer } from '@shared/app/sync/transport';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';
import { whereabouts } from '@platform/alarmEngine';

import { useClockUiStore } from './store/clockUi';

const KEPT = 'clock.weather';
const PLACE = 'clock.lastPlace';

interface Kept {
  readonly lat: number;
  readonly lon: number;
  readonly answer: ClockWeatherResponse;
}

interface Spot {
  readonly lat: number;
  readonly lon: number;
}

function readKept(): Kept | null {
  const raw = readPreferences()[KEPT] as Partial<Kept> | undefined;
  if (!raw || typeof raw.lat !== 'number' || typeof raw.lon !== 'number') return null;
  const answer = readWeather(raw.answer);
  return answer ? { lat: raw.lat, lon: raw.lon, answer } : null;
}

/** What was kept of the last forecast (any age: `weatherAt` leaves out what is too old). */
export function keptWeather(): ClockWeatherResponse | null {
  return readKept()?.answer ?? null;
}

/** Where to ask: here (and remember it), else where the phone was last seen, else the place chosen. */
async function spot(): Promise<Spot | null> {
  const prefs = useClockUiStore.getState().prefs;
  if (prefs.weatherWhere === 'phone') {
    const here = await whereabouts();
    if (here) {
      const rounded = { lat: roundCoordinate(here.lat), lon: roundCoordinate(here.lon) };
      writePreference(PLACE, rounded);
      return rounded;
    }
    const last = readPreferences()[PLACE] as Partial<Spot> | undefined;
    if (last && typeof last.lat === 'number' && typeof last.lon === 'number') return { lat: last.lat, lon: last.lon };
  }
  return prefs.weatherPlace ? { lat: roundCoordinate(prefs.weatherPlace.lat), lon: roundCoordinate(prefs.weatherPlace.lon) } : null;
}

let asking: Promise<ClockWeatherResponse | null> | null = null;

/**
 * Asks the forecast again when the kept one is older than a few hours or for another place (`force`:
 * whatever its age, as an alarm rings), within `timeoutMs`; answers what is kept when it cannot.
 */
export function refreshWeather({ force = false, timeoutMs = 15_000 }: { readonly force?: boolean; readonly timeoutMs?: number } = {}): Promise<ClockWeatherResponse | null> {
  asking ??= (async () => {
    const kept = readKept();
    const server = selectServer(useSettingsStore.getState());
    const where = await spot();
    if (!server || !where) return kept?.answer ?? null;
    const samePlace = kept !== null && kept.lat === where.lat && kept.lon === where.lon;
    if (!force && samePlace && Date.now() - kept.answer.at < WEATHER_FRESH_MS) return kept.answer;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const answer = await getFromServer(server, `${CLOCK_WEATHER_PATH}?lat=${where.lat}&lon=${where.lon}`, readWeather, controller.signal, timeoutMs);
      writePreference(KEPT, { lat: where.lat, lon: where.lon, answer });
      return answer;
    } catch {
      return samePlace ? kept.answer : (kept?.answer ?? null);
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => {
    asking = null;
  });
  return asking;
}
