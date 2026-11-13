/**
 * Agenda's routes, beside the platform's under `/api` and behind the same token, answered while
 * Agenda is on (`app.ts`'s gate): the events that mention something, an address tried before it is
 * followed (and a CalDAV calendar's login kept), a subscription read now, the
 * holidays' countries and regions, the weather, Claude's readings and answers, the web's push
 * subscriptions. And its one public route, outside `/api` and without the token: the published
 * calendar, `/ical/<secret>.ics`, whose secret is its key.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { eventsMentioning } from '@unlease/calendar/services/ask';
import {
  ASK_CONTEXT_MAX,
  ASK_PATH,
  COUNTRIES_PATH,
  FEED_CONNECT_PATH,
  FEED_LOGIN_LIMITS,
  FROM_LINK_PATH,
  PARSE_PATH,
  parseCalendarAskRequest,
  parseFeedConnectRequest,
  parseFromLinkRequest,
  parseParseRequest,
  parsePushSubscription,
  PUSH_KEY_PATH,
  PUSH_SUBSCRIPTIONS_PATH,
  REGIONS_PATH,
  WEATHER_PATH,
} from '@unlease/calendar/sync/routes';
import { eventFromRecord } from '@unlease/calendar/sync/entities';
import { COUNTRY_PATTERN } from '@unlease/core/sync/settings';
import { parseMentionsQuery, type MentionsResponse } from '@unlease/core/sync/mentions';
import type { ModuleOutcome } from '../../claude/outcome';
import type { SettingsStore } from '../../settings/store';
import type { RecordStore } from '../../sync/records';
import type { Env } from '../types';
import type { CalendarClaude } from './claude';
import type { FeedReader } from './feeds';
import { NagerUnknown, type HolidayKeeper } from './holidays';
import { ownIcs } from './markdown';
import type { PushReminders } from './reminders';
import type { WeatherService } from './weather';

const KB = 1024;
const tooLarge = (c: Context) => c.json({ error: 'body too large' }, 413);
const noStore = { 'Cache-Control': 'no-store' };

export interface CalendarServices {
  readonly records: RecordStore;
  readonly settings: SettingsStore;
  readonly feeds: FeedReader;
  readonly holidays: HolidayKeeper;
  readonly weather: WeatherService;
  readonly claude: CalendarClaude;
  readonly reminders: PushReminders;
  readonly now: () => number;
}

/** A JSON request parsed, then answered; a run goes on if the app hangs up (it is paid for). */
const answer =
  <R, T>(parse: (body: unknown) => R | null, invalid: string, run: (request: R) => Promise<ModuleOutcome<T>>) =>
  async (c: Context<Env>) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid request' }, 400);
    }
    const request = parse(body);
    if (!request) return c.json({ error: invalid }, 400);
    const outcome = await run(request);
    if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
    return c.json(outcome.answer as object, 200, noStore);
  };

