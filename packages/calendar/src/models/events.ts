/**
 * Agenda's stored entities: an event (`calendarEvent`), a label (`calendarLabel`) and a calendar
 * one subscribes to (`calendarFeed`: an iCalendar address, or the public holidays the server fetches).
 * Each is a sync record: every field travels with its own clock. Epoch ms. Rows are never removed:
 * `deletedAt` is the tombstone.
 *
 * **When** an event happens is written as a wall time and a zone, as iCalendar does, so a repeating
 * event keeps its hour across daylight saving and a trip: `start` is `2026-11-02T14:30` (a time of
 * day in `timeZone`, an IANA name such as `Europe/Paris`) or `2026-11-02` (all day, no zone). `end`
 * has the same form; an all-day event's `end` is the day after its last one (iCalendar's DTEND).
 */
import { foldText } from '@unlease/core/services/search';
import type { LineColor } from '@unlease/design/colors';

/** A day as stored: `2026-11-02`. */
export type Day = string;
/** A time of day as stored: `2026-11-02T14:30`. */
export type Wall = string;

export const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export const WALL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** A file joined to an event (a ticket, a programme): kept as a page's files are, in the drive under `Agenda/`. */
export interface EventFile {
  /** The blob's id (`/api/files/<id>`, or `/api/blobs/<id>` for a picture). */
  readonly id: string;
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
  /** The server has it: other devices may open it. */
  readonly uploaded: boolean;
}

export interface CalendarEvent {
  readonly id: string;
  /** Typed text, merged word by word. */
  readonly title: string;
  /** Rich text (`core/services/richText`): mentions of pages, notes, contacts, events; merged word by word. */
  readonly description: string;
  /** Where, as typed (an address, a room, a link). */
  readonly place: string;
  readonly start: string;
  readonly end: string;
  /** The zone `start` and `end` are read in; '' for an all-day event, or a floating time (read in the device's zone). */
  readonly timeZone: string;
  /** iCalendar's RRULE (`FREQ=WEEKLY;BYDAY=MO`), '' when it does not repeat. */
  readonly rrule: string;
  /** The occurrences taken out of the series, by their start as stored. */
  readonly exdates: readonly string[];
  /** An exception to a series: the series' id, and which of its occurrences it replaces. */
  readonly recurringId: string | null;
  readonly originalStart: string;
  /** Minutes before the start a reminder rings; an all-day event's count from its day's midnight (-540: 9:00 that day). */
  readonly reminders: readonly number[];
  readonly labelIds: readonly string[];
  /** The people it is with: contacts of the address book. */
  readonly contactIds: readonly string[];
  readonly files: readonly EventFile[];
  /** The calendar it comes from (a subscription, the holidays), read-only; null for one's own. */
  readonly feedId: string | null;
  /** iCalendar's UID: an imported or subscribed event's, kept so it is never added twice; '' for one made here. */
  readonly uid: string;
  /** An address it came with (an invitation's, a subscribed event's). */
  readonly url: string;
  /** Its own colour, over its labels' and its calendar's; null for theirs. */
  readonly color: LineColor | null;
  readonly trashedAt: number | null;
  readonly createdAt: number;
  readonly deletedAt: number | null;
  /** The newest field clock's time; not a synced field. */
  readonly editedAt: number;
}

export interface CalendarLabel {
  readonly id: string;
  readonly name: string;
  readonly color: LineColor;
  readonly position: string;
  readonly createdAt: number;
  readonly deletedAt: number | null;
}

/** Whether a live label of `labels` already has that name (accents and case aside), other than `except`. */
export function labelNameTaken(labels: Readonly<Record<string, CalendarLabel>>, name: string, except: string | null = null): boolean {
  const wanted = foldText(name.trim());
  return !!wanted && Object.values(labels).some(label => label.deletedAt === null && label.id !== except && foldText(label.name) === wanted);
}

/**
 * An iCalendar address one subscribes to (`ics`), a calendar read over CalDAV with a login
 * (`caldav`: its password kept by the server alone), or the public holidays.
 */
export const FEED_KINDS = ['ics', 'caldav', 'holidays'] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

/** The holidays' calendar: the server makes it (and only it), with this id. */
export const HOLIDAYS_FEED_ID = 'holidays';

export interface CalendarFeed {
  readonly id: string;
  readonly kind: FeedKind;
  readonly name: string;
  /** The address (`https://calendar.google.com/calendar/ical/…/basic.ics`, `webcal://…`, a CalDAV calendar's); '' for the holidays. */
  readonly url: string;
  /** The login a CalDAV calendar is read with (its password stays on the server); '' otherwise. */
  readonly account: string;
  readonly color: LineColor;
  /** Left out of the views, on every device. */
  readonly hidden: boolean;
  readonly position: string;
  /** When the server last read it well; null before the first time. */
  readonly refreshedAt: number | null;
  /** Why the last reading failed (French, the server's words); '' when it went well. */
  readonly error: string;
  readonly createdAt: number;
  readonly deletedAt: number | null;
}

/** The bounds every client and the server hold to. */
export const EVENT_LIMITS = {
  title: 1000,
  description: 50_000,
  place: 1000,
  rrule: 1000,
  exdates: 1000,
  reminders: 5,
  labels: 20,
  contacts: 100,
  files: 20,
  fileName: 255,
  uid: 1000,
  url: 4000,
  labelName: 60,
  feedName: 200,
  feedError: 500,
  feedAccount: 320,
  timeZone: 64,
} as const;

/** The typed fields' limits, by type (the sync's `merged`). */
export const CALENDAR_TEXT_LIMITS = {
  calendarEvent: { title: EVENT_LIMITS.title, description: EVENT_LIMITS.description },
} as const;

/** What a field reads as before it is first written: a rollback writes it back where a backup never had it. */
export const EVENT_FIELD_DEFAULTS = {
  description: '',
  place: '',
  rrule: '',
  exdates: [],
  recurringId: null,
  originalStart: '',
  reminders: [],
  labelIds: [],
  contactIds: [],
  files: [],
  feedId: null,
  uid: '',
  url: '',
  color: null,
} as const;

/** A reminder can ring at most four weeks before, or a day after an all-day event's midnight. */
export const REMINDER_RANGE = { min: -1440, max: 40_320 } as const;

/** Live: neither tombstoned nor in the bin. */
export const isLive = (item: { readonly deletedAt: number | null; readonly trashedAt?: number | null }): boolean => item.deletedAt === null && (item.trashedAt ?? null) === null;

/** An event of one's own: not a subscription's or the holidays', so it can be changed. */
export const isOwn = (event: Pick<CalendarEvent, 'feedId'>): boolean => event.feedId === null;

/** All day: its start is a day, not a time. */
export const isAllDay = (event: Pick<CalendarEvent, 'start'>): boolean => DAY_PATTERN.test(event.start);

/** Trash retention, as the other apps': a week. */
export const TRASH_RETENTION_DAYS = 7;
