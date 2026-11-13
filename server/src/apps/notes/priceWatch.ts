/**
 * « Suivi des prix » on the server: the links of every live collection that switched the module on
 * (`notes/services/priceWatch`), each something to buy not bought yet, have their price read once a
 * day from the shop's own page, and the change written on the link under the server's clock
 * (`priceUpdate`: `price`, `currency`, `priceBefore`, `priceChangedAt`, `priceCheckedAt`).
 *
 * - **When:** each link at its own minute of the (UTC) day, drawn from its id, so a collection's
 *   checks spread over the whole day; a link never checked is due at once, one checked lately (by a
 *   person, after a failure) waits for its minute at least six hours later. A round every ten
 *   minutes takes at most twelve due links.
 * - **Politely:** one page at a time, 15 to 30 seconds apart, the same shop at most once every five
 *   minutes (its other links wait for the next round), through the suite's guarded reader (its user
 *   agent, its limits, public addresses only).
 * - **Free first:** the price in the page's own data (its JSON-LD offers, then its price meta tags).
 * - **Claude when the page hides it:** at most once a week a link (whatever came of it), at most
 *   five a day for the whole server, never once the month's budget is spent, and the daily round
 *   stops at 80 % of it so the person's own asks keep the rest. A short dedicated call
 *   (`analysis/price.ts`), billed as task `price`.
 * - **Nothing read** (the page gone, unreachable, or hiding its price past those limits): nothing is
 *   written, the last price stays, `priceCheckedAt` still says when a price was last read; the link
 *   is tried again at its next minute.
 *
 * « Vérifier le prix » (`POST /api/notes/price-check`) reads one link now the same way, joining a
 * reading under way; a link read in the last minute, or a thirty-first ask in an hour, is refused.
 */
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { isHttpUrl, normalizeUrl } from '@unlease/core/services/url';
import type { LinkItem, Note } from '@unlease/notes/models/entities';
import { isPrice, isWatched, priceUpdate, type PriceOutcome, type PriceSeen } from '@unlease/notes/services/priceWatch';
import { linkFromRecord, noteFromRecord } from '@unlease/notes/sync/entities';
import { parsePriceCheckRequest, PRICE_CHECK_PATH, type PriceCheckResponse } from '@unlease/notes/sync/priceWatch';
import { BudgetSpentError, ModelError } from '../../claude/client';
import { BUDGET_SPENT, withCutOffCall } from '../../claude/outcome';
import type { ClaudeContext } from '../../claude/provider';
import type { CallUsage, UsageStore } from '../../claude/usage';
import type { Database } from '../../db/database';
import { log } from '../../log';
import type { Fetcher } from '../../reading/fetcher';
import { isReadable, readLink, type LinkRead } from '../../reading/reader';
import type { RecordStore } from '../../sync/records';
import type { SyncService } from '../../sync/service';
import type { Env } from '../types';
import { priceDigest, readPrice } from './analysis/price';

/** Its rows in the suite's spending (`analyses.task`): Claude reading a price. */
export const PRICE_TASK = 'price';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How often a round looks for due links, and how soon after the start the first one does. */
export const ROUND_MS = 10 * MINUTE;
const FIRST_ROUND_MS = 2 * MINUTE;
/** Links one round reads at most: 72 an hour, enough for any person's lists, gentle for any shop. */
export const ROUND_LINKS = 12;
/** Between two pages: 15 s, and up to 15 s more. */
const PAUSE_MS = 15_000;
/** The same shop read again by the round at most this often. */
export const SHOP_GAP_MS = 5 * MINUTE;
/** A link checked lately (by a person, or a failure) waits for its minute at least this long. */
export const MIN_GAP_MS = 6 * HOUR;
/** Claude reads one link's price at most once in this. */
export const CLAUDE_EVERY_MS = 7 * DAY;
/** Claude's readings of prices in one (UTC) day, for the whole server. */
export const CLAUDE_PER_DAY = 5;
/** The daily round asks Claude only below this share of the month's budget. */
export const ROUND_BUDGET_SHARE = 0.8;
/** « Vérifier le prix »: one link again after this, and this many asks an hour. */
const ASK_AGAIN_MS = MINUTE;
const ASKS_PER_HOUR = 30;
const READ_DEADLINE_MS = 30_000;
/** The page and Claude, within the apps' wait (100 s). */
const CHECK_DEADLINE_MS = 85_000;

export const PRICE_WORDS = {
  invalid: 'Invalid price check request',
  gone: 'Link not found',
  again: 'Price checked a moment ago: try again in a minute.',
  tooMany: 'Too many price checks: try again in a while.',
  hidden: 'This page does not show its price.',
  week: 'This page hides its price, and Claude already read it this week.',
  day: 'This page hides its price, and Claude has read enough prices for today.',
  budget: 'This page hides its price, and this month’s Claude budget is reached.',
  none: 'Claude found no price on this page.',
} as const;

