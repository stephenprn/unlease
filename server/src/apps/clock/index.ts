/**
 * Clock on the server: the weather where a phone wakes up (`routes.ts`, `weather.ts`: Open-Meteo,
 * asked by the server), and its alarms as a list in archives (`markdown.ts`), under its own folder.
 * The alarms ring on the phones (Clock's Android app, its own engine); the server keeps them as it
 * keeps every app's records, so a new phone has them and the web app shows them. No bin: an alarm
 * deleted is taken back from its slip. It reads Agenda's records nowhere: the phone does.
 */
import type { DatabaseSync, StatementSync } from 'node:sqlite';

import type { Fetcher } from '../../reading/fetcher';
import type { ServerApp } from '../types';
import { clockMarkdown, FOLDER, readAlarms } from './markdown';
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
  const count: StatementSync = db.prepare(`SELECT COUNT(*) AS count FROM records WHERE type = 'alarm' AND json_extract(fields, '$.deletedAt') IS NULL`);
  return {
    id: 'clock',
    readme: `\`${FOLDER}/\` : vos alarmes en liste (\`${FOLDER}.md\`).`,
    weather,
    routes: app => clockRoutes(app, { weather }),
    markdown: all => clockMarkdown(readAlarms(all), now()),
    counts: () => ({ alarms: Number((count.get() as { count: number }).count) }),
  };
}
