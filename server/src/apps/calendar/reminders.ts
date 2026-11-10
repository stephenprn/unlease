/**
 * The web's reminders, as push notifications (`GET /api/calendar/push/key`,
 * `POST|DELETE /api/calendar/push/subscriptions`): a browser that subscribed with the server's key
 * hears of the reminders that rang since the last tick (`alarmsBetween`), worded in its language, an
 * all-day event's counted from midnight in its zone. A reminder's moment is always a whole minute, so
 * the ticks fall on the clock's minutes, a moment early (`LEAD_MS`) to make up for the push service's
 * own delay; a reminder rings within a second or two of its minute, not up to a minute after. Each
 * window starts where the last one ended (kept across restarts), so a reminder rings once; after a
 * stop, those still worth ringing ring late (`stillWorthRinging`). The browsers are told side by side,
 * so one slow push service holds back no other. A push lives until its reminder stops being worth it
 * (its TTL), so a phone offline for the evening is not told of the morning's meeting. A browser the
 * push service no longer knows (404, 410) is forgotten.
 */
import { APP_NAME } from '@unlease/calendar/brand';
import { isLive, type CalendarEvent } from '@unlease/calendar/models/events';
import { alarmStaleAt, alarmsBetween, LATE_RING_MS, stillWorthRinging, type Alarm } from '@unlease/calendar/services/alarms';
import { weekdayDay } from '@unlease/calendar/services/eventText';
import { hiddenFeedIds } from '@unlease/calendar/services/occurrences';
import { dayToInstant, instantToDay, instantToWall } from '@unlease/calendar/services/time';
import { addCalendarEnglish } from '@unlease/calendar/i18n';
import type { PushReminder, PushSubscriptionRequest } from '@unlease/calendar/sync/routes';
import { eventFromRecord, feedFromRecord } from '@unlease/calendar/sync/entities';
import { SELF_HOSTING_GUIDE } from '@unlease/core/apps';
import { getLocale, setLocale, t } from '@unlease/core/i18n';
import { readMeta, writeMeta, type Database } from '../../db/database';
import { log } from '../../log';
import type { RecordStore } from '../../sync/records';
import { encryptPayload, makeVapidKeys, vapidAuthorization, vapidPublicKey, type VapidKeys } from './webpush';

const KEYS = 'calendar.vapid';
const SUBSCRIPTIONS = 'calendar.push';
const TICK = 'calendar.pushTick';
const MINUTE = 60_000;
const DAY = 86_400_000;
/** How early a tick rings the minute's reminders: a push takes a second or so to reach the browser. */
export const LEAD_MS = 1_500;
/** How long a push service keeps a reminder for a browser away: never under a minute, never over a day. */
const TTL_MIN_S = 60;
const TTL_MAX_S = 86_400;
const SUBSCRIPTIONS_MAX = 50;

/** How long until the next tick: the next minute of the clock, `LEAD_MS` early. */
export function nextTickIn(now: number): number {
  const wait = MINUTE - ((now + LEAD_MS) % MINUTE);
  // A tick a moment ago already rang this minute: the next one.
  return wait < 1_000 ? wait + MINUTE : wait;
}

/** A push's time to live, in seconds: until ringing it stops being worth it. */
export function pushTtl(alarm: Alarm, now: number): number {
  return Math.max(TTL_MIN_S, Math.min(TTL_MAX_S, Math.round((alarmStaleAt(alarm) - now) / 1000)));
}

export type StoredSubscription = PushSubscriptionRequest;

export interface PushRemindersOptions {
  readonly db: Database;
  readonly records: RecordStore;
  readonly now: () => number;
  /** How push services are called (tests stand in). */
  readonly pushFetch?: typeof fetch;
}

let englishAdded = false;

export class PushReminders {
  private timer: NodeJS.Timeout | null = null;
  private ticking: Promise<number> | null = null;

  constructor(private readonly options: PushRemindersOptions) {}

  /** The server's key pair, made the first time. */
  keys(): VapidKeys {
    const stored = readMeta(this.options.db, KEYS);
    if (typeof stored === 'string') {
      try {
        const keys = JSON.parse(stored) as VapidKeys;
        if (keys.d && keys.x && keys.y) return keys;
      } catch {
        // Made again below.
      }
    }
    const keys = makeVapidKeys();
    writeMeta(this.options.db, KEYS, JSON.stringify(keys));
    return keys;
  }

  publicKey(): string {
    return vapidPublicKey(this.keys());
  }

  subscriptions(): StoredSubscription[] {
    const stored = readMeta(this.options.db, SUBSCRIPTIONS);
    try {
      const list = typeof stored === 'string' ? (JSON.parse(stored) as unknown) : [];
      return Array.isArray(list) ? (list as StoredSubscription[]) : [];
    } catch {
      return [];
    }
  }

  private save(list: readonly StoredSubscription[]): void {
    writeMeta(this.options.db, SUBSCRIPTIONS, JSON.stringify(list.slice(-SUBSCRIPTIONS_MAX)));
  }

