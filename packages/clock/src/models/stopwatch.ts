/**
 * The stopwatch: one per device, never synced (a stopwatch times something here and now). Running,
 * it counts from `startedAt` on top of what it had (`banked`); paused, `banked` is all of it. Each
 * lap is the whole time when « Tour » was pressed (a split), so a lap's own length is the gap to the
 * one before. The phone's engine keeps it (its notification and widget count with the app closed);
 * the web keeps it in the browser.
 */

export interface Stopwatch {
  /** When it was last started or resumed; null while paused or reset. */
  readonly startedAt: number | null;
  /** Milliseconds counted before `startedAt`. */
  readonly banked: number;
  /** The whole time at each « Tour », oldest first. */
  readonly laps: readonly number[];
}

export const STOPWATCH_RESET: Stopwatch = { startedAt: null, banked: 0, laps: [] };

/** Laps kept at most: past it the oldest go (a run of 999 laps is a stopwatch left on). */
export const MOST_LAPS = 999;

export const isRunning = (watch: Stopwatch): boolean => watch.startedAt !== null;
export const isReset = (watch: Stopwatch): boolean => watch.startedAt === null && watch.banked === 0 && watch.laps.length === 0;

/** Milliseconds counted now. */
export function elapsed(watch: Stopwatch, now: number): number {
  return watch.banked + (watch.startedAt === null ? 0 : Math.max(0, now - watch.startedAt));
}

export function startWatch(watch: Stopwatch, now: number): Stopwatch {
  return watch.startedAt === null ? { ...watch, startedAt: now } : watch;
}

export function pauseWatch(watch: Stopwatch, now: number): Stopwatch {
  return watch.startedAt === null ? watch : { ...watch, banked: elapsed(watch, now), startedAt: null };
}

/** « Tour »: the whole time now, kept as a split. */
export function lapWatch(watch: Stopwatch, now: number): Stopwatch {
  if (watch.startedAt === null) return watch;
  const laps = [...watch.laps, elapsed(watch, now)];
  return { ...watch, laps: laps.length > MOST_LAPS ? laps.slice(laps.length - MOST_LAPS) : laps };
}

/** The lap under way: its time so far. */
export function currentLap(watch: Stopwatch, now: number): number {
  return elapsed(watch, now) - (watch.laps.at(-1) ?? 0);
}

export interface LapRow {
  /** 1 for the first. */
  readonly number: number;
  /** Its own length. */
  readonly lap: number;
  /** The whole time at its end. */
  readonly split: number;
  readonly fastest: boolean;
  readonly slowest: boolean;
}

/** The laps as the list shows them, newest first; the fastest and the slowest marked once there are three. */
export function lapRows(watch: Stopwatch): LapRow[] {
  const lengths = watch.laps.map((split, index) => split - (index === 0 ? 0 : watch.laps[index - 1]!));
  const marked = lengths.length >= 3;
  const fastest = marked ? Math.min(...lengths) : -1;
  const slowest = marked ? Math.max(...lengths) : -1;
  // One of each: the first lap that holds the record wears it.
  const fastestAt = lengths.indexOf(fastest);
  const slowestAt = fastest === slowest ? -1 : lengths.indexOf(slowest);
  return lengths
    .map((lap, index) => ({ number: index + 1, lap, split: watch.laps[index]!, fastest: index === fastestAt, slowest: index === slowestAt }))
    .reverse();
}

/** A stopwatch as stored (JSON), read whole: what is wrong reads as reset. */
export function readStopwatch(value: unknown): Stopwatch {
  if (typeof value !== 'object' || value === null) return STOPWATCH_RESET;
  const raw = value as Record<string, unknown>;
  const startedAt = typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt) ? raw.startedAt : null;
  const banked = typeof raw.banked === 'number' && Number.isFinite(raw.banked) && raw.banked >= 0 ? raw.banked : 0;
  const laps = Array.isArray(raw.laps) ? raw.laps.filter((lap): lap is number => typeof lap === 'number' && Number.isFinite(lap) && lap >= 0).slice(-MOST_LAPS) : [];
  return { startedAt, banked, laps };
}
