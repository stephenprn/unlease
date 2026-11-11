/**
 * Another app's « Ajouter à l'agenda » (a ticket, a booking, a mail's date: Android's INSERT with
 * `CalendarContract`'s extras): what it hands, as the new event form's params (`Edit`), which the
 * person saves or leaves (nothing is kept before).
 *
 * - Its instants are wall times in the zone it names (`eventTimezone`, when the platform knows it),
 *   else in the device's; a missing end is left to the form (its usual length).
 * - All day, its days are Android's (midnight UTC, the end the day after the last), or the zone's own
 *   days when another app wrote its local midnights instead; the end is exclusive, as Agenda keeps it.
 * - A repeat Agenda reads is kept (`handedRule`); one it does not is left out.
 * - Its guests (`android.intent.extra.EMAIL`) are the contacts with that address; the others are
 *   written on the description's last line, so nobody is lost.
 * - `availability` and `accessLevel` have no place in an event here: ignored.
 */
import { EVENT_LIMITS } from '@unlease/calendar/models/events';
import { handedRule } from '@unlease/calendar/services/editing';
import { addDays, instantToDay, instantToWall, isKnownZone } from '@unlease/calendar/services/time';
import type { Contact } from '@unlease/contacts/models/contacts';
import { resolveContact } from '@unlease/contacts/services/duplicates';

/** The new event form's params (`Edit`), as another app hands them. */
export interface HandedEvent {
  readonly title?: string;
  readonly description?: string;
  readonly place?: string;
  /** A wall time (`2026-11-02T14:30`) in `tz`, or a day (all day). */
  readonly start?: string;
  readonly end?: string;
  readonly tz?: string;
  readonly rrule?: string;
  /** The guests found among the contacts: their ids, comma-separated (`handedGuests`). */
  readonly guests?: string;
}

type Person = Pick<Contact, 'id' | 'emails' | 'mergedInto' | 'deletedAt' | 'trashedAt'>;
type People = Readonly<Record<string, Person>>;

const DAY = 86_400_000;

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** An instant in epoch ms, as a number or its digits; null for anything else. */
function instantOf(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d{1,16}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  return Number.isSafeInteger(number) ? number : null;
}

const yes = (value: unknown): boolean => value === true || value === 1 || value === 'true' || value === '1';

/** The addresses another app names (one text, comma-separated as CalendarContract says, or a list; « Léa <lea@…> » as written in a mail). */
function addressesOf(value: unknown): string[] {
  const parts = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : typeof value === 'string' ? [value] : [];
  const found = parts
    .flatMap(part => part.split(/[,;]/))
    .map(part => (/<([^<>]+)>/.exec(part)?.[1] ?? part).trim().replace(/^mailto:/i, ''))
    .filter(address => /^[^\s@]+@[^\s@]+$/.test(address));
  const kept = new Map<string, string>();
  for (const address of found) if (!kept.has(address.toLowerCase())) kept.set(address.toLowerCase(), address);
  return [...kept.values()].slice(0, EVENT_LIMITS.contacts);
}

const live = (person: Person): boolean => person.deletedAt === null && person.trashedAt === null && !person.mergedInto;

/** The contact an address belongs to, the first one kept when two share it; null for none. */
function personOf(people: People, address: string): Person | null {
  const wanted = address.toLowerCase();
  return Object.values(people).find(person => live(person) && person.emails.some(email => email.address.trim().toLowerCase() === wanted)) ?? null;
}

/** What the other app handed (IntakeModule's JSON of the intent's extras), as the form's params; `zone` is the device's. */
export function handedEvent(extras: unknown, { zone: device, people }: { readonly zone: string; readonly people: People }): HandedEvent {
  const given: Readonly<Record<string, unknown>> = typeof extras === 'object' && extras !== null && !Array.isArray(extras) ? (extras as Record<string, unknown>) : {};
  const named = text(given.eventTimezone, EVENT_LIMITS.timeZone);
  const zone = isKnownZone(named) ? named : device;
  const begin = instantOf(given.beginTime);
  const handedEnd = instantOf(given.endTime);
  // An end at or before the start is none: the form gives its own.
  const finish = begin !== null && handedEnd !== null && handedEnd > begin ? handedEnd : null;

  let when: Pick<HandedEvent, 'start' | 'end' | 'tz'> = {};
  if (begin !== null && yes(given.allDay)) {
    // Android's own all-day times are midnight UTC; another app's local midnight is its zone's day.
    const dayOf = (at: number): string => (at % DAY === 0 ? instantToDay(at, 'UTC') : instantToDay(at, zone));
    const start = dayOf(begin);
    // The end is the day after the last: a midnight is that day already, a time within a day the next one.
    const endOf = (at: number): string => (at % DAY === 0 || instantToWall(at, zone).endsWith('T00:00') ? dayOf(at) : addDays(instantToDay(at, zone), 1));
    const end = finish !== null ? endOf(finish) : '';
    when = { start, end: end > start ? end : addDays(start, 1) };
  } else if (begin !== null) {
    when = { start: instantToWall(begin, zone), ...(finish !== null ? { end: instantToWall(finish, zone) } : {}), tz: zone };
  }

  const guests: string[] = [];
  const strangers: string[] = [];
  for (const address of addressesOf(given['android.intent.extra.EMAIL'])) {
    const person = personOf(people, address);
    if (person) {
      if (!guests.includes(person.id)) guests.push(person.id);
    } else strangers.push(address);
  }
  const description = [text(given.description, EVENT_LIMITS.description), strangers.join(', ')].filter(Boolean).join('\n\n');
  const rrule = handedRule(text(given.rrule, EVENT_LIMITS.rrule * 2));

  return {
    ...(text(given.title, EVENT_LIMITS.title) ? { title: text(given.title, EVENT_LIMITS.title) } : {}),
    ...(description ? { description } : {}),
    ...(text(given.eventLocation, EVENT_LIMITS.place) ? { place: text(given.eventLocation, EVENT_LIMITS.place) } : {}),
    ...when,
    ...(rrule ? { rrule } : {}),
    ...(guests.length > 0 ? { guests: guests.join(',') } : {}),
  };
}

/** The guests a link hands the form (contact ids, comma-separated): each one still in the address book, a merged one as the contact it went into. */
export function handedGuests(value: string | null | undefined, people: Readonly<Record<string, Pick<Contact, 'id' | 'mergedInto' | 'deletedAt' | 'trashedAt'>>>): string[] {
  const ids: string[] = [];
  for (const id of (value ?? '').split(',').map(part => part.trim())) {
    const person = id ? resolveContact(people, id) : null;
    if (person && person.trashedAt === null && !ids.includes(person.id) && ids.length < EVENT_LIMITS.contacts) ids.push(person.id);
  }
  return ids;
}
