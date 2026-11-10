/**
 * Finding events: the spotlight's documents (`searchIndex`, the web's ⌘K) and the simpler search of
 * the phone and the web's search box (`core/services/search`). A series is one result, opened at
 * its next occurrence; an exception is its series'.
 */
import { foldText, scoreTerms, queryTerms } from '@unlease/core/services/search';
import { markupToPlain } from '@unlease/core/services/richText';
import type { Ref } from '@unlease/core/refs';
import { spotKey, type SpotMeta } from '@unlease/core/services/spotlight';
import type { SearchDoc, SearchPart } from '@unlease/core/services/searchIndex';
import { isLive, type CalendarEvent, type CalendarFeed, type CalendarLabel } from '../models/events';

export const CALENDAR_SPOT_TYPES = ['event'] as const;
export type CalendarSpotType = (typeof CALENDAR_SPOT_TYPES)[number];

/** Live events of one's own and of the calendars shown, exceptions apart. */
function searchable(events: Iterable<CalendarEvent>, feeds: Readonly<Record<string, CalendarFeed>>): CalendarEvent[] {
  return [...events].filter(event => isLive(event) && !event.recurringId && (!event.feedId || (feeds[event.feedId] && !feeds[event.feedId]!.hidden && feeds[event.feedId]!.deletedAt === null)));
}

export function calendarSpotlightDocs(
  events: Iterable<CalendarEvent>,
  labels: Readonly<Record<string, CalendarLabel>>,
  feeds: Readonly<Record<string, CalendarFeed>>,
  name: (target: Ref) => string,
): SearchDoc<SpotMeta>[] {
  return searchable(events, feeds).map(event => {
    const parts: SearchPart[] = [];
    if (event.place.trim()) parts.push({ text: event.place, role: 'heading' });
    const description = markupToPlain(event.description, name).trim();
    if (description) parts.push({ text: description, role: 'body' });
    const labelNames = event.labelIds.map(id => labels[id]).filter(label => label && label.deletedAt === null).map(label => label!.name);
    if (labelNames.length > 0) parts.push({ text: labelNames.join(' '), role: 'meta' });
    parts.push({ text: event.start.slice(0, 10), role: 'meta' });
    const feed = event.feedId ? feeds[event.feedId] : undefined;
    return {
      key: spotKey('event', event.id),
      title: event.title,
      parts,
      editedAt: event.editedAt,
      meta: { type: 'event', id: event.id, labelIds: event.labelIds, archived: false, within: feed?.name ?? null },
    };
  });
}

/** The events whose words hold every term of the query, the best first (the phone's search, the box). */
export function searchEvents(
  events: Iterable<CalendarEvent>,
  feeds: Readonly<Record<string, CalendarFeed>>,
  query: string,
  name: (target: Ref) => string,
  /** A day (`2026-11-03`): among equal matches, the coming events first, nearest first, then the past ones (a mention picks this year's « Noël », not 2028's). Else the latest first. */
  soonestFrom?: string,
): CalendarEvent[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const scored: { event: CalendarEvent; score: number }[] = [];
  for (const event of searchable(events, feeds)) {
    // Both folded, as the terms are (`queryTerms`).
    const rest = foldText(`${event.place} ${markupToPlain(event.description, name)}`);
    const score = scoreTerms(foldText(event.title), rest, terms);
    if (score !== null) scored.push({ event, score });
  }
  const latestFirst = (a: CalendarEvent, b: CalendarEvent): number => (a.start < b.start ? 1 : -1);
  const tie = soonestFrom === undefined ? latestFirst : soonestFirst(soonestFrom);
  return scored.sort((a, b) => b.score - a.score || tie(a.event, b.event)).map(entry => entry.event);
}

/** The events from `day` on, nearest first, then those before it, latest first. */
export function soonestFirst(day: string): (a: CalendarEvent, b: CalendarEvent) => number {
  return (a, b) => {
    const aNext = a.end.slice(0, 10) >= day;
    const bNext = b.end.slice(0, 10) >= day;
    if (aNext !== bNext) return aNext ? -1 : 1;
    return aNext ? (a.start < b.start ? -1 : 1) : a.start < b.start ? 1 : -1;
  };
}
