/**
 * A subscribed calendar (an iCalendar address) or the public holidays, as the server keeps them:
 * each event it serves becomes a record of Agenda's, marked with its calendar (`feedId`) and its
 * UID, so every device has it offline, its widgets and its search too. Each reading rewrites only
 * what changed: an event the address no longer serves goes to its tombstone, one that did not move is
 * not written again (the sync carries nothing). Events long past are left out, so a calendar years
 * old stays small.
 */
import { markupFromPlain } from '@unlease/core/services/richText';
import { isHttpUrl } from '@unlease/core/services/url';
import type { Fields } from '@unlease/core/sync/record';
import { EVENT_LIMITS, isLive, type CalendarEvent } from '../models/events';
import type { IcsCalendar, IcsEvent } from './ics';
import { eventLength } from './occurrences';
import { addDays, isDay } from './time';

/** Days back a subscribed event that does not repeat is still kept. */
export const FEED_PAST_DAYS = 400;
/** At most this many events from one calendar. */
export const FEED_MAX_EVENTS = 5000;

/** An event a calendar serves, before it has an id here. */
export interface FeedDraft {
  /** Its UID and, for an exception, the occurrence it replaces. */
  readonly key: string;
  readonly uid: string;
  readonly recurrenceId: string;
  readonly fields: Fields;
}

export const feedKey = (uid: string, recurrenceId: string): string => `${uid}|${recurrenceId}`;

/** The key of an event already kept: its UID, and the occurrence it replaces. */
export const storedFeedKey = (event: Pick<CalendarEvent, 'uid' | 'originalStart' | 'recurringId'>): string => feedKey(event.uid, event.recurringId ? event.originalStart : '');

/** An event's address from outside: a web address that fits, else none (never `javascript:`, `data:`, another app's scheme). */
export function feedUrl(value: string): string {
  const url = value.trim();
  return url.length <= EVENT_LIMITS.url && isHttpUrl(url) ? url : '';
}

/**
 * A calendar's own words are only words: its description becomes plain rich text (a `{` it holds
 * never reads as a link or a mention), and its address is kept only when it is the web's.
 */
function draftFields(event: IcsEvent, feedId: string, exdates: readonly string[]): Fields {
  return {
    title: event.title.slice(0, 1000),
    description: markupFromPlain(event.description, EVENT_LIMITS.description),
    place: event.place.slice(0, 1000),
    start: event.start,
    end: event.end,
    timeZone: event.timeZone,
    rrule: event.recurrenceId ? '' : event.rrule.slice(0, 1000),
    exdates: [...new Set(exdates)].slice(0, 1000),
    originalStart: event.recurrenceId,
    reminders: [],
    labelIds: [],
    contactIds: [],
    files: [],
    feedId,
    uid: event.uid.slice(0, 1000),
    url: feedUrl(event.url),
    color: null,
    trashedAt: null,
  };
}

/** What a calendar serves, as drafts: cancelled occurrences become their series' exdates; what ended long ago is left out. */
export function feedDrafts(calendar: IcsCalendar, feedId: string, today: string): FeedDraft[] {
  const since = addDays(today, -FEED_PAST_DAYS);
  const cancelled = new Map<string, string[]>();
  for (const event of calendar.events) {
    if (event.recurrenceId && event.cancelled) cancelled.set(event.uid, [...(cancelled.get(event.uid) ?? []), event.recurrenceId]);
  }
  const drafts = new Map<string, FeedDraft>();
  for (const event of calendar.events) {
    if (!event.uid || event.cancelled) continue;
    if (!event.rrule && !event.recurrenceId && event.end.slice(0, 10) < since) continue;
    if (event.recurrenceId && event.end.slice(0, 10) < since) continue;
    const key = feedKey(event.uid, event.recurrenceId);
    drafts.set(key, { key, uid: event.uid, recurrenceId: event.recurrenceId, fields: draftFields(event, feedId, [...event.exdates, ...(event.recurrenceId ? [] : cancelled.get(event.uid) ?? [])]) });
  }
  return [...drafts.values()].slice(0, FEED_MAX_EVENTS);
}

export interface FeedPlan {
  /** Records to write: a new one whole, a kept one with the fields that changed. */
  readonly writes: readonly { readonly id: string; readonly fields: Fields; readonly created: boolean }[];
  /** Kept events the calendar no longer serves: their tombstone. */
  readonly removals: readonly string[];
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The fields of `next` that differ from `current`. */
export function changedFields(current: Readonly<Record<string, unknown>>, next: Fields): Fields {
  const out: Fields = {};
  for (const [field, value] of Object.entries(next)) if (!same(current[field], value)) out[field] = value;
  return out;
}

/**
 * What to write so the kept events match the drafts. `stored` holds the calendar's events with their
 * raw fields; `makeId` mints an id for a new one; an exception points at its series' id here.
 */
export function planFeed(drafts: readonly FeedDraft[], stored: readonly { readonly event: CalendarEvent; readonly fields: Readonly<Record<string, unknown>> }[], makeId: () => string, now: number): FeedPlan {
  const kept = new Map<string, { readonly event: CalendarEvent; readonly fields: Readonly<Record<string, unknown>> }>();
  for (const entry of stored) if (entry.event.deletedAt === null) kept.set(storedFeedKey(entry.event), entry);
  const ids = new Map<string, string>();
  for (const draft of drafts) ids.set(draft.key, kept.get(draft.key)?.event.id ?? makeId());
  const writes: { id: string; fields: Fields; created: boolean }[] = [];
  for (const draft of drafts) {
    const id = ids.get(draft.key)!;
    const seriesId = draft.recurrenceId ? ids.get(feedKey(draft.uid, '')) ?? null : null;
    if (draft.recurrenceId && !seriesId) continue;
    const fields: Fields = { ...draft.fields, recurringId: seriesId };
    const existing = kept.get(draft.key);
    if (!existing) {
      writes.push({ id, fields: { ...fields, createdAt: now, deletedAt: null }, created: true });
      continue;
    }
    const changed = changedFields(existing.fields, fields);
    if (Object.keys(changed).length > 0) writes.push({ id, fields: changed, created: false });
  }
  const wanted = new Set(drafts.map(draft => draft.key));
  const removals = [...kept.entries()].filter(([key, entry]) => !wanted.has(key) && isLive(entry.event)).map(([, entry]) => entry.event.id);
  return { writes, removals };
}

/** An address as people paste it: `webcal://` read as `https://`, spaces trimmed; null for one that is no web address. */
export function feedAddress(typed: string): string | null {
  const value = typed.trim().replace(/^webcals?:\/\//i, 'https://');
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A name for a calendar from its address when it has none of its own (Google's: the account part). */
export function feedNameFrom(url: string): string {
  try {
    const parsed = new URL(url);
    const google = /\/calendar\/ical\/([^/]+)\//.exec(parsed.pathname);
    if (google) return decodeURIComponent(google[1]!).replace(/%40|@.*$/g, '').replace(/[._]/g, ' ').trim() || parsed.hostname;
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** How long an event of a calendar lasts, whatever it is (used in tests and the feed's summary). */
export const draftLength = (draft: FeedDraft): number => eventLength({ start: draft.fields.start as string, end: draft.fields.end as string });

/** Whether a draft is all day. */
export const draftAllDay = (draft: FeedDraft): boolean => isDay(draft.fields.start as string);
