/**
 * The morning digest: « Aujourd'hui » summed up in one notification, at a time the person picks
 * (Réglages: `CalendarPrefs.digest`, `digestAt`, `digestEmpty`), worded the same on both clients:
 *
 * - on the phone, Agenda's book arms it (`mobile/calendar/src/app/reminders.ts`, on `planAlarms`),
 *   its words taken from the day as the view gathers it (`digestEntries` of a `TodayPlan`), armed
 *   again whenever they change and by the hourly `remindersTask`;
 * - on the web, the server pushes it to the browsers that asked (`PushReminders`), gathering the
 *   day in the browser's zone (`zonedDigest`), since the server's own clock may stand elsewhere.
 *
 * A title that counts (« Aujourd’hui : 3 événements, Anniversaire de Léa »), then a line per thing in
 * the day's order (`DIGEST_LINES`, then « Et 2 autres éléments »), and Carnet's reminders missed and
 * still set. A day with nothing says so only when asked (« Même les jours sans rien »). Weather is
 * left out: arming happens offline, and a forecast asked at night may be wrong by morning.
 */
import { t } from '@unlease/core/i18n';
import { formatClock, plural } from '@unlease/core/services/format';
import type { Contact } from '@unlease/contacts/models/contacts';
import type { Note } from '@unlease/notes/models/entities';
import type { CalendarEvent, Day } from '../models/events';
import { birthdayTitle, clockWords } from './eventText';
import { birthdaysIn, remindersIn } from './layers';
import { occurrencesIn, type OccurrenceFilter } from './occurrences';
import { addDays, dayToInstant, instantToDay, instantToWall, wallToInstant } from './time';
import { OVERDUE_DAYS, rowTimeWords, type DayPage, type DayRow, type TodayPlan } from './today';

/** The times offered, every half hour from 5:30 to 10:00. */
export const DIGEST_TIMES = ['05:30', '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00'] as const;
export const DIGEST_AT = '07:30';
/** How long after its moment a digest not rung (the phone off, the server stopped) still rings: never past noon. */
export const DIGEST_LATE_MS = 2 * 3_600_000;
/** The lines shown before « Et N autres éléments »: what a notification's expanded form holds. */
export const DIGEST_LINES = 6;

export const isDigestTime = (value: unknown): value is string => typeof value === 'string' && (DIGEST_TIMES as readonly string[]).includes(value);

/** One thing of the day, as the digest words it. */
export interface DigestEntry {
  readonly kind: 'event' | 'birthday' | 'reminder' | 'page';
  /** Its words: an event's title, « Anniversaire de Léa (30 ans) », a note's or a page's title. */
  readonly title: string;
  /** « 14:30 – 15:30 », « 09:00 », « Jusqu’à 10:00 »; '' for the whole day. */
  readonly time: string;
}

export interface Digest {
  readonly title: string;
  readonly body: string;
}

/** The moment a day's digest rings, at `at` on that day in `zone` ('' the device's). */
export function digestMoment(day: Day, at: string, zone = ''): number {
  return wallToInstant(`${day}T${at}`, zone);
}

/**
 * The digest wanted at `now`: today's while it is to come or still worth ringing late
 * (`DIGEST_LATE_MS`), else tomorrow's.
 */
export function nextDigest(now: number, at: string, zone = ''): { readonly day: Day; readonly at: number } {
  const day = instantToDay(now, zone);
  const moment = digestMoment(day, at, zone);
  if (now < moment + DIGEST_LATE_MS) return { day, at: moment };
  const next = addDays(day, 1);
  return { day: next, at: digestMoment(next, at, zone) };
}

/** Whether a digest whose moment is `at` still rings at `now`. */
export const digestWorthRinging = (at: number, now: number): boolean => now < at + DIGEST_LATE_MS;

function entryTitle(row: DayRow): string {
  const item = row.item;
  switch (item.kind) {
    case 'event':
      return item.occurrence.event.title.trim() || t('Untitled');
    case 'birthday':
      return birthdayTitle(item.birthday.name, item.birthday.age);
    case 'reminder':
      return item.reminder.title || t('Untitled');
    case 'page':
      return item.page.title || t('Untitled');
  }
}

/** The day of a plan (the phone's « Aujourd'hui »), whole days first, then by time. */
export function digestEntries(plan: TodayPlan, twelveHours = false): DigestEntry[] {
  return [...plan.allDay, ...plan.timed].map(row => ({ kind: row.item.kind, title: entryTitle(row), time: row.allDay ? '' : rowTimeWords(row, plan.day, twelveHours) }));
}

/** The digest's words; null for a day with nothing when it is not wanted then. */
export function writeDigest(entries: readonly DigestEntry[], overdue: number, { empty = false }: { readonly empty?: boolean } = {}): Digest | null {
  if (entries.length === 0 && overdue === 0) return empty ? { title: t('Nothing planned today'), body: t('The day is yours.') } : null;
  const count = (kind: DigestEntry['kind']): number => entries.filter(entry => entry.kind === kind).length;
  const parts: string[] = [];
  if (count('event') > 0) parts.push(plural(count('event'), 'event'));
  const birthdays = entries.filter(entry => entry.kind === 'birthday');
  if (birthdays.length === 1) parts.push(birthdays[0]!.title);
  else if (birthdays.length > 1) parts.push(plural(birthdays.length, 'birthday'));
  if (count('reminder') > 0) parts.push(plural(count('reminder'), 'reminder'));
  if (count('page') > 0) parts.push(plural(count('page'), 'page'));
  const late = overdue > 0 ? t('{reminders} overdue', { reminders: plural(overdue, 'reminder') }) : '';
  if (late) parts.push(late);
  const lines = entries.slice(0, DIGEST_LINES).map(entry => (entry.time ? `${entry.time} · ${entry.title}` : entry.title));
  const rest = entries.length - lines.length;
  if (rest > 0) lines.push(t('And {items}', { items: plural(rest, 'more item', 'more items') }));
  // The reminders missed close the body, after the day (the title counts them already when they are all there is).
  if (late && entries.length > 0) lines.push(late);
  return { title: t('Today: {summary}', { summary: parts.join(', ') }), body: lines.join('\n') };
}

