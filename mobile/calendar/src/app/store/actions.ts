/**
 * What a person does in Agenda. Each gesture is one `writeLocal` batch (one clock, synced), built by
 * the package's editing (`@unlease/calendar/services/editing`, the web's too); those that can be
 * taken back hand back their undo, which writes the old values with a newer clock. An event's title
 * and description are typed text: the form saves them through `saveTypedField`, merged with an edit
 * that landed meanwhile.
 */
import { createId } from '@unlease/core/services/ids';
import { positionBetween } from '@unlease/core/services/fractionalIndex';
import type { Fields } from '@unlease/core/sync/record';
import { LINE_COLORS, type LineColor } from '@unlease/design/colors';
import { EVENT_LIMITS, isLive, type CalendarEvent, type EventFile } from '@unlease/calendar/models/events';
import { nextColor } from '@unlease/calendar/services/colors';
import {
  createEvent,
  deleteForGood,
  deleteOccurrence,
  duplicateEvent,
  moveOccurrence,
  restoreEvent,
  saveOccurrence,
  type EditScope,
  type EventChange,
  type EventDraft,
} from '@unlease/calendar/services/editing';
import { erasedCount } from '@unlease/core/services/erase';
import { calendarEraseChanges } from '@unlease/calendar/services/erase';
import type { IcsCalendar } from '@unlease/calendar/services/ics';
import { forgetImport, importChanges, importedEvents, trashImported, type ImportPlan } from '@unlease/calendar/services/importing';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { feedFields, labelFields } from '@unlease/calendar/sync/entities';

import { getRecord, saveTypedField, useLibraryStore, writeLocal, type LocalChange } from './libraryStore';

export type Undo = () => void;

function undoFor(changes: readonly LocalChange[]): Undo {
  const previous: LocalChange[] = changes.map(change => {
    const record = getRecord(change.type, change.id);
    const patch: Fields = {};
    for (const field of Object.keys(change.patch)) patch[field] = record?.fields[field] ?? null;
    return { type: change.type, id: change.id, patch };
  });
  return () => writeLocal(previous);
}

function writeWithUndo(changes: readonly LocalChange[], now?: number): Undo {
  const undo = undoFor(changes);
  writeLocal(changes, now);
  return undo;
}

const events = (): Readonly<Record<string, CalendarEvent>> => useLibraryStore.getState().events;

/** The draft's typed fields as the form found them: what a merge starts from. */
export interface TypedSince {
  readonly title: string;
  readonly description: string;
}

/**
 * Writes an editing batch; a change to the record the form showed has its title and description
 * saved as typed text (merged), everything else in one batch.
 */
function writeEdit(changes: readonly EventChange[], shown: { readonly id: string; readonly since: TypedSince } | null, now: number): Undo {
  const plain: LocalChange[] = [];
  const typed: { field: 'title' | 'description'; value: string }[] = [];
  for (const change of changes) {
    if (shown && change.id === shown.id && getRecord('calendarEvent', change.id)) {
      const { title, description, ...rest } = change.patch;
      if (typeof title === 'string') typed.push({ field: 'title', value: title });
      if (typeof description === 'string') typed.push({ field: 'description', value: description });
      if (Object.keys(rest).length > 0) plain.push({ ...change, patch: rest });
    } else plain.push(change);
  }
  const undo = undoFor([...plain, ...(shown && typed.length > 0 ? [{ type: 'calendarEvent', id: shown.id, patch: Object.fromEntries(typed.map(each => [each.field, null])) }] : [])]);
  if (plain.length > 0) writeLocal(plain, now);
  for (const each of typed) saveTypedField('calendarEvent', shown!.id, each.field, shown!.since[each.field], each.value);
  return undo;
}

/** « Enregistrer » on a new event: returns its id. */
export function addEvent(draft: EventDraft, now: number = Date.now()): string {
  const change = createEvent(cleanDraft(draft), now);
  writeLocal([change], now);
  return change.id;
}

