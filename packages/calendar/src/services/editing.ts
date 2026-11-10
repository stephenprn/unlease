/**
 * Every change to events, as the batch a client writes (`writeLocal`): one's own events only (a
 * subscription's are the server's). A repeating event is changed as Google does it, the person
 * choosing « Cet événement », « Cet événement et les suivants » or « Tous les événements »:
 *
 * - this one: an exception, a record of its own pointing at its series and the occurrence it
 *   replaces (`recurringId`, `originalStart`);
 * - this one and the following: the series stops the day before (its UNTIL), a new series starts
 *   with the change, and the exceptions and days taken out after it follow;
 * - all: the series itself; a change of hour moves the days taken out and the exceptions' places
 *   along, so they still replace the same occurrences, and what else changed (a title, a colour)
 *   reaches the exceptions that had not changed it on their own.
 *
 * Both clients call these, so both write the same records.
 */
import { createId, derivedId } from '@unlease/core/services/ids';
import { markupFromPlain } from '@unlease/core/services/richText';
import type { Fields } from '@unlease/core/sync/record';
import { EVENT_LIMITS, isOwn, type CalendarEvent, type EventFile } from '../models/events';
import { eventFields } from '../sync/entities';
import { feedUrl } from './feeds';
import { cleanEventUrl } from './links';
import { endFor, type Occurrence } from './occurrences';
import { expandRule, parseRule, ruleUntilBefore, serializeRule } from './recurrence';
import { addDays, addMinutes, civilMinutes, isDay } from './time';

export interface EventChange {
  readonly type: 'calendarEvent';
  readonly id: string;
  readonly patch: Fields;
}

export const EDIT_SCOPES = ['this', 'following', 'all'] as const;
export type EditScope = (typeof EDIT_SCOPES)[number];

/** What the form edits. */
export interface EventDraft {
  readonly title: string;
  readonly description: string;
  readonly place: string;
  readonly start: string;
  readonly end: string;
  readonly timeZone: string;
  readonly rrule: string;
  readonly reminders: readonly number[];
  readonly labelIds: readonly string[];
  readonly contactIds: readonly string[];
  readonly files: readonly EventFile[];
  readonly color: CalendarEvent['color'];
  readonly url: string;
}

const DRAFT_FIELDS = ['title', 'description', 'place', 'start', 'end', 'timeZone', 'rrule', 'reminders', 'labelIds', 'contactIds', 'files', 'color', 'url'] as const;

/** What « Tous les événements » carries to the exceptions; their times stay their own. */
const CARRIED: readonly (typeof DRAFT_FIELDS)[number][] = DRAFT_FIELDS.filter(field => field !== 'start' && field !== 'end' && field !== 'timeZone' && field !== 'rrule');

const change = (id: string, patch: Fields): EventChange => ({ type: 'calendarEvent', id, patch });

/**
 * The id of the exception that changes one occurrence of a series (« Cet événement »): derived from
 * the two, so two devices changing that occurrence at once write one record, whose fields merge,
 * rather than two exceptions shown side by side.
 */
export function exceptionId(seriesId: string, occurrence: string): string {
  return derivedId(`calendarEvent:${seriesId}:exception:${occurrence}`);
}