/** A link's minute of the day, from its id (FNV-1a): the day's readings spread evenly. */
export function slotOf(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % (DAY / MINUTE)) * MINUTE;
}

/** The link's minute, the last time it came (today's, or yesterday's while today's is still ahead). */
export function lastSlot(id: string, now: number): number {
  const at = Math.floor(now / DAY) * DAY + slotOf(id);
  return at <= now ? at : at - DAY;
}

/** Whether a link last read (or tried) at `last` is due: never read, or its minute has come since, six hours on at least. */
export function isDue(id: string, last: number | null, now: number): boolean {
  if (last === null) return true;
  return last < lastSlot(id, now) && now - last >= MIN_GAP_MS;
}

/** How a reading ended. */
type Reading =
  | { readonly kind: 'read'; readonly outcome: PriceOutcome; readonly by: 'page' | 'claude'; readonly link: LinkItem }
  | { readonly kind: 'hidden'; readonly note: string; readonly link: LinkItem }
  | { readonly kind: 'failed'; readonly error: string }
  | { readonly kind: 'gone' };

export type PriceCheckOutcome = { readonly ok: true; readonly answer: PriceCheckResponse } | { readonly ok: false; readonly status: 400 | 404 | 409 | 502; readonly error: string };

export interface PriceWatchOptions {
  readonly db: Database;
  readonly records: RecordStore;
  readonly sync: SyncService;
  readonly usage: UsageStore;
  readonly fetcher: Fetcher;
  /** Claude's client and the month's budget, read at each reading (a key set from the apps applies at once). */
  readonly claude: () => ClaudeContext;
  readonly now: () => number;
  /** The wait between two pages (tests: none). */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  readonly random?: () => number;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export class PriceWatch {
  private timer: NodeJS.Timeout | null = null;
  private first: NodeJS.Timeout | null = null;
  /** Aborted at `stop`: the round and the readings under way end. */
  private stopping = new AbortController();
  private round: Promise<void> | null = null;
  /** Readings under way, by link: a second ask joins the first. */
  private readonly running = new Map<string, Promise<Reading>>();
  /** When each link was last tried (read or not), since this server started. */
  private readonly tried = new Map<string, number>();
  /** When the round last read a page of each shop. */
  private readonly shops = new Map<string, number>();
  /** When « Vérifier le prix » was asked, this last hour. */
  private asks: number[] = [];
  private readonly claudeLast;
  private readonly claudeCount;

  constructor(private readonly options: PriceWatchOptions) {
    this.claudeLast = options.db.prepare(`SELECT MAX(created_at) AS at FROM analyses WHERE task = '${PRICE_TASK}' AND link_id = ?`);
    this.claudeCount = options.db.prepare(`SELECT COUNT(*) AS count FROM analyses WHERE task = '${PRICE_TASK}' AND created_at >= ?`);
  }

  start(): void {
    this.stopping = new AbortController();
    const tick = (): void => {
      if (this.round) return;
      const signal = this.stopping.signal;
      this.round = this.runRound(signal)
        .then(() => undefined, (error: unknown) => log.error('the price watch’s round failed', { error }))
        .finally(() => (this.round = null));
    };
    this.first = setTimeout(tick, FIRST_ROUND_MS);
    this.first.unref();
    this.timer = setInterval(tick, ROUND_MS);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
    this.first = null;
    this.timer = null;
    this.stopping.abort();
    await Promise.allSettled([this.round, ...this.running.values()]);
  }

  /** The watched links whose minute has come, the longest unread first. */
  dueLinks(now: number): LinkItem[] {
    const lines = new Map<string, Note>();
    for (const record of this.options.records.ofType('note')) {
      if (record.fields.kind === 'links') lines.set(record.id, noteFromRecord(record));
    }
    const due: { link: LinkItem; last: number }[] = [];
    for (const record of this.options.records.ofType('link')) {
      if (record.fields.status === 'pending') continue;
      const link = linkFromRecord(record);
      if (!isWatched(link, lines.get(link.noteId)) || !isHttpUrl(link.url)) continue;
      const last = Math.max(link.priceCheckedAt ?? 0, this.tried.get(link.id) ?? 0);
      if (isDue(link.id, last === 0 ? null : last, now)) due.push({ link, last });
    }
    return due.sort((a, b) => a.last - b.last).map(entry => entry.link);
  }

  /** One round: the due links, one page at a time, a pause between, each shop once. Returns how many were read. */
  async runRound(signal: AbortSignal = this.stopping.signal): Promise<number> {
    const sleep = this.options.sleep ?? wait;
    const random = this.options.random ?? Math.random;
    let count = 0;
    for (const link of this.dueLinks(this.options.now())) {
      if (signal.aborted || count >= ROUND_LINKS) break;
      const shop = hostOf(normalizeUrl(link.url));
      const lastVisit = this.shops.get(shop);
      if (lastVisit !== undefined && this.options.now() - lastVisit < SHOP_GAP_MS) continue;
      if (count > 0) await sleep(PAUSE_MS + Math.round(random() * PAUSE_MS), signal);
      if (signal.aborted) break;
      this.shops.set(shop, this.options.now());
      const reading = await this.reading(link.id, 'round', signal);
      if (reading.kind === 'failed') log.debug('price not read', { id: link.id, error: reading.error });
      count += 1;
    }
    if (count > 0) log.info('price watch round', { links: count });
    return count;
  }

  /** « Vérifier le prix »: one link now, as the route answers it. */
  async check(linkId: string): Promise<PriceCheckOutcome> {
    const record = this.options.records.get('link', linkId);
    if (!record || typeof record.fields.deletedAt === 'number') return { ok: false, status: 404, error: PRICE_WORDS.gone };
    const now = this.options.now();
    let job = this.running.get(linkId);
    if (!job) {
      const tried = this.tried.get(linkId);
      if (tried !== undefined && now - tried < ASK_AGAIN_MS) return { ok: false, status: 409, error: PRICE_WORDS.again };
      this.asks = this.asks.filter(at => now - at < HOUR);
      if (this.asks.length >= ASKS_PER_HOUR) return { ok: false, status: 409, error: PRICE_WORDS.tooMany };
      this.asks.push(now);
      job = this.reading(linkId, 'person', AbortSignal.any([this.stopping.signal, AbortSignal.timeout(CHECK_DEADLINE_MS)]));
    }
    const reading = await job;
    if (reading.kind === 'gone') return { ok: false, status: 404, error: PRICE_WORDS.gone };
    if (reading.kind === 'failed') return { ok: false, status: 502, error: reading.error };
    const { link } = reading;
    return {
      ok: true,
      answer: {
        outcome: reading.kind === 'read' ? reading.outcome : 'hidden',
        price: link.price,
        currency: link.price === null ? null : link.currency,
        before: link.priceBefore,
        by: reading.kind === 'read' ? reading.by : null,
        note: reading.kind === 'hidden' ? reading.note : '',
      },
    };
  }

  /** One link's reading, joined when one is under way. */
  private reading(linkId: string, by: 'round' | 'person', signal: AbortSignal): Promise<Reading> {
    const running = this.running.get(linkId);
    if (running) return running;
    const job = this.read(linkId, by, signal)
      .catch((error: unknown): Reading => {
        log.error('price reading crashed', { id: linkId, error });
        return { kind: 'failed', error: 'Internal error' };
      })
      .finally(() => {
        this.running.delete(linkId);
        this.tried.set(linkId, this.options.now());
      });
    this.running.set(linkId, job);
    return job;
  }

  private async read(linkId: string, by: 'round' | 'person', signal: AbortSignal): Promise<Reading> {
    const record = this.options.records.get('link', linkId);
    if (!record || typeof record.fields.deletedAt === 'number') return { kind: 'gone' };
    const link = linkFromRecord(record);
    const url = normalizeUrl(link.url);
    if (!isHttpUrl(url)) return { kind: 'failed', error: 'Invalid address' };
    const read = await readLink(url, this.options.fetcher, AbortSignal.any([signal, AbortSignal.timeout(READ_DEADLINE_MS)]));
    if (signal.aborted) return { kind: 'failed', error: 'Analysis interrupted' };
    const seen = pagePrice(read);
    if (seen) return this.write(linkId, url, seen, 'page');
    // Gone for good, or refused: nobody, Claude included, would find a price there.
    if (read.fatal) return { kind: 'failed', error: read.error ?? 'Page introuvable' };
    return this.askClaude(link, url, read, by, signal);
  }

  /** The page hides its price: Claude reads it, within its limits. */
  private async askClaude(link: LinkItem, url: string, read: LinkRead, by: 'round' | 'person', signal: AbortSignal): Promise<Reading> {
    const { usage } = this.options;
    const now = this.options.now();
    const readable = isReadable(read) && read.page !== null;
    // Not read, and no reason Claude was not asked that says more than the page's own failure.
    const refuse = (note: string): Reading => (readable ? { kind: 'hidden', note, link } : { kind: 'failed', error: read.error ?? 'Unreadable page' });
    const { client, budgetUsd } = this.options.claude();
    if (!client) return refuse(PRICE_WORDS.hidden);
    const lastAsked = (this.claudeLast.get(link.id) as { at: number | null } | undefined)?.at ?? null;
    if (lastAsked !== null && now - lastAsked < CLAUDE_EVERY_MS) return refuse(PRICE_WORDS.week);
    const today = Number((this.claudeCount.get(Math.floor(now / DAY) * DAY) as { count: number }).count);
    if (today >= CLAUDE_PER_DAY) return refuse(PRICE_WORDS.day);
    // The round leaves a fifth of the month to what the person asks for.
    if (by === 'round' && usage.committed() >= budgetUsd * ROUND_BUDGET_SHARE) return refuse(PRICE_WORDS.budget);
    const hold = usage.hold(budgetUsd);
    if (!hold) return refuse(PRICE_WORDS.budget);
    const started = now;
    const record = (spent: CallUsage | null, error: string | null, found: PriceSeen | null): void =>
      usage.record(PRICE_TASK, { linkId: link.id, url, usage: spent, ok: error === null, error, durationMs: this.options.now() - started, result: found ? { price: found.amount, currency: found.currency } : null });
    try {
      const answer = await readPrice(
        client.holding(hold),
        { url, title: link.title, last: link.price === null ? null : `${link.price} ${link.currency ?? ''}`.trim(), digest: readable ? priceDigest(read) : null },
        AbortSignal.any([signal, AbortSignal.timeout(CHECK_DEADLINE_MS - READ_DEADLINE_MS)]),
      );
      if (answer.amount === null) {
        record(answer.usage, null, null);
        return readable ? { kind: 'hidden', note: PRICE_WORDS.none, link } : { kind: 'failed', error: PRICE_WORDS.none };
      }
      const seen = { amount: answer.amount, currency: answer.currency };
      record(answer.usage, null, seen);
      log.info('price read by Claude', { id: link.id, costUsd: Math.round(answer.usage.costUsd * 10_000) / 10_000 });
      return this.write(link.id, url, seen, 'claude');
    } catch (error) {
      const message = error instanceof ModelError ? error.message : 'Reading error';
      if (!(error instanceof ModelError)) log.error('price reading by Claude crashed', { id: link.id, error });
      // Cut off, it was reading a page (with web_fetch at most), never searching.
      const spent = error instanceof ModelError ? error.usage : null;
      record(signal.aborted ? withCutOffCall(spent, client.model, true) : spent, message, null);
      if (error instanceof BudgetSpentError) return refuse(PRICE_WORDS.budget);
      return { kind: 'failed', error: message === BUDGET_SPENT ? PRICE_WORDS.budget : message };
    } finally {
      hold.release();
    }
  }

  /** The price on the link, as it stands when written: one server edit. */
  private write(linkId: string, url: string, seen: PriceSeen, by: 'page' | 'claude'): Reading {
    const result: { outcome: PriceOutcome | null; moved: boolean } = { outcome: null, moved: false };
    const written = this.options.sync.apply([
      {
        type: 'link',
        id: linkId,
        patch: current => {
          if (typeof current.fields.deletedAt === 'number') return null;
          // The address changed while its page was read: this price is another page's.
          if (normalizeUrl(typeof current.fields.url === 'string' ? current.fields.url : '') !== url) {
            result.moved = true;
            return null;
          }
          const update = priceUpdate(linkFromRecord(current), seen, this.options.now());
          result.outcome = update.outcome;
          return { ...update.fields };
        },
      },
    ]);
    const record = written[0] ?? this.options.records.get('link', linkId);
    if (!record || typeof record.fields.deletedAt === 'number') return { kind: 'gone' };
    const { outcome } = result;
    if (result.moved || outcome === null) return { kind: 'failed', error: 'Analysis interrupted' };
    if (outcome === 'changed') log.info('price changed', { id: linkId, by });
    return { kind: 'read', outcome, by, link: linkFromRecord(record) };
  }
}

/** The page's own price: its structured data's lowest current offer, else its price meta tags. */
export function pagePrice(read: LinkRead): PriceSeen | null {
  for (const price of [read.page?.structuredPrice, read.page?.metaPrice]) {
    if (price && isPrice(price.amount)) return { amount: price.amount, currency: price.currency };
  }
  return null;
}

const tooLarge = (c: Context) => c.json({ error: 'body too large' }, 413);

/** `POST /api/notes/price-check`: « Vérifier le prix » on one link. */
export function priceWatchRoutes(app: Hono<Env>, watch: PriceWatch): void {
  app.post(PRICE_CHECK_PATH, bodyLimit({ maxSize: 4 * 1024, onError: tooLarge }), async c => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid request' }, 400);
    }
    const request = parsePriceCheckRequest(body);
    if (!request) return c.json({ error: PRICE_WORDS.invalid }, 400);
    const outcome = await watch.check(request.linkId);
    if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
    return c.json(outcome.answer, 200, { 'Cache-Control': 'no-store' });
  });
}
