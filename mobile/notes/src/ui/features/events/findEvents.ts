/**
 * Events found by their words, for « @ » in a note or a page (Pages borrows this file): Agenda's own
 * and those of the calendars shown, the coming ones first when nothing is typed; each with its when
 * line. A leaf: the packages only. The web's `web/notes/src/app/events/find.ts`.
 */
import type { Ref } from '@unlease/core/refs';
import { isLive, type CalendarEvent, type CalendarFeed } from '@unlease/calendar/models/events';
import { whenLine } from '@unlease/calendar/services/eventText';
import { findOccurrence, upcoming } from '@unlease/calendar/services/occurrences';
import { searchEvents, soonestFirst } from '@unlease/calendar/services/search';
import { instantToDay } from '@unlease/calendar/services/time';

export interface EventHit {
  readonly id: string;
  readonly title: string;
  /** « lun. 2 nov. · 14:30 – 15:30 »: its next occurrence, or its first. */
  readonly when: string;
}

/** An event's line under its title: its next occurrence from now on, else when it was. */
export function eventWhen(events: Readonly<Record<string, CalendarEvent>>, id: string, now: number = Date.now()): string {
  const event = events[id];
  if (!event) return '';
  const next = event.rrule ? upcoming([event, ...Object.values(events).filter(other => other.recurringId === id)], now, 400, 1)[0] : undefined;
  const shown = next ?? findOccurrence(events, id, null);
  return shown ? whenLine(shown, now) : '';
}

export function findEvents(events: Readonly<Record<string, CalendarEvent>>, feeds: Readonly<Record<string, CalendarFeed>>, query: string, name: (target: Ref) => string, max = 6, now: number = Date.now()): EventHit[] {
  const today = instantToDay(now);
  const list = query.trim()
    ? searchEvents(Object.values(events), feeds, query, name, today)
    : Object.values(events)
        .filter(event => isLive(event) && !event.recurringId && !event.feedId)
        .sort(soonestFirst(today));
  return list.slice(0, max).map(event => ({ id: event.id, title: event.title.trim(), when: eventWhen(events, event.id, now) }));
}