/** « Enregistrer » over an occurrence, as `scope` says. */
export function saveEvent(occurrence: Occurrence, draft: EventDraft, scope: EditScope, since: TypedSince, now: number = Date.now()): Undo {
  const changes = saveOccurrence(occurrence, cleanDraft(draft), scope, events(), now);
  return writeEdit(changes, { id: occurrence.event.id, since }, now);
}

/** A drag in a view (or « Déplacer »): the occurrence at another time, its length kept unless `end` is given. */
export function moveEvent(occurrence: Occurrence, times: { readonly start: string; readonly end?: string }, scope: EditScope, now: number = Date.now()): Undo {
  return writeWithUndo(moveOccurrence(occurrence, times, scope, events(), now), now);
}

/** To the bin (a single event or a series), or out of its series (one occurrence, or the following). */
export function deleteEvent(occurrence: Occurrence, scope: EditScope, now: number = Date.now()): Undo {
  return writeWithUndo(deleteOccurrence(occurrence, scope, events(), now), now);
}

/** « Dupliquer »: one's own copy, returns its id (the form opens on it). */
export function duplicate(occurrence: Occurrence, now: number = Date.now()): string {
  const change = duplicateEvent(occurrence, events(), now);
  writeLocal([change], now);
  return change.id;
}

/** Back from the bin, with its exceptions: the undo puts it back there. */
export function restoreFromBin(id: string): Undo {
  const event = events()[id];
  return event ? writeWithUndo(restoreEvent(event, events())) : () => undefined;
}

export function deleteFromBin(id: string, now: number = Date.now()): void {
  const event = events()[id];
  if (event) writeLocal(deleteForGood(event, events(), now), now);
}

/** Every event in the bin, gone for good: how many. */
export function emptyBin(now: number = Date.now()): number {
  const binned = Object.values(events()).filter(event => event.deletedAt === null && event.trashedAt !== null && !event.recurringId);
  const changes = binned.flatMap(event => deleteForGood(event, events(), now));
  writeLocal(changes, now);
  return binned.length;
}

/** The form's fields cut to what may travel. */
export function cleanDraft(draft: EventDraft): EventDraft {
  return {
    ...draft,
    title: draft.title.slice(0, EVENT_LIMITS.title),
    description: draft.description.slice(0, EVENT_LIMITS.description),
    place: draft.place.trim().slice(0, EVENT_LIMITS.place),
    url: draft.url.trim().slice(0, EVENT_LIMITS.url),
    reminders: [...new Set(draft.reminders)].sort((a, b) => a - b).slice(0, EVENT_LIMITS.reminders),
    labelIds: [...new Set(draft.labelIds)].slice(0, EVENT_LIMITS.labels),
    contactIds: [...new Set(draft.contactIds)].slice(0, EVENT_LIMITS.contacts),
    files: draft.files.slice(0, EVENT_LIMITS.files),
  };
}

/** A file of an event's is on the server now: every event holding it says so. */
export function markEventFileUploaded(fileId: string): void {
  const changes: LocalChange[] = [];
  for (const event of Object.values(events())) {
    if (!event.files.some(file => file.id === fileId && !file.uploaded)) continue;
    changes.push({ type: 'calendarEvent', id: event.id, patch: { files: event.files.map((file: EventFile) => (file.id === fileId ? { ...file, uploaded: true } : file)) } });
  }
  if (changes.length > 0) writeLocal(changes);
}

/** An import's plan, one batch (its labels, its events, the series it completes): how many events came. */
export function writeImport(plan: ImportPlan, now: number = Date.now()): number {
  const changes = importChanges(plan);
  if (changes.length > 0) writeLocal(changes, now);
  return plan.count;
}

/** « Annuler » on an import's slip: what it wrote, gone, as if the files had never come. */
export function undoImport(plan: ImportPlan, now: number = Date.now()): void {
  writeLocal(forgetImport(plan, now), now);
}

/** « Retirer ces événements »: the events a file brought here before, to the bin with their exceptions; how many, and the undo. */
export function removeImported(calendar: IcsCalendar, now: number = Date.now()): { readonly count: number; readonly undo: Undo } {
  const all = Object.values(events());
  const found = importedEvents(calendar, all);
  if (found.length === 0) return { count: 0, undo: () => undefined };
  return { count: found.length, undo: writeWithUndo(trashImported(found, all, now), now) };
}

