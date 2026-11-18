/**
 * Clock's places, all under `/clock`: the alarms (`/clock`), an alarm's editor over them
 * (`/clock/alarm/<id>`), and a new alarm's (`/clock/new`, the installed app's shortcut and C); the
 * timers (`/clock/timers`), a saved timer's form over them (`/clock/timer/<id>`) and a new timer's
 * (`/clock/timers/new`); the stopwatch (`/clock/stopwatch`); the world clocks (`/clock/world`) and
 * the city search over them (`/clock/world/new`). The Réglages are the shell's (`/clock/settings`).
 */
import { decodePart, type Route } from '@shared/ui/router';

declare module '@shared/ui/router' {
  interface Routes {
    readonly clock: object;
    readonly clockAlarm: { readonly id: string };
    readonly clockNew: object;
    readonly clockTimers: object;
    readonly clockTimer: { readonly id: string };
    readonly clockTimerNew: object;
    readonly clockStopwatch: object;
    readonly clockWorld: object;
    readonly clockCityNew: object;
  }
}

export const CLOCK_ROUTES = ['clock', 'clockAlarm', 'clockNew', 'clockTimers', 'clockTimer', 'clockTimerNew', 'clockStopwatch', 'clockWorld', 'clockCityNew'] as const satisfies readonly Route['name'][];

export const HOME = '/clock';

/** Clock's places (the shell's, `settings` and `admin`, are `@shared/ui/router`'s `paths`). */
export const paths = {
  home: HOME,
  newAlarm: `${HOME}/new`,
  alarm: (id: string): string => `${HOME}/alarm/${encodeURIComponent(id)}`,
  timers: `${HOME}/timers`,
  newTimer: `${HOME}/timers/new`,
  timer: (id: string): string => `${HOME}/timer/${encodeURIComponent(id)}`,
  stopwatch: `${HOME}/stopwatch`,
  world: `${HOME}/world`,
  newCity: `${HOME}/world/new`,
} as const;

/** The places a path names alone (no id). */
const PLAIN: Readonly<Record<string, Route>> = {
  [HOME]: { name: 'clock' },
  [paths.newAlarm]: { name: 'clockNew' },
  [paths.timers]: { name: 'clockTimers' },
  [paths.newTimer]: { name: 'clockTimerNew' },
  [paths.stopwatch]: { name: 'clockStopwatch' },
  [paths.world]: { name: 'clockWorld' },
  [paths.newCity]: { name: 'clockCityNew' },
};

export function parseClockRoute(path: string): Route | null {
  const plain = PLAIN[path];
  if (plain) return plain;
  const alarm = /^\/clock\/alarm\/([^/]+)$/.exec(path);
  if (alarm) return { name: 'clockAlarm', id: decodePart(alarm[1]!) };
  const timer = /^\/clock\/timer\/([^/]+)$/.exec(path);
  if (timer) return { name: 'clockTimer', id: decodePart(timer[1]!) };
  return null;
}

/** The forms that lie over a page (an alarm's, a timer's, the city search), each over its own place when opened at its address. */
export function placeUnder(route: Route): Route | null {
  switch (route.name) {
    case 'clockAlarm':
    case 'clockNew':
      return { name: 'clock' };
    case 'clockTimer':
    case 'clockTimerNew':
      return { name: 'clockTimers' };
    case 'clockCityNew':
      return { name: 'clockWorld' };
    default:
      return null;
  }
}
