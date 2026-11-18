/**
 * World clocks as both clients show them: each city's time (and its day, « Demain » when it is
 * already tomorrow there), how far it stands from here (« +8 h », « −5 h 30 », « Même heure »),
 * whether the sun is up there (counted from where it is, not guessed from the hour), the list from
 * west to east, and the search that finds a city in French or English, accents and case aside.
 *
 * Every time is counted with Agenda's zone helpers (`zoneOffset`, `instantToWall`), never with `Date`
 * in the device's zone. `at` is the moment shown: now, or the moment the comparison slider points at.
 */
import { getLocale, t } from '@unlease/core/i18n';
import { foldText } from '@unlease/core/services/search';
import { clockWords, longDay } from '@unlease/calendar/services/eventText';
import { daysBetween, instantToWall, isKnownZone, zoneOffset } from '@unlease/calendar/services/time';
import { allCities, COUNTRIES, type City } from '../data/cities';
import type { WorldClock } from '../models/worldClock';

const MINUTE = 60_000;
const MINUS = '−';

/** The device's zone counts as '' for Agenda's helpers. */
const here = '';

/** Minutes a city is ahead of the device at `at` (−300 in New York seen from Paris in winter). */
export function offsetFromHere(zone: string, at: number): number {
  return zoneOffset(at, zone) - zoneOffset(at, here);
}

