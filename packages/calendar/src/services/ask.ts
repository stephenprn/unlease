/**
 * What a question about the calendar reads (`POST /api/calendar/ask`), built on the device: the
 * occurrences from three months back to a year ahead, one line each in fixed English labels around
 * the person's own words (« 2026-11-02 14:30–15:30 Europe/Paris | Dîner chez Paul | place: … »),
 * the nearest first until the reach is spent; birthdays and holidays as such. Nothing in the bin.
 */
import { tx } from '@unlease/core/i18n';
import type { Ref } from '@unlease/core/refs';
import { markupToPlain } from '@unlease/core/services/richText';
import { MENTION_PLACES_MAX, mentionMarkups, type MentionPlace } from '@unlease/core/sync/mentions';
import { isLive, type CalendarEvent, type CalendarFeed, type CalendarLabel } from '../models/events';
import { ASK_CONTEXT_MAX } from '../sync/routes';
import type { BirthdayItem } from './layers';
import type { Occurrence } from './occurrences';
import { clockPart, instantToWall, isDay } from './time';

/** What one may ask first, while the conversation is empty: tapped, each is asked (both clients; `t()` where shown). */
export const ASK_STARTERS = [tx('What do I have this week?'), tx('When am I free on Thursday evening?'), tx('Which birthdays are coming up?'), tx('When did I last see Paul?')] as const;

export interface AskSources {
  readonly occurrences: readonly Occurrence[];
  readonly birthdays: readonly BirthdayItem[];
  readonly labels: Readonly<Record<string, CalendarLabel>>;
  readonly feeds: Readonly<Record<string, CalendarFeed>>;
  /** A mention's or a guest's name. */
  readonly name: (target: Ref) => string;
  readonly now: number;
}

function line(item: Occurrence, sources: AskSources): string {
  const event = item.event;
  const when = item.allDay
    ? item.firstDay === item.lastDay
      ? `${item.firstDay} all day`
      : `${item.firstDay} to ${item.lastDay} all day`
    : `${instantToWall(item.startAt, '').replace('T', ' ')}–${clockPart(instantToWall(item.endAt, ''))}`;
  const parts = [when, event.title.trim() || '(untitled)'];
  if (event.place.trim()) parts.push(`place: ${event.place.trim()}`);
  const labels = event.labelIds.map(id => sources.labels[id]?.name).filter(Boolean);
  if (labels.length > 0) parts.push(`labels: ${labels.join(', ')}`);
  const people = event.contactIds.map(id => sources.name({ type: 'contact', id }));
  if (people.length > 0) parts.push(`with: ${people.join(', ')}`);
  const feed = event.feedId ? sources.feeds[event.feedId] : undefined;
  if (feed) parts.push(`calendar: ${feed.kind === 'holidays' ? 'public holidays' : feed.name}`);
  if (item.repeats) parts.push('repeats');
  const description = markupToPlain(event.description, sources.name).replace(/\s+/g, ' ').trim();
  if (description) parts.push(`notes: ${description.slice(0, 400)}`);
  return parts.join(' | ');
}

/** The calendar as Claude reads it, within `limit` characters, nearest to now first, then in time order. */
export function askContext(sources: AskSources, limit = ASK_CONTEXT_MAX): string {
  const lines: { at: number; text: string }[] = [
    ...sources.occurrences.map(item => ({ at: item.startAt, text: line(item, sources) })),
    ...sources.birthdays.map(item => ({ at: Date.parse(`${item.day}T12:00:00`), text: `${item.day} all day | birthday of ${item.name}${item.age !== null ? ` (turns ${item.age})` : ''}` })),
  ];
  const kept: { at: number; text: string }[] = [];
  let size = 0;
  for (const entry of [...lines].sort((a, b) => Math.abs(a.at - sources.now) - Math.abs(b.at - sources.now))) {
    if (size + entry.text.length + 1 > limit) break;
    kept.push(entry);
    size += entry.text.length + 1;
  }
  return kept
    .sort((a, b) => a.at - b.at)
    .map(entry => entry.text)
    .join('\n');
}

/**
 * The events that mention something (`GET /api/calendar/mentions`, `core/sync/mentions`): their
 * description's mention of it, or, for a contact, the person among its guests. Series and single
 * events once each, the most recently changed first; nothing in the bin.
 */
export function eventsMentioning(events: Iterable<CalendarEvent>, type: string, ids: readonly string[]): MentionPlace[] {
  const markups = mentionMarkups(type, ids);
  const wanted = new Set(ids);
  const out = new Map<string, MentionPlace>();
  const all = [...events];
  const byId = new Map(all.map(event => [event.id, event]));
  for (const event of all) {
    if (!isLive(event)) continue;
    const mentions = markups.some(markup => event.description.includes(markup)) || (type === 'contact' && event.contactIds.some(id => wanted.has(id)));
    if (!mentions) continue;
    const series = event.recurringId ? byId.get(event.recurringId) : event;
    if (!series || !isLive(series)) continue;
    const previous = out.get(series.id);
    const editedAt = Math.max(previous?.editedAt ?? 0, event.editedAt);
    out.set(series.id, { app: 'calendar', type: 'event', id: series.id, title: series.title.trim(), within: '', icon: null, editedAt, when: isDay(series.start) ? series.start : series.start });
  }
  return [...out.values()].sort((a, b) => b.editedAt - a.editedAt).slice(0, MENTION_PLACES_MAX);
}