  subscribe(subscription: PushSubscriptionRequest): void {
    this.save([...this.subscriptions().filter(each => each.endpoint !== subscription.endpoint), subscription]);
  }

  unsubscribe(endpoint: string): void {
    this.save(this.subscriptions().filter(each => each.endpoint !== endpoint));
  }

  /** Events whose reminders may ring: live, of the calendars shown. */
  private events(): CalendarEvent[] {
    const { records } = this.options;
    const hidden = hiddenFeedIds(records.ofType('calendarFeed').map(feedFromRecord));
    return records
      .ofType('calendarEvent')
      .map(eventFromRecord)
      .filter(event => event.deletedAt === null && !(event.feedId && hidden.has(event.feedId)));
  }

  /** The reminders ringing in [from, to) for a browser in `zone`. */
  alarmsFor(events: readonly CalendarEvent[], from: number, to: number, zone: string): Alarm[] {
    return alarmsBetween(events.filter(isLive), from - DAY, to + DAY)
      .map(alarm => (alarm.allDay ? { ...alarm, fireAt: dayToInstant(instantToDay(alarm.startAt, ''), zone) - alarm.minutes * MINUTE } : alarm))
      .filter(alarm => alarm.fireAt >= from && alarm.fireAt < to);
  }

  /** What a browser shows for one reminder, in its language. */
  reminder(alarm: Alarm, subscription: StoredSubscription): PushReminder {
    if (!englishAdded) {
      addCalendarEnglish();
      englishAdded = true;
    }
    const before = getLocale();
    setLocale(subscription.lang);
    try {
      const wall = instantToWall(alarm.startAt, alarm.allDay ? '' : subscription.timeZone);
      const day = weekdayDay(wall.slice(0, 10));
      const when = alarm.allDay ? `${day} · ${t('Toute la journée')}` : `${day} · ${wall.slice(11, 16)}`;
      return {
        title: alarm.title.trim() || APP_NAME,
        body: [when, alarm.place.trim()].filter(Boolean).join(' · '),
        path: `/agenda/event/${encodeURIComponent(alarm.seriesId)}?at=${encodeURIComponent(alarm.occurrence)}`,
        tag: alarm.key,
      };
    } finally {
      setLocale(before);
    }
  }

  /** One push to one browser, kept `ttl` seconds by its push service: false when it no longer knows the browser. */
  async send(subscription: StoredSubscription, reminder: PushReminder, ttl = TTL_MIN_S): Promise<boolean> {
    const now = this.options.now();
    const body = encryptPayload(Buffer.from(JSON.stringify(reminder)), subscription.keys);
    const response = await (this.options.pushFetch ?? fetch)(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidAuthorization(this.keys(), subscription.endpoint, SELF_HOSTING_GUIDE, now),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: 'high',
        Topic: reminder.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(-32),
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404 || response.status === 410) return false;
    if (response.status >= 400) log.warn('push refused', { status: response.status, service: new URL(subscription.endpoint).host });
    return true;
  }

  /** The reminders that rang since the last tick, sent; returns how many pushes went. */
  tick(): Promise<number> {
    this.ticking ??= this.ring().finally(() => {
      this.ticking = null;
    });
    return this.ticking;
  }

  private async ring(): Promise<number> {
    const { db } = this.options;
    const now = this.options.now();
    // The minute about to strike rings now: its push reaches the browser on the minute.
    const until = now + LEAD_MS;
    const stored = readMeta(db, TICK);
    const from = typeof stored === 'number' ? Math.max(stored, now - LATE_RING_MS) : now;
    writeMeta(db, TICK, Math.max(until, typeof stored === 'number' ? stored : 0));
    const subscriptions = this.subscriptions();
    if (from >= until || subscriptions.length === 0) return 0;
    const events = this.events();
    let sent = 0;
    const gone = new Set<string>();
    await Promise.all(
      subscriptions.map(async subscription => {
        // Those that went by while the server was stopped ring only if still worth it.
        for (const alarm of this.alarmsFor(events, from, until, subscription.timeZone).filter(each => stillWorthRinging(each, now))) {
          try {
            if (!(await this.send(subscription, this.reminder(alarm, subscription), pushTtl(alarm, now)))) {
              gone.add(subscription.endpoint);
              return;
            }
            sent += 1;
          } catch (error) {
            log.warn('push failed', { error: error instanceof Error ? error.message : String(error) });
          }
        }
      }),
    );
    if (gone.size > 0) this.save(this.subscriptions().filter(each => !gone.has(each.endpoint)));
    return sent;
  }

  /** Ticks on the clock's minutes (`nextTickIn`), each scheduling the next once it is done. */
  start(): void {
    if (this.timer) return;
    const next = (): void => {
      this.timer = setTimeout(() => {
        this.tick()
          .catch(error => log.error('calendar reminders failed', { error }))
          .finally(() => {
            if (this.timer) next();
          });
      }, nextTickIn(Date.now()));
      this.timer.unref();
    };
    next();
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.ticking?.catch(() => 0);
  }
}