/** The id of the series a « Cet événement et les suivants » starts at an occurrence: two devices splitting there make one. */
export function followingId(seriesId: string, occurrence: string): string {
  return derivedId(`calendarEvent:${seriesId}:following:${occurrence}`);
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The draft an occurrence opens with: the event as it is, at this occurrence's times. */
export function draftOf(occurrence: Pick<Occurrence, 'event' | 'start' | 'end'>, series?: CalendarEvent): EventDraft {
  const event = occurrence.event;
  return {
    title: event.title,
    description: event.description,
    place: event.place,
    start: occurrence.start,
    end: occurrence.end,
    timeZone: event.timeZone,
    rrule: (series ?? event).rrule,
    reminders: event.reminders,
    labelIds: event.labelIds,
    contactIds: event.contactIds,
    files: event.files,
    color: event.color,
    url: event.url,
  };
}

/** A new event's draft: `start` a day (all day) or a time of day in `zone`. */
export function blankDraft(start: string, end: string, zone: string, reminders: readonly number[] = []): EventDraft {
  return { title: '', description: '', place: '', start, end, timeZone: isDay(start) ? '' : zone, rrule: '', reminders, labelIds: [], contactIds: [], files: [], color: null, url: '' };
}

/**
 * A new event's description from what its address hands the form (`/agenda/new?description=…&notes=…&link=…`,
 * the phone's `unlease-agenda://new?…`): Claude's words or a note's, read as plain words (any page
 * or app may open that address, so nothing in it becomes a link or a mention), then the saved link
 * it came from, mentioned.
 */
export function handedDescription(words: readonly (string | null | undefined)[], linkId: string | null | undefined): string {
  const text = words.map(part => part?.trim() ?? '').filter(Boolean).join('\n');
  const link = linkId && /^[A-Za-z0-9_-]{1,64}$/.test(linkId) ? `{@link=${linkId}}` : '';
  return [markupFromPlain(text, EVENT_LIMITS.description - link.length - 1), link].filter(Boolean).join('\n');
}

/** A new event's address from what its address hands the form: a web address, tidied as a typed one is; else none. */
export function handedUrl(value: string | null | undefined): string {
  return value ? feedUrl(cleanEventUrl(value).url) : '';
}

/** A new event from its draft, one batch. */
export function createEvent(draft: EventDraft, now: number, id: string = createId(now), extra: Partial<Pick<CalendarEvent, 'uid'>> = {}): EventChange {
  return change(
    id,
    eventFields({
      ...draft,
      timeZone: isDay(draft.start) ? '' : draft.timeZone,
      exdates: [],
      recurringId: null,
      originalStart: '',
      feedId: null,
      uid: extra.uid ?? '',
      trashedAt: null,
      createdAt: now,
      deletedAt: null,
    }),
  );
}

/** A copy of an event (« Dupliquer »): one's own from then on, even from a subscription. */
export function duplicateEvent(occurrence: Pick<Occurrence, 'event' | 'start' | 'end' | 'seriesId'>, events: Readonly<Record<string, CalendarEvent>>, now: number, id: string = createId(now)): EventChange {
  const series = events[occurrence.seriesId] ?? occurrence.event;
  const keepsSeries = occurrence.event.id === series.id && !!series.rrule;
  const draft = draftOf(keepsSeries ? { event: series, start: series.start, end: series.end } : occurrence, keepsSeries ? series : undefined);
  const copy = createEvent({ ...draft, rrule: keepsSeries ? series.rrule : '' }, now, id);
  return keepsSeries ? change(copy.id, { ...copy.patch, exdates: [...series.exdates] }) : copy;
}

/** The draft's fields that differ from the event's. */
function differences(event: CalendarEvent, draft: EventDraft, except: readonly string[] = []): Fields {
  const patch: Fields = {};
  for (const field of DRAFT_FIELDS) {
    if (except.includes(field)) continue;
    const value = field === 'timeZone' && isDay(draft.start) ? '' : draft[field];
    if (!same(event[field], value)) patch[field] = Array.isArray(value) ? [...(value as readonly unknown[])] : value;
  }
  return patch;
}

/** Moves a stored start (a day taken out, an exception's place) by the series' shift. */
function shifted(value: string, minutes: number, days: number): string {
  return isDay(value) ? addDays(value, days) : addMinutes(value, minutes);
}

/** All the series: its fields, and its exceptions' places moved along when its start moved. */
function saveAll(series: CalendarEvent, occurrenceStart: string, draft: EventDraft, events: readonly CalendarEvent[], now: number): EventChange[] {
  const out: EventChange[] = [];
  const sameForm = isDay(series.start) === isDay(draft.start);
  // The series moves by as much as this occurrence did.
  const minutes = sameForm ? civilMinutes(draft.start) - civilMinutes(occurrenceStart) : 0;
  const days = Math.round(minutes / 1440);
  const start = sameForm ? shifted(series.start, minutes, days) : draft.start;
  const length = civilMinutes(draft.end) - civilMinutes(draft.start);
  const end = isDay(start) ? addDays(start, Math.max(1, Math.round(length / 1440))) : addMinutes(start, length);
  const patch = differences(series, { ...draft, start, end });
  const exceptions = events.filter(event => event.recurringId === series.id && event.deletedAt === null);
  if (!sameForm) {
    patch.exdates = [];
    for (const exception of exceptions) out.push(change(exception.id, { trashedAt: now }));
  } else {
    if (minutes !== 0 && series.exdates.length > 0) patch.exdates = series.exdates.map(value => shifted(value, minutes, days));
    for (const exception of exceptions) {
      const own: Fields = {};
      if (minutes !== 0 && exception.originalStart) own.originalStart = shifted(exception.originalStart, minutes, days);
      // A field the exception still holds as the series had it takes the series' new value.
      for (const field of CARRIED) if (field in patch && same(exception[field], series[field])) own[field] = patch[field];
      if (Object.keys(own).length > 0) out.push(change(exception.id, own));
    }
  }
  if (Object.keys(patch).length > 0) out.unshift(change(series.id, patch));
  return out;
}

/** How many occurrences a series has before one (its COUNT carried over to the new series). */
function countBefore(series: CalendarEvent, occurrence: string): number {
  const rule = parseRule(series.rrule);
  if (!rule) return 0;
  return expandRule(rule, series.start, series.timeZone, isDay(series.start) ? '0001-01-01' : '0001-01-01T00:00', occurrence, 100_000).starts.length;
}

/** The series cut before an occurrence, and a new one from it with the change. */
function saveFollowing(series: CalendarEvent, occurrenceStart: string, draft: EventDraft, events: readonly CalendarEvent[], now: number): EventChange[] {
  const rule = parseRule(series.rrule);
  if (!rule) return saveAll(series, occurrenceStart, draft, events, now);
  const out: EventChange[] = [];
  const before = countBefore(series, occurrenceStart);
  const cut = ruleUntilBefore(rule, occurrenceStart, series.timeZone);
  const sameForm = isDay(series.start) === isDay(draft.start);
  const minutes = sameForm ? civilMinutes(draft.start) - civilMinutes(occurrenceStart) : 0;
  const days = Math.round(minutes / 1440);
  const isLater = (value: string): boolean => civilMinutes(value) >= civilMinutes(occurrenceStart);
  out.push(change(series.id, { rrule: serializeRule(cut), exdates: series.exdates.filter(value => !isLater(value)) }));
  // The new series: what was asked, its count what was left.
  let rrule = draft.rrule;
  if (same(draft.rrule, series.rrule) && rule.count !== null) rrule = serializeRule({ ...rule, count: Math.max(1, rule.count - before), until: null });
  const id = followingId(series.id, occurrenceStart);
  const created = createEvent({ ...draft, rrule }, now, id);
  out.push(change(id, { ...created.patch, exdates: sameForm ? series.exdates.filter(isLater).map(value => shifted(value, minutes, days)) : [] }));
  for (const exception of events) {
    if (exception.recurringId !== series.id || exception.deletedAt !== null || !exception.originalStart || !isLater(exception.originalStart)) continue;
    out.push(sameForm ? change(exception.id, { recurringId: id, originalStart: shifted(exception.originalStart, minutes, days) }) : change(exception.id, { trashedAt: now }));
  }
  return out;
}

/**
 * The batch saving a draft over an occurrence. A single event is changed in place; one of a series
 * as `scope` says.
 */
export function saveOccurrence(occurrence: Occurrence, draft: EventDraft, scope: EditScope, events: Readonly<Record<string, CalendarEvent>>, now: number): EventChange[] {
  const series = events[occurrence.seriesId];
  if (!series || !isOwn(series)) return [];
  const all = Object.values(events);
  if (!occurrence.repeats || !series.rrule) {
    const patch = differences(occurrence.event, draft);
    return Object.keys(patch).length > 0 ? [change(occurrence.event.id, patch)] : [];
  }
  const isException = occurrence.event.id !== series.id;
  if (scope === 'this') {
    if (isException) {
      const patch = differences(occurrence.event, draft, ['rrule']);
      return Object.keys(patch).length > 0 ? [change(occurrence.event.id, patch)] : [];
    }
    const id = exceptionId(series.id, occurrence.occurrence);
    const created = createEvent({ ...draft, rrule: '' }, now, id);
    return [change(id, { ...created.patch, recurringId: series.id, originalStart: occurrence.occurrence, uid: series.uid })];
  }
  const first = occurrence.occurrence === series.start;
  if (scope === 'all' || first) {
    const out = saveAll(series, occurrence.occurrence, draft, all, now);
    // The exception edited is the series' from now on: it goes.
    if (isException) out.push(change(occurrence.event.id, { trashedAt: now }));
    return out;
  }
  const out = saveFollowing(series, occurrence.occurrence, draft, all, now);
  if (isException) out.push(change(occurrence.event.id, { trashedAt: now }));
  return out;
}

/** The occurrence moved to start at `start` (dragged in a view), its length kept, or resized to end at `end`. */
export function moveOccurrence(occurrence: Occurrence, times: { readonly start: string; readonly end?: string }, scope: EditScope, events: Readonly<Record<string, CalendarEvent>>, now: number): EventChange[] {
  const series = events[occurrence.seriesId] ?? occurrence.event;
  const draft = draftOf(occurrence, series);
  const end = times.end ?? endFor({ start: occurrence.start, end: occurrence.end }, times.start);
  const sameForm = isDay(times.start) === isDay(occurrence.start);
  const finalEnd = sameForm ? end : isDay(times.start) ? addDays(times.start, 1) : addMinutes(times.start, 60);
  return saveOccurrence(occurrence, { ...draft, start: times.start, end: finalEnd, timeZone: isDay(times.start) ? '' : draft.timeZone || occurrence.event.timeZone }, scope, events, now);
}

/** The batch deleting an occurrence: to the bin for a single event or a whole series, out of its series for one of them. */
export function deleteOccurrence(occurrence: Occurrence, scope: EditScope, events: Readonly<Record<string, CalendarEvent>>, now: number): EventChange[] {
  const series = events[occurrence.seriesId];
  if (!series || !isOwn(series)) return [];
  const exceptions = Object.values(events).filter(event => event.recurringId === series.id && event.deletedAt === null && event.trashedAt === null);
  if (!occurrence.repeats || !series.rrule || scope === 'all' || (scope === 'following' && occurrence.occurrence === series.start)) {
    return [change(series.id, { trashedAt: now }), ...exceptions.map(exception => change(exception.id, { trashedAt: now }))];
  }
  if (scope === 'this') {
    const out = [change(series.id, { exdates: [...new Set([...series.exdates, occurrence.occurrence])] })];
    // Every exception of that occurrence goes (two devices may have made one each), or the other would show.
    for (const exception of exceptions) if (exception.originalStart === occurrence.occurrence && exception.id !== occurrence.event.id) out.push(change(exception.id, { trashedAt: now }));
    if (occurrence.event.id !== series.id) out.push(change(occurrence.event.id, { trashedAt: now }));
    return out;
  }
  const rule = parseRule(series.rrule);
  if (!rule) return [change(series.id, { trashedAt: now })];
  const later = (value: string): boolean => civilMinutes(value) >= civilMinutes(occurrence.occurrence);
  return [
    change(series.id, { rrule: serializeRule(ruleUntilBefore(rule, occurrence.occurrence, series.timeZone)), exdates: series.exdates.filter(value => !later(value)) }),
    ...exceptions.filter(exception => exception.originalStart && later(exception.originalStart)).map(exception => change(exception.id, { trashedAt: now })),
  ];
}

/** Back from the bin: the series, and its exceptions binned with it. */
export function restoreEvent(event: CalendarEvent, events: Readonly<Record<string, CalendarEvent>>): EventChange[] {
  const out = [change(event.id, { trashedAt: null })];
  for (const exception of Object.values(events)) {
    if (exception.recurringId === event.id && exception.trashedAt !== null && exception.trashedAt === event.trashedAt) out.push(change(exception.id, { trashedAt: null }));
  }
  return out;
}

/** Gone for good from the bin (its tombstone), its exceptions too. */
export function deleteForGood(event: CalendarEvent, events: Readonly<Record<string, CalendarEvent>>, now: number): EventChange[] {
  const out = [change(event.id, { deletedAt: now })];
  for (const exception of Object.values(events)) if (exception.recurringId === event.id && exception.deletedAt === null) out.push(change(exception.id, { deletedAt: now }));
  return out;
}

/** Whether saving needs the person to choose a scope: an occurrence of a series of one's own, changed. */
export const asksScope = (occurrence: Pick<Occurrence, 'repeats' | 'event'>): boolean => occurrence.repeats && isOwn(occurrence.event);

/** The end that keeps an event's length when its start moves (the form's start field). */
export function keepLength(draft: Pick<EventDraft, 'start' | 'end'>, start: string): string {
  if (isDay(start) !== isDay(draft.start)) return isDay(start) ? addDays(start, 1) : addMinutes(start, 60);
  return endFor(draft, start);
}
