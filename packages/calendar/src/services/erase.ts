/**
 * « Effacer des données » for Agenda (`core/services/erase`): four parts, apart from one another, so
 * each can be kept:
 *
 * - `events`: the events made here (in Agenda, from Carnet, a quick add, a copy of a subscription's),
 *   in the bin too, each series with its exceptions;
 * - `imported`: those a file or an invitation brought (they keep its UID), the same way;
 * - `subscriptions`: the calendars subscribed to by their address; erasing one is unsubscribing, and
 *   the server then lets its events go (the apps never write a subscription's events). The public
 *   holidays are the Administration's, not a part;
 * - `labels`: the labels, gone as « Supprimer le libellé » does it: the events that wear one and stay
 *   lose it in the same batch.
 *
 * Every record of a part chosen gets its tombstone at one moment (`deletedAt`), what is in the bin too;
 * a record tombstoned already is left as it is.
 */
import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import type { ErasePart } from '@unlease/core/services/erase';
import type { Fields } from '@unlease/core/sync/record';
import { HOLIDAYS_FEED_ID, type CalendarEvent, type CalendarFeed, type CalendarLabel } from '../models/events';

export const CALENDAR_ERASE_PARTS = ['events', 'imported', 'subscriptions', 'labels'] as const;
export type CalendarErasePart = (typeof CALENDAR_ERASE_PARTS)[number];

/** What both clients' stores hold of Agenda, every record (the bin's and the tombstoned too). */
export interface CalendarEraseLibrary {
  readonly events: Readonly<Record<string, CalendarEvent>>;
  readonly labels: Readonly<Record<string, CalendarLabel>>;
  readonly feeds: Readonly<Record<string, CalendarFeed>>;
}

/** A change erasing writes (`core/services/erase`'s `EraseChange`): a tombstone, or an event losing a label erased. */
export interface CalendarEraseChange {
  readonly type: 'calendarEvent' | 'calendarLabel' | 'calendarFeed';
  readonly id: string;
  readonly patch: Fields;
}

/** Which part an event belongs to (an exception follows its series); null for a subscription's or the holidays'. */
function partOf(event: CalendarEvent, events: Readonly<Record<string, CalendarEvent>>): 'events' | 'imported' | null {
  const series = event.recurringId ? events[event.recurringId] : undefined;
  const owner = series ?? event;
  if (owner.feedId !== null || event.feedId !== null) return null;
  return owner.uid ? 'imported' : 'events';
}

const alive = (record: { readonly deletedAt: number | null }): boolean => record.deletedAt === null;

/** The subscriptions erasing can take: the calendars subscribed to by their address, not the holidays. */
const subscriptions = (library: CalendarEraseLibrary): CalendarFeed[] => Object.values(library.feeds).filter(feed => alive(feed) && feed.kind === 'ics' && feed.id !== HOLIDAYS_FEED_ID);

/**
 * The parts as the form shows them, from the records as they are now: each counts the records a tick
 * erases (a series' exceptions too, as `erasedCount` counts the batch), its line the events as a
 * person sees them (a series once).
 */
export function calendarEraseParts(library: CalendarEraseLibrary): ErasePart[] {
  const own = { events: [] as CalendarEvent[], imported: [] as CalendarEvent[] };
  const records = { events: 0, imported: 0 };
  for (const event of Object.values(library.events)) {
    if (!alive(event)) continue;
    const part = partOf(event, library.events);
    if (!part) continue;
    records[part] += 1;
    if (event.recurringId === null) own[part].push(event);
  }
  const eventsDetail = (events: readonly CalendarEvent[], lead: string): string => {
    const series = events.filter(event => event.rrule).length;
    const binned = events.filter(event => event.trashedAt !== null).length;
    const parts = [series > 0 ? plural(series, 'qui se répète', 'qui se répètent') : '', binned > 0 ? plural(binned, 'dans la corbeille', 'dans la corbeille') : ''].filter(Boolean);
    if (parts.length === 0) return lead;
    return t('{events}, dont {list}', { events: lead, list: parts.length === 2 ? t('{list} et {last}', { list: parts[0]!, last: parts[1]! }) : parts[0]! });
  };
  const feeds = subscriptions(library);
  const served = Object.values(library.events).filter(event => alive(event) && event.recurringId === null && feeds.some(feed => feed.id === event.feedId)).length;
  const labels = Object.values(library.labels).filter(alive);
  const worn = Object.values(library.events).filter(event => alive(event) && event.recurringId === null && event.labelIds.some(id => labels.some(label => label.id === id))).length;
  const holidays = library.feeds[HOLIDAYS_FEED_ID];
  const names = feeds.slice(0, 3).map(feed => feed.name.trim() || t('Sans nom')).join(', ') + (feeds.length > 3 ? '…' : '');
  const followed = { calendars: plural(feeds.length, 'agenda'), names, events: plural(served, 'événement') };
  return [
    { id: 'events', title: t('Vos événements'), detail: eventsDetail(own.events, plural(own.events.length, 'événement')), count: records.events, glyph: 'calendar' },
    { id: 'imported', title: t('Événements importés'), detail: eventsDetail(own.imported, plural(own.imported.length, 'événement venu d’un fichier ou d’une invitation', 'événements venus d’un fichier ou d’une invitation')), count: records.imported, glyph: 'download' },
    {
      id: 'subscriptions',
      title: t('Vos abonnements'),
      // The holidays are no part: they are set in the Administration.
      detail: holidays && alive(holidays) ? t('{calendars} ({names}), {events} en tout. Les jours fériés restent : ils se règlent dans l’Administration.', followed) : t('{calendars} ({names}), {events} en tout', followed),
      count: feeds.length,
      glyph: 'globe',
    },
    { id: 'labels', title: t('Libellés'), detail: worn > 0 ? t('{labels} · les événements qui les portent restent, sans eux', { labels: plural(labels.length, 'libellé') }) : plural(labels.length, 'libellé'), count: labels.length, glyph: 'tag' },
  ];
}

/** The batch erasing the parts chosen: tombstones, and the labels erased taken off the events that stay. */
export function calendarEraseChanges(library: CalendarEraseLibrary, chosen: ReadonlySet<string>, now: number): CalendarEraseChange[] {
  const out: CalendarEraseChange[] = [];
  const erased = new Set<string>();
  for (const event of Object.values(library.events)) {
    if (!alive(event)) continue;
    const part = partOf(event, library.events);
    if (part && chosen.has(part)) {
      erased.add(event.id);
      out.push({ type: 'calendarEvent', id: event.id, patch: { deletedAt: now } });
    }
  }
  if (chosen.has('subscriptions')) for (const feed of subscriptions(library)) out.push({ type: 'calendarFeed', id: feed.id, patch: { deletedAt: now } });
  if (chosen.has('labels')) {
    const labels = new Set(Object.values(library.labels).filter(alive).map(label => label.id));
    for (const id of labels) out.push({ type: 'calendarLabel', id, patch: { deletedAt: now } });
    // As « Supprimer le libellé »: an event of one's own that stays loses it (a subscription's has none of its own).
    for (const event of Object.values(library.events)) {
      if (!alive(event) || erased.has(event.id) || event.feedId !== null || !event.labelIds.some(id => labels.has(id))) continue;
      out.push({ type: 'calendarEvent', id: event.id, patch: { labelIds: event.labelIds.filter(id => !labels.has(id)) } });
    }
  }
  return out;
}
