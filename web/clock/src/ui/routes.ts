/**
 * Clock's places, all under `/clock`: the alarms (`/clock`), an alarm's editor over them
 * (`/clock/alarm/<id>`), and a new alarm's (`/clock/new`, the installed app's shortcut and C). The
 * Réglages are the shell's (`/clock/settings`).
 */
import { decodePart, type Route } from '@shared/ui/router';

declare module '@shared/ui/router' {
  interface Routes {
    readonly clock: object;
    readonly clockAlarm: { readonly id: string };
    readonly clockNew: object;
  }
}

export const CLOCK_ROUTES = ['clock', 'clockAlarm', 'clockNew'] as const satisfies readonly Route['name'][];

export const HOME = '/clock';

export function parseClockRoute(path: string): Route | null {
  if (path === HOME) return { name: 'clock' };
  if (path === `${HOME}/new`) return { name: 'clockNew' };
  const alarm = /^\/clock\/alarm\/([^/]+)$/.exec(path);
  if (alarm) return { name: 'clockAlarm', id: decodePart(alarm[1]!) };
  return null;
}

/** Clock's places (the shell's, `settings` and `admin`, are `@shared/ui/router`'s `paths`). */
export const paths = {
  home: HOME,
  newAlarm: `${HOME}/new`,
  alarm: (id: string): string => `${HOME}/alarm/${encodeURIComponent(id)}`,
} as const;
