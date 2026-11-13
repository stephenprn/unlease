/**
 * Subscribed calendars (`calendarFeed` records of kind `ics`, or `caldav` for one read with a login,
 * `caldav.ts`, its login kept by the server alone, `logins.ts`): the server reads each address through
 * the suite's guarded reader (`webcal://` as `https://`, public addresses only, 10 MB at most) and
 * keeps its events as Agenda's records, marked with the calendar (`feedId`), rewriting only what
 * changed (`planFeed`). An address is read when its calendar is made or its address changes, every
 * six hours, and when someone asks (`POST /api/calendar/feeds/:id/refresh`); a calendar deleted takes
 * its events with it. A reading that fails says why on the calendar (`error`), and what it served
 * before stays. An address is tried before a device follows it (`connect`): read as iCalendar, or,
 * when it asks for a login and one is given, found over CalDAV, its login then kept.
 */
import { HOLIDAYS_FEED_ID } from '@unlease/calendar/models/events';
import { FEED_PAST_DAYS, feedAddress, feedDrafts, feedNameFrom, planFeed, type FeedDraft } from '@unlease/calendar/services/feeds';
import { parseIcs, type IcsCalendar } from '@unlease/calendar/services/ics';
import { addDays, instantToDay } from '@unlease/calendar/services/time';
import type { FeedConnectRequest, FeedConnectResponse } from '@unlease/calendar/sync/routes';
import { eventFromRecord, feedFromRecord } from '@unlease/calendar/sync/entities';
import { createId } from '@unlease/core/services/ids';
import type { Fields } from '@unlease/core/sync/record';
import { log } from '../../log';
import { FetchError, type Fetcher } from '../../reading/fetcher';
import type { RecordStore } from '../../sync/records';
import type { ServerEdit, SyncService } from '../../sync/service';
import { CalDavClient, CalDavProblem, LOGIN_MISSING, PLAIN_HTTP } from './caldav';
import type { FeedLogins } from './logins';

/** How often a calendar is read again. */
export const FEED_INTERVAL_MS = 6 * 3_600_000;
export const FEED_MAX_BYTES = 10 * 1024 * 1024;
const FEED_TIMEOUT_MS = 30_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; calendar subscription)';

export interface FeedReaderOptions {
  readonly sync: SyncService;
  readonly records: RecordStore;
  readonly fetcher: Fetcher;
  readonly logins: FeedLogins;
  readonly now: () => number;
}

export type FeedOutcome = { readonly ok: true } | { readonly ok: false; readonly status: 404 | 502; readonly error: string };

/** What trying an address says: an answer for the device, or why it failed (`422`: the address or the login is refused, not the server). */
export type ConnectOutcome = { readonly ok: true; readonly answer: FeedConnectResponse } | { readonly ok: false; readonly status: 400 | 404 | 422 | 502; readonly error: string };

const NO_CALENDAR = 'This address serves no calendar (iCalendar)';
const NEEDS_LOGIN = 'This calendar asks for a login';

/** Why an address could not be read, in the words the apps show (French; translated there). */
function readProblem(error: unknown): string {
  if (error instanceof FetchError) {
    if (error.code === 'invalid_url') return 'Invalid calendar address';
    if (error.code === 'blocked') return 'This address is not public';
    if (error.code === 'timeout') return 'The calendar takes too long to answer';
  }
  if (error instanceof CalDavProblem) return error.message;
  return 'Calendar unreachable';
}

/** The day events are read from: those that ended before are left out. */
const sinceDay = (now: number): string => addDays(instantToDay(now, 'UTC'), -FEED_PAST_DAYS);

/** Applies a plan to one calendar's events: new ones made, kept ones patched, gone ones tombstoned. Returns how many records changed. */
export function applyFeedPlan(sync: SyncService, records: RecordStore, feedId: string, drafts: readonly FeedDraft[], now: number): number {
  const stored = records
    .ofType('calendarEvent')
    .filter(record => record.fields.feedId === feedId)
    .map(record => ({ event: eventFromRecord(record), fields: record.fields }));
  const plan = planFeed(drafts, stored, () => createId(now), now);
  const edits: ServerEdit[] = [
    ...plan.writes.map(write => ({ type: 'calendarEvent', id: write.id, create: write.created, patch: (): Fields => write.fields })),
    ...plan.removals.map(id => ({ type: 'calendarEvent', id, patch: (current: { fields: Fields }) => (typeof current.fields.deletedAt === 'number' ? null : { deletedAt: now }) })),
  ];
  return edits.length > 0 ? sync.apply(edits).length : 0;
}