export function calendarRoutes(app: Hono<Env>, services: CalendarServices): void {
  const { records, feeds, holidays, weather, claude, reminders } = services;

  app.get('/api/calendar/mentions', c => {
    const query = parseMentionsQuery(c.req.query('type'), c.req.query('ids'));
    if (!query) return c.json({ error: 'Invalid request' }, 400);
    const answer: MentionsResponse = { places: eventsMentioning(records.ofType('calendarEvent').map(eventFromRecord), query.type, query.ids) };
    return c.json(answer, 200, noStore);
  });

  // Before the `:id` routes. A login travels in the body only, and never comes back.
  app.post(FEED_CONNECT_PATH, bodyLimit({ maxSize: 8 * KB + FEED_LOGIN_LIMITS.password * 4, onError: tooLarge }), async c => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid request' }, 400);
    }
    const request = parseFeedConnectRequest(body);
    if (!request) return c.json({ error: 'Invalid request' }, 400);
    const outcome = await feeds.connect(request);
    return outcome.ok ? c.json(outcome.answer, 200, noStore) : c.json({ error: outcome.error }, outcome.status);
  });

  app.post('/api/calendar/feeds/:id/refresh', async c => {
    const id = c.req.param('id');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return c.json({ error: 'Invalid request' }, 400);
    if (id === 'holidays') {
      await holidays.sync();
      return c.json({ ok: true }, 200, noStore);
    }
    const outcome = await feeds.refresh(id);
    return outcome.ok ? c.json({ ok: true }, 200, noStore) : c.json({ error: outcome.error }, outcome.status);
  });

  app.get(COUNTRIES_PATH, async c => {
    try {
      return c.json({ countries: await holidays.countryList() }, 200, { 'Cache-Control': 'private, max-age=86400' });
    } catch {
      return c.json({ error: 'Nager.Date injoignable' }, 502);
    }
  });

  app.get(REGIONS_PATH, async c => {
    const country = c.req.query('country') ?? '';
    if (!COUNTRY_PATTERN.test(country)) return c.json({ error: 'Pays invalide' }, 400);
    try {
      return c.json({ regions: await holidays.regions(country) }, 200, { 'Cache-Control': 'private, max-age=3600' });
    } catch (error) {
      return error instanceof NagerUnknown ? c.json({ error: error.message }, 404) : c.json({ error: 'Nager.Date injoignable' }, 502);
    }
  });

  app.get(WEATHER_PATH, async c => {
    const place = (c.req.query('place') ?? '').trim();
    if (!place || place.length > 300) return c.json({ error: 'Lieu invalide' }, 400);
    try {
      return c.json(await weather.forecast(place), 200, { 'Cache-Control': 'private, max-age=1800' });
    } catch {
      return c.json({ error: 'Météo injoignable' }, 502);
    }
  });

  app.post(PARSE_PATH, bodyLimit({ maxSize: 16 * KB, onError: tooLarge }), answer(parseParseRequest, 'Invalid request', request => claude.parse(request)));
  app.post(FROM_LINK_PATH, bodyLimit({ maxSize: 4 * KB, onError: tooLarge }), answer(parseFromLinkRequest, 'Invalid request', request => claude.fromLink(request)));
  app.post(ASK_PATH, bodyLimit({ maxSize: ASK_CONTEXT_MAX * 3 + 64 * KB, onError: tooLarge }), answer(parseCalendarAskRequest, 'Invalid question', request => claude.ask(request)));

  app.get(PUSH_KEY_PATH, c => c.json({ publicKey: reminders.publicKey() }, 200, noStore));
  app.post(PUSH_SUBSCRIPTIONS_PATH, bodyLimit({ maxSize: 8 * KB, onError: tooLarge }), async c => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid request' }, 400);
    }
    const subscription = parsePushSubscription(body);
    if (!subscription) return c.json({ error: 'Abonnement invalide' }, 400);
    reminders.subscribe(subscription);
    return c.json({ ok: true }, 200, noStore);
  });
  app.delete(PUSH_SUBSCRIPTIONS_PATH, bodyLimit({ maxSize: 8 * KB, onError: tooLarge }), async c => {
    let body: { endpoint?: unknown } | null;
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: 'Invalid request' }, 400);
    }
    if (typeof body?.endpoint !== 'string') return c.json({ error: 'Invalid request' }, 400);
    reminders.unsubscribe(body.endpoint);
    return c.json({ ok: true }, 200, noStore);
  });
}

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/** The published calendar, without the token: its secret is its key (compared in constant time). */
export function calendarPublicRoutes(app: Hono<Env>, { records, settings, now }: Pick<CalendarServices, 'records' | 'settings' | 'now'>): void {
  app.get('/ical/:file', c => {
    const match = /^([A-Za-z0-9_-]{16,128})\.ics$/.exec(c.req.param('file'));
    const secret = settings.publishSecret();
    if (!match || !secret || !timingSafeEqual(digest(match[1]!), digest(secret))) return c.json({ error: 'not found' }, 404);
    const all = records.all();
    const events = all.filter(record => record.type === 'calendarEvent').map(eventFromRecord);
    return c.body(ownIcs(events, all, now(), { published: true }), 200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="agenda.ics"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
  });
}
