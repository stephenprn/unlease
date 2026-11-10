/**
 * The apps this server can run, made once for `main.ts` and the tests (`test/helpers.ts`): a new
 * app's module is listed here alone. Every app is made and loaded whatever the Administration turned
 * on (its record types are known, its data synced and backed up); `AppRunner` and the routes' gate
 * follow what is on. What the apps share comes from the platform and is made here once: Claude's
 * client and what it has cost (`claude/`, `/api/usage`), the guarded fetcher that reads web
 * pages (`reading/`), and the places found as they are typed (`places/`, `/api/places`).
 */
import type { Hono } from 'hono';
import type { BlobStore } from '../blobs/store';
import { ClaudeProvider } from '../claude/provider';
import { usageRoute } from '../claude/routes';
import { UsageStore } from '../claude/usage';
import type { Effort } from '../config';
import type { Database } from '../db/database';
import type { SettingsStore } from '../settings/store';
import type { SettingsChecks } from '../settings/update';
import type { RecordStore } from '../sync/records';
import type { PushRepair, PushRule, SyncService } from '../sync/service';
import { createFetcher, type Fetcher } from '../reading/fetcher';
import { PlaceFinder } from '../places/finder';
import { placesRoute } from '../places/routes';
import { LinkModelProvider } from './notes/analysis/provider';
import { READ_TASK } from './notes/analysis/usage';
import { createNotesApp, NOTES_PUSH_RULES, type NotesApp } from './notes';
import { checkSeerrServer } from './notes/seerr';
import { createCalendarApp, CALENDAR_PUSH_RULES, type CalendarApp } from './calendar';
import { createContactsApp, CONTACTS_PUSH_RULES, type ContactsApp } from './contacts';
import { createPagesApp, PAGES_PUSH_REPAIRS, PAGES_PUSH_RULES, type PagesApp } from './pages';
import type { Env, ServerApp } from './types';

/** Every app's rules for what a push brings, given to the sync before any app is made: they hold whatever is on. */
export const PUSH_RULES: readonly PushRule[] = [...NOTES_PUSH_RULES, ...PAGES_PUSH_RULES, ...CALENDAR_PUSH_RULES, ...CONTACTS_PUSH_RULES];

/** Every app's repairs of a whole push (`PushRepair`), given to the sync with the rules. */
export const PUSH_REPAIRS: readonly PushRepair[] = [...PAGES_PUSH_REPAIRS];

export interface AppDeps {
  readonly db: Database;
  readonly sync: SyncService;
  readonly records: RecordStore;
  readonly blobs: BlobStore;
  readonly settings: SettingsStore;
  /** How hard Claude thinks, and how many links are read at once. */
  readonly claudeEffort: Effort;
  readonly analysisConcurrency: number;
  /** Photon's address for the places offered as they are typed (`UNLEASE_PLACES_URL`); null or absent: off. */
  readonly placesUrl?: string | null;
  /** What tests stand in for: how pages are fetched, how Claude is reached, how Seerr is called. */
  readonly fetcher?: Fetcher;
  readonly claude?: ClaudeProvider;
  readonly seerrFetch?: typeof fetch;
  /** How push services are reached, for the web's reminders. */
  readonly pushFetch?: typeof fetch;
  /** How the places' geocoder is reached. */
  readonly placesFetch?: typeof fetch;
  readonly now?: () => number;
}

export interface Suite {
  /** In the suite's order (`READY_APPS`). */
  readonly apps: readonly ServerApp[];
  readonly notes: NotesApp;
  readonly pages: PagesApp;
  readonly contacts: ContactsApp;
  readonly calendar: CalendarApp;
  /** What Claude has cost, month by month, every app's calls together. */
  readonly usage: UsageStore;
  /** Routes the apps share, served whatever is on: Claude's spending, the places found as they are typed. */
  readonly routes: (app: Hono<Env>) => void;
  /** How the Administration's settings that belong to an app are tried (Seerr, Carnet's; the holidays, Agenda's). */
  readonly checks: Partial<SettingsChecks>;
}

export function createApps(deps: AppDeps): Suite {
  const { db, sync, records, blobs, settings } = deps;
  const now = deps.now ?? Date.now;
  // `analyses` counts Carnet's links read; every app's calls count in the costs.
  const usage = new UsageStore(db, now, { counted: [READ_TASK] });
  const claude = deps.claude ?? new ClaudeProvider(settings, { effort: deps.claudeEffort });
  const fetcher = deps.fetcher ?? createFetcher();
  const shared = { db, sync, records, blobs, settings, usage, fetcher, now };
  const links = new LinkModelProvider(claude);
  const notes = createNotesApp({ ...shared, analysis: () => links.current(), claude: () => claude.current(), analysisConcurrency: deps.analysisConcurrency, ...(deps.seerrFetch ? { seerrFetch: deps.seerrFetch } : {}) });
  const pages = createPagesApp({ ...shared, claude: () => claude.current() });
  const contacts = createContactsApp({ db, sync, blobs, fetcher });
  const calendar = createCalendarApp({ db, sync, records, settings, usage, claude: () => claude.current(), fetcher, now, ...(deps.pushFetch ? { pushFetch: deps.pushFetch } : {}) });
  const seerrFetch = deps.seerrFetch;
  const places = new PlaceFinder(deps.placesUrl ?? null, now, deps.placesFetch ?? fetch);
  return {
    apps: [notes, pages, calendar, contacts],
    notes,
    pages,
    contacts,
    calendar,
    usage,
    routes: app => {
      usageRoute(app, { usage, settings, now });
      placesRoute(app, { places });
    },
    checks: { checkSeerr: config => checkSeerrServer(config, seerrFetch), checkHolidays: calendar.holidays.check },
  };
}