/** Tombstones every live event of a calendar (deleted, or its country unset). */
export function dropFeedEvents(sync: SyncService, records: RecordStore, feedId: string, now: number): number {
  const ids = records
    .ofType('calendarEvent')
    .filter(record => record.fields.feedId === feedId && (record.fields.deletedAt === null || record.fields.deletedAt === undefined))
    .map(record => record.id);
  if (ids.length === 0) return 0;
  return sync.apply(ids.map(id => ({ type: 'calendarEvent', id, patch: () => ({ deletedAt: now }) }))).length;
}

export class FeedReader {
  private readonly running = new Map<string, Promise<FeedOutcome>>();
  /** The address each calendar was last read at, and when (tried, well or not). */
  private readonly read = new Map<string, { readonly url: string; readonly at: number }>();
  private timer: NodeJS.Timeout | null = null;
  private readonly caldav: CalDavClient;

  constructor(private readonly options: FeedReaderOptions) {
    this.caldav = new CalDavClient(options.fetcher, FEED_MAX_BYTES);
  }

  /**
   * An address tried before a device follows it, or a followed calendar's login changed. Without a
   * login: read as an iCalendar address (`login` when it asks for one). With one: the CalDAV calendar
   * it opens found and read once, then the login kept under the calendar's id (and that calendar,
   * if followed already, read again).
   */
  async connect(request: FeedConnectRequest): Promise<ConnectOutcome> {
    const { records, fetcher, logins } = this.options;
    const address = feedAddress(request.url);
    if (!address) return { ok: false, status: 400, error: 'Invalid calendar address' };
    const record = records.get('calendarFeed', request.id);
    if (record && (typeof record.fields.deletedAt === 'number' || record.fields.kind === 'holidays')) return { ok: false, status: 404, error: 'Calendar not found' };
    const failed = (error: unknown): ConnectOutcome => {
      const refused = error instanceof CalDavProblem && error.kind === 'refused';
      const theirs = refused || (error instanceof CalDavProblem && error.message === PLAIN_HTTP) || (error instanceof FetchError && (error.code === 'invalid_url' || error.code === 'blocked'));
      return { ok: false, status: theirs ? 422 : 502, error: readProblem(error) };
    };
    if (!request.login) {
      try {
        const response = await fetcher.fetch(address, { headers: { 'user-agent': USER_AGENT, accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5' }, maxBytes: FEED_MAX_BYTES, timeoutMs: FEED_TIMEOUT_MS });
        if (response.status === 401) return { ok: true, answer: { status: 'login' } };
        if (response.status === 404 || response.status === 410) return { ok: false, status: 422, error: 'This calendar no longer exists at this address' };
        if (response.status === 403) return { ok: false, status: 422, error: 'This calendar is private: use its secret address' };
        if (response.status < 200 || response.status >= 300) return { ok: false, status: 502, error: `Le calendrier ne répond pas (HTTP ${response.status})` };
        if (response.truncated) return { ok: false, status: 422, error: 'Calendar too large (over 10 MB)' };
        const text = response.body.toString('utf8');
        // A CalDAV server answers a GET with a page of its own: a login opens its calendars.
        if (!/BEGIN:VCALENDAR/i.test(text)) return response.headers.dav ? { ok: true, answer: { status: 'login' } } : { ok: false, status: 422, error: NO_CALENDAR };
        return { ok: true, answer: { status: 'ready', kind: 'ics', url: address, name: parseIcs(text).name } };
      } catch (error) {
        return failed(error);
      }
    }
    const login = request.login;
    try {
      const calendars = await this.caldav.find(address, login);
      const asked = calendars.find(calendar => calendar.url === address);
      if (!asked && calendars.length > 1) return { ok: true, answer: { status: 'choose', calendars } };
      const calendar = asked ?? calendars[0]!;
      await this.caldav.read(calendar.url, login, sinceDay(this.options.now()));
      logins.set(request.id, { username: login.username, password: login.password, at: this.options.now() });
      if (record) void this.refresh(request.id);
      return { ok: true, answer: { status: 'ready', kind: 'caldav', url: calendar.url, name: calendar.name } };
    } catch (error) {
      return failed(error);
    }
  }

  /** One calendar read now (a reading under way is joined). */
  refresh(feedId: string): Promise<FeedOutcome> {
    const running = this.running.get(feedId);
    if (running) return running;
    const job = this.readFeed(feedId).finally(() => this.running.delete(feedId));
    this.running.set(feedId, job);
    return job;
  }

  /** What a push brought: a calendar made, its address changed, or deleted. */
  stored(feeds: readonly { readonly id: string; readonly fields: Fields }[]): void {
    for (const record of feeds) {
      if (record.id === HOLIDAYS_FEED_ID) continue;
      const feed = this.options.records.get('calendarFeed', record.id);
      if (!feed) continue;
      const deleted = typeof feed.fields.deletedAt === 'number';
      const url = typeof feed.fields.url === 'string' ? feed.fields.url : '';
      if (deleted || this.read.get(record.id)?.url !== url) void this.refresh(record.id);
    }
  }

  /** Every live calendar not read in six hours. */
  async refreshDue(): Promise<void> {
    const now = this.options.now();
    for (const record of this.options.records.ofType('calendarFeed')) {
      if (record.id === HOLIDAYS_FEED_ID || typeof record.fields.deletedAt === 'number' || (record.fields.kind !== 'ics' && record.fields.kind !== 'caldav')) continue;
      const last = this.read.get(record.id)?.at ?? (typeof record.fields.refreshedAt === 'number' ? record.fields.refreshedAt : 0);
      if (now - last >= FEED_INTERVAL_MS) await this.refresh(record.id);
    }
    this.options.logins.prune(id => {
      const feed = this.options.records.get('calendarFeed', id);
      return feed ? typeof feed.fields.deletedAt !== 'number' : null;
    }, now);
  }

  start(): void {
    const tick = (): void => {
      this.refreshDue().catch(error => log.error('calendar subscriptions failed', { error }));
    };
    setTimeout(tick, 15_000).unref();
    this.timer = setInterval(tick, 10 * 60_000);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await Promise.allSettled([...this.running.values()]);
  }

  private setFeed(feedId: string, fields: Fields): void {
    this.options.sync.apply([{ type: 'calendarFeed', id: feedId, patch: current => (typeof current.fields.deletedAt === 'number' ? null : fields) }]);
  }

  private async readFeed(feedId: string): Promise<FeedOutcome> {
    const { sync, records, fetcher, logins } = this.options;
    const now = this.options.now();
    const record = records.get('calendarFeed', feedId);
    if (!record || typeof record.fields.deletedAt === 'number') {
      dropFeedEvents(sync, records, feedId, now);
      this.read.delete(feedId);
      if (record) logins.delete(feedId);
      return { ok: false, status: 404, error: 'Calendar not found' };
    }
    const feed = feedFromRecord(record);
    if (feed.kind === 'holidays') return { ok: true };
    this.read.set(feedId, { url: feed.url, at: now });
    const address = feedAddress(feed.url);
    const fail = (error: string): FeedOutcome => {
      this.setFeed(feedId, { error });
      log.warn('calendar subscription failed', { feed: feedId, error });
      return { ok: false, status: 502, error };
    };
    if (!address) return fail('Invalid calendar address');
    let calendar: IcsCalendar;
    if (feed.kind === 'caldav') {
      const login = logins.get(feedId);
      if (!login) return fail(LOGIN_MISSING);
      try {
        calendar = await this.caldav.read(address, login, sinceDay(now));
      } catch (error) {
        return fail(readProblem(error));
      }
      return this.keep(feedId, feed.name, calendar, address, now);
    }
    let text: string;
    try {
      const response = await fetcher.fetch(address, { headers: { 'user-agent': USER_AGENT, accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5' }, maxBytes: FEED_MAX_BYTES, timeoutMs: FEED_TIMEOUT_MS });
      if (response.status === 404 || response.status === 410) return fail('This calendar no longer exists at this address');
      if (response.status === 401) return fail(NEEDS_LOGIN);
      if (response.status === 403) return fail('This calendar is private: use its secret address');
      if (response.status < 200 || response.status >= 300) return fail(`Le calendrier ne répond pas (HTTP ${response.status})`);
      if (response.truncated) return fail('Calendar too large (over 10 MB)');
      text = response.body.toString('utf8');
    } catch (error) {
      return fail(readProblem(error));
    }
    if (!/BEGIN:VCALENDAR/i.test(text)) return fail(NO_CALENDAR);
    return this.keep(feedId, feed.name, parseIcs(text), address, now);
  }

  /** A calendar read well: its events kept, the calendar said read (and named, when it had no name). */
  private keep(feedId: string, name: string, calendar: IcsCalendar, address: string, now: number): FeedOutcome {
    const { sync, records } = this.options;
    const drafts = feedDrafts(calendar, feedId, instantToDay(now, 'UTC'));
    const changed = applyFeedPlan(sync, records, feedId, drafts, now);
    this.setFeed(feedId, { refreshedAt: now, error: '', ...(name.trim() ? {} : { name: (calendar.name || feedNameFrom(address)).slice(0, 200) }) });
    log.info('calendar subscription read', { feed: feedId, events: drafts.length, changed });
    return { ok: true };
  }
}