/** What the server reads to gather a browser's day. */
export interface ZonedDayInput {
  readonly events: Iterable<CalendarEvent>;
  /** The calendars hidden, as the views leave them out. */
  readonly filter?: OccurrenceFilter;
  /** Contacts' people, for their birthdays; null with that layer off. */
  readonly contacts: Iterable<Contact> | null;
  /** Carnet's notes, for their reminders; null with that layer off. */
  readonly notes: Iterable<Note> | null;
  /** The pages naming the day (Pages' `pageDatesIn`, handed over: Agenda's package sits under Pages'); none with that layer off. */
  readonly pages: readonly DayPage[];
  readonly day: Day;
  /** The browser's zone ('' the server's). */
  readonly zone: string;
  readonly twelveHours: boolean;
}

/** A clock in `zone`, as the person reads it. */
const clockIn = (instant: number, zone: string, twelve: boolean): string => clockWords(zone ? instantToWall(instant, zone).slice(11, 16) : formatClock(instant), twelve);

/** Whole days: birthdays, then events, then pages. Timed things at one moment: events, then reminders, then pages. */
const RANK: Readonly<Record<DigestEntry['kind'], number>> = { birthday: 0, event: 1, reminder: 2, page: 3 };

/**
 * A day in a zone other than the device's, as the server gathers it for a browser: the same entries
 * as `digestEntries` of that browser's « Aujourd'hui » (its layers as it said), and the reminders
 * missed in the week before and still set.
 */
export function zonedDigest(input: ZonedDayInput): { readonly entries: DigestEntry[]; readonly overdue: number } {
  const { day, zone, twelveHours: twelve } = input;
  const start = dayToInstant(day, zone);
  const end = dayToInstant(addDays(day, 1), zone);
  type Row = DigestEntry & { readonly allDay: boolean; readonly at: number; readonly until: number };
  const rows: Row[] = [];
  // A day around this one on the server's clock: a timed event is kept by its instants in the browser's zone.
  for (const occurrence of occurrencesIn(input.events, addDays(day, -1), addDays(day, 2), input.filter)) {
    const title = occurrence.event.title.trim() || t('Untitled');
    if (occurrence.allDay) {
      if (occurrence.firstDay <= day && occurrence.lastDay >= day) rows.push({ kind: 'event', title, time: '', allDay: true, at: start, until: end });
      continue;
    }
    const touches = occurrence.endAt > occurrence.startAt ? occurrence.startAt < end && occurrence.endAt > start : occurrence.startAt >= start && occurrence.startAt < end;
    if (!touches) continue;
    // Over the whole day (begun before, going on after): a whole day, as « Aujourd'hui » shows it.
    if (occurrence.startAt < start && occurrence.endAt > end) {
      rows.push({ kind: 'event', title, time: '', allDay: true, at: start, until: end });
      continue;
    }
    const time =
      occurrence.startAt < start
        ? t('Until {clock}', { clock: clockIn(occurrence.endAt, zone, twelve) })
        : occurrence.endAt > end
          ? t('From {clock}', { clock: clockIn(occurrence.startAt, zone, twelve) })
          : occurrence.endAt > occurrence.startAt
            ? `${clockIn(occurrence.startAt, zone, twelve)} – ${clockIn(occurrence.endAt, zone, twelve)}`
            : clockIn(occurrence.startAt, zone, twelve);
    rows.push({ kind: 'event', title, time, allDay: false, at: occurrence.startAt, until: occurrence.endAt });
  }
  if (input.contacts) {
    for (const birthday of birthdaysIn(input.contacts, day, addDays(day, 1))) rows.push({ kind: 'birthday', title: birthdayTitle(birthday.name, birthday.age), time: '', allDay: true, at: start, until: end });
  }
  let overdue = 0;
  if (input.notes) {
    const notes = [...input.notes];
    for (const reminder of remindersIn(notes, start, end)) rows.push({ kind: 'reminder', title: reminder.title || t('Untitled'), time: clockIn(reminder.at, zone, twelve), allDay: false, at: reminder.at, until: reminder.at });
    overdue = remindersIn(
      notes.filter(note => !note.archived),
      dayToInstant(addDays(day, -OVERDUE_DAYS), zone),
      start,
    ).length;
  }
  for (const page of input.pages) {
    if (page.day !== day) continue;
    const title = page.title || t('Untitled');
    if (!page.time) rows.push({ kind: 'page', title, time: '', allDay: true, at: start, until: end });
    else {
      const at = wallToInstant(`${day}T${page.time}`, zone);
      rows.push({ kind: 'page', title, time: clockWords(page.time, twelve), allDay: false, at, until: at });
    }
  }
  const byTitle = (a: Row, b: Row): number => a.title.localeCompare(b.title);
  const whole = rows.filter(row => row.allDay).sort((a, b) => RANK[a.kind] - RANK[b.kind] || byTitle(a, b));
  const timed = rows.filter(row => !row.allDay).sort((a, b) => a.at - b.at || b.until - b.at - (a.until - a.at) || RANK[a.kind] - RANK[b.kind] || byTitle(a, b));
  return { entries: [...whole, ...timed].map(({ kind, title, time }) => ({ kind, title, time })), overdue };
}