// ── erasing ────────────────────────────────────────────────────────────────

/** « Effacer des données »: the parts chosen, tombstoned as one batch (a label erased taken off the events that stay); how many records went. */
export function eraseCalendar(chosen: ReadonlySet<string>, now: number = Date.now()): number {
  const { events: all, calendarLabels, feeds } = useLibraryStore.getState();
  const library = { events: all, labels: calendarLabels, feeds };
  const changes = calendarEraseChanges(library, chosen, now);
  if (changes.length > 0) writeLocal(changes, now);
  return erasedCount(changes);
}

// ── labels ─────────────────────────────────────────────────────────────────

const lastPosition = (ids: readonly string[], map: Readonly<Record<string, { position: string }>>): string | null => {
  const last = ids[ids.length - 1];
  return last ? (map[last]?.position ?? null) : null;
};

/** « Créer un libellé »: its id. */
export function createLabel(name: string, color?: LineColor, now: number = Date.now()): string {
  const state = useLibraryStore.getState();
  const used = state.calendarLabelOrder.map(id => state.calendarLabels[id]!.color);
  const id = createId(now);
  writeLocal([{ type: 'calendarLabel', id, patch: labelFields({ name: name.trim().slice(0, EVENT_LIMITS.labelName), color: color ?? nextColor(used, LINE_COLORS), position: positionBetween(lastPosition(state.calendarLabelOrder, state.calendarLabels), null), createdAt: now, deletedAt: null }) }], now);
  return id;
}

export function renameLabel(id: string, name: string): void {
  writeLocal([{ type: 'calendarLabel', id, patch: { name: name.trim().slice(0, EVENT_LIMITS.labelName) } }]);
}

export function setLabelColor(id: string, color: LineColor): void {
  writeLocal([{ type: 'calendarLabel', id, patch: { color } }]);
}

/** A label deleted: the events wearing it lose it, in the same batch. */
export function deleteLabel(id: string, now: number = Date.now()): Undo {
  const changes: LocalChange[] = [{ type: 'calendarLabel', id, patch: { deletedAt: now } }];
  for (const event of Object.values(events())) {
    if (event.deletedAt === null && event.labelIds.includes(id)) changes.push({ type: 'calendarEvent', id: event.id, patch: { labelIds: event.labelIds.filter(each => each !== id) } });
  }
  return writeWithUndo(changes, now);
}

// ── subscriptions ──────────────────────────────────────────────────────────

/** « S'abonner »: a calendar at an address, read by the server from then on. Its id. */
export function subscribe(url: string, name: string, now: number = Date.now()): string {
  const state = useLibraryStore.getState();
  const used = state.feedOrder.map(id => state.feeds[id]!.color);
  const id = createId(now);
  writeLocal(
    [{ type: 'calendarFeed', id, patch: feedFields({ kind: 'ics', name: name.trim().slice(0, EVENT_LIMITS.feedName), url, color: nextColor(used, [...LINE_COLORS].reverse()), hidden: false, position: positionBetween(lastPosition(state.feedOrder, state.feeds), null), refreshedAt: null, error: '', createdAt: now, deletedAt: null }) }],
    now,
  );
  return id;
}

export function updateFeed(id: string, patch: Partial<{ name: string; color: LineColor; hidden: boolean; url: string }>): void {
  writeLocal([{ type: 'calendarFeed', id, patch }]);
}

/** « Se désabonner »: the calendar goes; the server tombstones its events. The undo follows it again. */
export function unsubscribe(id: string, now: number = Date.now()): Undo {
  return writeWithUndo([{ type: 'calendarFeed', id, patch: { deletedAt: now } }], now);
}

/** The live events of one's own (not subscriptions', not the bin's), series and exceptions. */
export function ownLiveEvents(): CalendarEvent[] {
  return Object.values(events()).filter(event => isLive(event) && event.feedId === null);
}