/** « +8 h », « −5 h 30 », « +45 min », « Même heure ». */
export function offsetWords(minutes: number): string {
  if (minutes === 0) return t('Same time');
  const sign = minutes > 0 ? '+' : MINUS;
  const whole = Math.abs(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${sign}${t('{minutes} min', { minutes: rest })}`;
  return `${sign}${rest === 0 ? t('{hours} h', { hours }) : t('{hours} h {minutes}', { hours, minutes: String(rest).padStart(2, '0') })}`;
}

/** As TalkBack and a screen reader say it: « 8 heures d’avance », « 5 h 30 de retard ». */
export function offsetSentence(minutes: number): string {
  if (minutes === 0) return t('Same time as here');
  const whole = Math.abs(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  const span = hours === 0 ? t('{minutes} min', { minutes: rest }) : rest === 0 ? t('{hours} h', { hours }) : t('{hours} h {minutes}', { hours, minutes: String(rest).padStart(2, '0') });
  return minutes > 0 ? t('{span} ahead', { span }) : t('{span} behind', { span });
}

/** The city's wall time at `at` (`2026-11-18T23:41`). */
export const wallIn = (zone: string, at: number): string => instantToWall(at, zone);

/** Its time of day as the interface writes it (`23:41`, `11:41 PM`). */
export const clockIn = (zone: string, at: number, twelveHours = false): string => clockWords(wallIn(zone, at).slice(11, 16), twelveHours);

/** −1 yesterday there, 0 the same day, 1 tomorrow there. */
export function dayShift(zone: string, at: number): number {
  return Math.sign(daysBetween(instantToWall(at, here).slice(0, 10), wallIn(zone, at).slice(0, 10)));
}

/** « Aujourd’hui », « Demain », « Hier ». */
export function shiftWords(shift: number): string {
  if (shift > 0) return t('Tomorrow');
  if (shift < 0) return t('Yesterday');
  return t('Today');
}

/** What a city's card says under its name: « Demain · +8 h », or the gap alone on the same day (« −6 h »). */
export function cityMeta(zone: string, at: number): string {
  const shift = dayShift(zone, at);
  const gap = offsetWords(offsetFromHere(zone, at));
  return shift === 0 ? gap : `${shiftWords(shift)} · ${gap}`;
}

/** The day there, whole (« Jeudi 19 novembre »), for a screen reader. */
export const dayIn = (zone: string, at: number): string => longDay(wallIn(zone, at).slice(0, 10));

// ── daylight ────────────────────────────────────────────────────────────────

export type Daylight = 'day' | 'dusk' | 'night';

const RAD = Math.PI / 180;

/** The sun's height over the horizon at a place and an instant, in degrees (NOAA's short formulas: a degree is plenty). */
export function sunAltitude(lat: number, lon: number, at: number): number {
  const days = at / 86_400_000 - 10_957.5; // since J2000
  const meanLongitude = (280.46 + 0.9856474 * days) % 360;
  const meanAnomaly = ((357.528 + 0.9856003 * days) % 360) * RAD;
  const eclipticLongitude = (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * days) * RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude));
  const sidereal = (280.46061837 + 360.98564736629 * days + lon) % 360;
  const hourAngle = sidereal * RAD - rightAscension;
  const altitude = Math.asin(Math.sin(lat * RAD) * Math.sin(declination) + Math.cos(lat * RAD) * Math.cos(declination) * Math.cos(hourAngle));
  return altitude / RAD;
}

/** Day while the sun is up, dusk while it is just under (civil twilight), else night; without a place, the hour there says it (7 to 19). */
export function daylight(clock: Pick<WorldClock, 'zone' | 'lat' | 'lon'>, at: number): Daylight {
  if (clock.lat !== null && clock.lon !== null) {
    const altitude = sunAltitude(clock.lat, clock.lon, at);
    if (altitude > -0.83) return 'day';
    return altitude > -6 ? 'dusk' : 'night';
  }
  const hour = Number(wallIn(clock.zone, at).slice(11, 13));
  if (hour >= 7 && hour < 19) return 'day';
  return hour === 6 || hour === 19 ? 'dusk' : 'night';
}

export const DAYLIGHT_WORDS = {
  day: () => t('Daytime'),
  dusk: () => t('Twilight'),
  night: () => t('Night'),
} as const;

// ── the list ────────────────────────────────────────────────────────────────

/** West to east (as now), then by name: the order a day travels. */
export function byOffset(at: number) {
  const offsets = new Map<string, number>();
  const offsetOf = (zone: string): number => {
    let value = offsets.get(zone);
    if (value === undefined) {
      value = zoneOffset(at, zone);
      offsets.set(zone, value);
    }
    return value;
  };
  return (a: WorldClock, b: WorldClock): number => offsetOf(a.zone) - offsetOf(b.zone) || a.name.localeCompare(b.name) || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

export function liveWorldClocks(clocks: Readonly<Record<string, WorldClock>>, at: number): WorldClock[] {
  return Object.values(clocks)
    .filter(clock => clock.deletedAt === null)
    .sort(byOffset(at));
}

/** The country's name in the interface's language ('' unknown). */
export function countryName(code: string): string {
  const names = COUNTRIES[code];
  if (!names) return '';
  return getLocale() === 'fr' ? names[1] : names[0];
}

/** A city's name in the interface's language. */
export const cityName = (city: City): string => (getLocale() === 'fr' ? city.nameFr : city.name);

/** The city this device's zone is named after (« Paris » for Europe/Paris), else the zone's last part (« Buenos Aires »). */
export function zoneCityName(zone: string): string {
  const city = allCities().find(item => item.zone === zone && item.key.endsWith(`|${zone.split('/').at(-1)!.replace(/_/g, ' ')}`));
  if (city) return cityName(city);
  const named = allCities().find(item => item.zone === zone);
  if (named) return cityName(named);
  return zone.split('/').at(-1)!.replace(/_/g, ' ');
}

// ── the search ──────────────────────────────────────────────────────────────

export interface CityAnswer {
  readonly city: City;
  /** How well it fits: lower first. */
  readonly rank: number;
}

/**
 * The cities that fit what was typed, best first: a name (either language) that starts with it, then
 * a word of the name that does, then a country, then the zone's name (from four letters); at most `limit`. Nothing
 * typed: every city, by name. A city whose zone this platform does not know is left out.
 */
export function searchCities(typed: string, limit = 60): City[] {
  const query = foldText(typed.trim());
  const known = allCities().filter(city => isKnownZone(city.zone));
  if (!query) return [...known].sort((a, b) => cityName(a).localeCompare(cityName(b))).slice(0, limit);
  const answers: CityAnswer[] = [];
  for (const city of known) {
    const names = [foldText(city.name), foldText(city.nameFr)];
    const country = COUNTRIES[city.country] ?? ['', ''];
    let rank = Infinity;
    if (names.some(name => name.startsWith(query))) rank = 0;
    else if (names.some(name => name.split(/[\s\-’'().]+/).some(word => word.startsWith(query)))) rank = 1;
    else if (country.some(name => foldText(name).startsWith(query)) || city.country.toLowerCase() === query) rank = 2;
    // A zone's name only from four letters: « tok » should not bring Osaka for sharing Tokyo's zone.
    else if (query.length >= 4 && foldText(city.zone.replace(/_/g, ' ')).includes(query)) rank = 3;
    if (rank < Infinity) answers.push({ city, rank });
  }
  return answers
    .sort((a, b) => a.rank - b.rank || cityName(a.city).localeCompare(cityName(b.city)))
    .slice(0, limit)
    .map(answer => answer.city);
}

/** A new world clock's fields from a city of the table, named in the interface's language. */
export function cityFields(city: City, now: number): { zone: string; name: string; country: string; lat: number; lon: number; createdAt: number; deletedAt: null } {
  return { zone: city.zone, name: cityName(city), country: city.country, lat: city.lat, lon: city.lon, createdAt: now, deletedAt: null };
}

/** Whether this city is already among the clocks (its zone and name). */
export function hasCity(clocks: readonly WorldClock[], city: City): boolean {
  return clocks.some(clock => clock.zone === city.zone && (clock.name === city.name || clock.name === city.nameFr));
}

/** « Tokyo, 23:41, demain, 8 heures d’avance, nuit »: a card as one sentence. */
export function clockSentence(clock: Pick<WorldClock, 'zone' | 'name' | 'lat' | 'lon'>, at: number, twelveHours = false): string {
  return [clock.name, clockIn(clock.zone, at, twelveHours), dayIn(clock.zone, at), offsetSentence(offsetFromHere(clock.zone, at)), DAYLIGHT_WORDS[daylight(clock, at)]()].join(', ');
}

/** The comparison's words: « À 15:00 ici », said over the list while the slider points away from now. */
export const atHereWords = (at: number, twelveHours = false): string => t('At {time} here', { time: clockWords(instantToWall(at, here).slice(11, 16), twelveHours) });

/** Snaps a shift of the slider to quarter hours (minutes), within a day either way. */
export function snapShift(minutes: number): number {
  const snapped = Math.round(minutes / 15) * 15;
  return Math.max(-24 * 60, Math.min(24 * 60, snapped));
}

/** The moment shown for a shift from now: the quarter hour shifted, so every city shows round times as it moves. */
export function shiftedMoment(now: number, minutes: number): number {
  if (minutes === 0) return now;
  const quarter = 15 * MINUTE;
  return Math.round(now / quarter) * quarter + minutes * MINUTE;
}
