/**
 * A world clock (`worldClock`): a city the person keeps an eye on, a sync record like an alarm, so
 * every phone and the web show the same cities. It keeps the city's time zone (IANA), its name as it
 * was picked (in the interface's language then, or as the person renamed it), its country, and where
 * it is, for its daylight. The list orders itself (`byOffset`): west to east, as a day travels.
 */

export interface WorldClock {
  readonly id: string;
  /** `Asia/Tokyo`. */
  readonly zone: string;
  /** « Tokyo », « Maman », as it shows. */
  readonly name: string;
  /** Its country (`JP`), '' unknown. */
  readonly country: string;
  /** Where it is, for its daylight; null unknown (then the hour of the day says it). */
  readonly lat: number | null;
  readonly lon: number | null;
  readonly createdAt: number;
  readonly deletedAt: number | null;
  readonly editedAt: number;
}

export const WORLD_CLOCK_LIMITS = {
  name: 60,
  zone: 64,
  country: 2,
} as const;

/** An IANA zone's shape (`Europe/Paris`, `America/Argentina/Buenos_Aires`, `UTC`). */
export const ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/;

export const WORLD_CLOCK_FIELD_DEFAULTS = {
  country: '',
  lat: null,
  lon: null,
} as const;

export const isLiveWorldClock = (clock: Pick<WorldClock, 'deletedAt'>): boolean => clock.deletedAt === null;
