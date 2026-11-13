/**
 * Agenda on the server: the calendars subscribed to (`feeds.ts`; over CalDAV with a login, `caldav.ts`,
 * the logins kept apart, `logins.ts`), the public holidays from Nager.Date
 * (`holidays.ts`), the weather (`weather.ts`), what it asks Claude (`claude.ts`), the web's reminders
 * as push notifications (`reminders.ts`, `webpush.ts`), the published calendar and its routes
 * (`routes.ts`), its bin (`bin.ts`), and how its files, its list and its calendar file look in the
 * drive and in archives (`files.ts`, `markdown.ts`), under its own folder there. It reads Contacts',
 * Carnet's and Pages' records to name what an event mentions, and a link's reading for an event.
 */
import type { StatementSync } from 'node:sqlite';
// Declares Agenda's record types to the sync.
import '@unlease/calendar/sync/entities';
import type { Database } from '../../db/database';
import type { ClaudeContext } from '../../claude/provider';
import type { UsageStore } from '../../claude/usage';
import type { Fetcher } from '../../reading/fetcher';
import type { SettingsStore } from '../../settings/store';
import type { RecordStore } from '../../sync/records';
import type { PushRule, SyncService } from '../../sync/service';
import type { ServerApp } from '../types';
import { reviveRule } from '../../sync/revive';
import { emptyCalendarBin, exceptionsOf } from './bin';
import { CalendarClaude } from './claude';
import { FeedReader } from './feeds';
import { FeedLogins } from './logins';
import { calendarFilesInUse, FOLDER, layoutEvents, readEvents } from './files';
import { HolidayKeeper } from './holidays';
import { calendarMarkdown } from './markdown';
import { PushReminders } from './reminders';
import { calendarPublicRoutes, calendarRoutes } from './routes';
import { WeatherService } from './weather';

/** Agenda's rules for what a push brings (`SyncService`): an event the bin emptied that a device restores afterwards comes back, with its exceptions. */
export const CALENDAR_PUSH_RULES: readonly PushRule[] = [reviveRule('calendarEvent', exceptionsOf)];

export interface CalendarAppOptions {
  readonly db: Database;
  readonly sync: SyncService;
  readonly records: RecordStore;
  readonly settings: SettingsStore;
  readonly usage: UsageStore;
  readonly claude: () => ClaudeContext;
  readonly fetcher: Fetcher;
  /** How push services are reached (tests stand in for them). */
  readonly pushFetch?: typeof fetch;
  readonly now?: () => number;
}

export interface CalendarApp extends ServerApp {
  readonly feeds: FeedReader;
  readonly holidays: HolidayKeeper;
  readonly weather: WeatherService;
  readonly reminders: PushReminders;
}

export function createCalendarApp(options: CalendarAppOptions): CalendarApp {
  const { db, sync, records, settings, usage, claude, fetcher } = options;
  const now = options.now ?? Date.now;
  const feeds = new FeedReader({ sync, records, fetcher, logins: new FeedLogins(db), now });
  const holidays = new HolidayKeeper({ sync, records, settings, fetcher, now });
  const weather = new WeatherService(fetcher, now);
  const asker = new CalendarClaude({ usage, claude, settings: () => settings.calendar(), records, now });
  const reminders = new PushReminders({ db, records, now, ...(options.pushFetch ? { pushFetch: options.pushFetch } : {}) });
  const count: StatementSync = db.prepare(
    `SELECT COUNT(*) AS count FROM records WHERE type = 'calendarEvent' AND json_extract(fields, '$.deletedAt') IS NULL
     AND json_extract(fields, '$.trashedAt') IS NULL AND json_extract(fields, '$.feedId') IS NULL AND json_extract(fields, '$.recurringId') IS NULL`,
  );
  let running = false;
  // The holidays follow their country at once, while Agenda is on (and when it is turned on again).
  settings.onHolidays(() => {
    if (running) void holidays.sync();
  });
  return {
    id: 'calendar',
    readme: `\`${FOLDER}/\` : vos événements en iCalendar (\`${FOLDER}.ics\`, que Google Agenda, les téléphones et Thunderbird importent) et en liste par mois (\`${FOLDER}.md\`), leurs fichiers dans un dossier par événement.`,
    feeds,
    holidays,
    weather,
    reminders,
    routes: app => calendarRoutes(app, { records, settings, feeds, holidays, weather, claude: asker, reminders, now }),
    publicRoutes: app => calendarPublicRoutes(app, { records, settings, now }),
    stored: stored => {
      const changed = stored.filter(record => record.type === 'calendarFeed');
      if (changed.length > 0) feeds.stored(changed);
    },
    start: () => {
      running = true;
      feeds.start();
      reminders.start();
      void holidays.syncIfDue();
    },
    stop: async () => {
      running = false;
      await Promise.all([feeds.stop(), reminders.stop()]);
    },
    chores: at => {
      void holidays.syncIfDue();
      return emptyCalendarBin(db, sync, at);
    },
    filesInUse: calendarFilesInUse,
    files: (all, filesOptions) => layoutEvents(readEvents(all), filesOptions),
    markdown: (all, filesOptions) => {
      const events = readEvents(all);
      return calendarMarkdown(events, all, layoutEvents(events, filesOptions), now());
    },
    counts: () => ({ events: Number((count.get() as { count: number }).count) }),
  };
}
