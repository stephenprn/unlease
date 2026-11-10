/**
 * Subscribed calendars (`calendarFeed` records of kind `ics`): the server reads each address through
 * the suite's guarded reader (`webcal://` as `https://`, public addresses only, 10 MB at most) and
 * keeps its events as Agenda's records, marked with the calendar (`feedId`), rewriting only what
 * changed (`planFeed`). An address is read when its calendar is made or its address changes, every
 * six hours, and when someone asks (`POST /api/calendar/feeds/:id/refresh`); a calendar deleted takes
 * its events with it. A reading that fails says why on the calendar (`error`), and what it served
 * before stays.
 */
import { HOLIDAYS_FEED_ID } from '@unlease/calendar/models/events';
import { feedAddress, feedDrafts, feedNameFrom, planFeed, type FeedDraft } from '@unlease/calendar/services/feeds';
import { parseIcs } from '@unlease/calendar/services/ics';
import { instantToDay } from '@unlease/calendar/services/time';
import { eventFromRecord, feedFromRecord } from '@unlease/calendar/sync/entities';
import { createId } from '@unlease/core/services/ids';
import type { Fields } from '@unlease/core/sync/record';
import { log } from '../../log';
import { FetchError, type Fetcher } from '../../reading/fetcher';
import type { RecordStore } from '../../sync/records';
import type { ServerEdit, SyncService } from '../../sync/service';

/** How often a calendar is read again. */
export const FEED_INTERVAL_MS = 6 * 3_600_000;
export const FEED_MAX_BYTES = 10 * 1024 * 1024;
const FEED_TIMEOUT_MS = 30_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; calendar subscription)';

export interface FeedReaderOptions {
  readonly sync: SyncService;
  readonly records: RecordStore;
  readonly fetcher: Fetcher;
  readonly now: () => number;
}

export type FeedOutcome = { readonly ok: true } | { readonly ok: false; readonly status: 404 | 502; readonly error: string };

/** Why an address could not be read, in the words the apps show (French; translated there). */
function readProblem(error: unknown): string {
  if (error instanceof FetchError) {
    if (error.code === 'invalid_url') return 'Adresse de calendrier invalide';
    if (error.code === 'blocked') return 'Cette adresse n’est pas publique';
    if (error.code === 'timeout') return 'Le calendrier met trop de temps à répondre';
  }
  return 'Calendrier injoignable';
}

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

  constructor(private readonly options: FeedReaderOptions) {}

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
      if (record.id === HOLIDAYS_FEED_ID || typeof record.fields.deletedAt === 'number' || record.fields.kind !== 'ics') continue;
      const last = this.read.get(record.id)?.at ?? (typeof record.fields.refreshedAt === 'number' ? record.fields.refreshedAt : 0);
      if (now - last >= FEED_INTERVAL_MS) await this.refresh(record.id);
    }
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
    const { sync, records, fetcher } = this.options;
    const now = this.options.now();
    const record = records.get('calendarFeed', feedId);
    if (!record || typeof record.fields.deletedAt === 'number') {
      dropFeedEvents(sync, records, feedId, now);
      this.read.delete(feedId);
      return { ok: false, status: 404, error: 'Calendrier introuvable' };
    }
    const feed = feedFromRecord(record);
    if (feed.kind !== 'ics') return { ok: true };
    this.read.set(feedId, { url: feed.url, at: now });
    const address = feedAddress(feed.url);
    const fail = (error: string): FeedOutcome => {
      this.setFeed(feedId, { error });
      log.warn('calendar subscription failed', { feed: feedId, error });
      return { ok: false, status: 502, error };
    };
    if (!address) return fail('Adresse de calendrier invalide');
    let text: string;
    try {
      const response = await fetcher.fetch(address, { headers: { 'user-agent': USER_AGENT, accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5' }, maxBytes: FEED_MAX_BYTES, timeoutMs: FEED_TIMEOUT_MS });
      if (response.status === 404 || response.status === 410) return fail('Ce calendrier n’existe plus à cette adresse');
      if (response.status === 401 || response.status === 403) return fail('Ce calendrier est privé : utilisez son adresse secrète');
      if (response.status < 200 || response.status >= 300) return fail(`Le calendrier ne répond pas (HTTP ${response.status})`);
      if (response.truncated) return fail('Calendrier trop gros (plus de 10 Mo)');
      text = response.body.toString('utf8');
    } catch (error) {
      return fail(readProblem(error));
    }
    if (!/BEGIN:VCALENDAR/i.test(text)) return fail('Cette adresse ne sert pas un calendrier (iCalendar)');
    const calendar = parseIcs(text);
    const drafts = feedDrafts(calendar, feedId, instantToDay(now, 'UTC'));
    const changed = applyFeedPlan(sync, records, feedId, drafts, now);
    this.setFeed(feedId, { refreshedAt: now, error: '', ...(feed.name.trim() ? {} : { name: (calendar.name || feedNameFrom(address)).slice(0, 200) }) });
    log.info('calendar subscription read', { feed: feedId, events: drafts.length, changed });
    return { ok: true };
  }
}
