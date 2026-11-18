/**
 * Clock on the server: the weather where a phone wakes up (`routes.ts`, `weather.ts`: Open-Meteo,
 * asked by the server), and its alarms, saved timers and world clocks as a list in archives
 * (`markdown.ts`), under its own folder. A timer that runs and the stopwatch never reach it: they are
 * the phone's.
 * The alarms ring on the phones (Clock's Android app, its own engine); the server keeps them as it
 * keeps every app's records, so a new phone has them and the web app shows them. No bin: an alarm
 * deleted is taken back from its slip. It reads Agenda's records nowhere: the phone does.
 */
import type { DatabaseSync, StatementSync } from 'node:sqlite';

import type { Fetcher } from '../../reading/fetcher';
import type { ServerApp } from '../types';
import { clockMarkdown, FOLDER, readAlarms, readTimers, readWorldClocks } from './markdown';
import { clockRoutes } from './routes';
import { ClockWeather } from './weather';

export interface ClockAppOptions {
  readonly db: DatabaseSync;
  /** The suite's guarded web reader (`reading/`), made once by the registry. */
  readonly fetcher: Fetcher;
  readonly now: () => number;
}

export interface ClockApp extends ServerApp {
  readonly weather: ClockWeather;
}

export function createClockApp(options: ClockAppOptions): ClockApp {
  const { db, fetcher, now } = options;
  const weather = new ClockWeather(fetcher, now);
  const count = (type: string): StatementSync => db.prepare(`SELECT COUNT(*) AS count FROM records WHERE type = '${type}' AND json_extract(fields, '$.deletedAt') IS NULL`);
  const alarms = count('alarm');
  const timers = count('timer');
  const cities = count('worldClock');
  return {
    id: 'clock',
    readme: `\`${FOLDER}/\` : vos alarmes, vos minuteurs enregistrés et vos horloges en liste (\`${FOLDER}.md\`).`,
    weather,
    routes: app => clockRoutes(app, { weather }),
    markdown: all => clockMarkdown(readAlarms(all), now(), readTimers(all), readWorldClocks(all)),
    counts: () => ({
      alarms: Number((alarms.get() as { count: number }).count),
      timers: Number((timers.get() as { count: number }).count),
      worldClocks: Number((cities.get() as { count: number }).count),
    }),
  };
}
