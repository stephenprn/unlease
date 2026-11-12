/**
 * Every change the person makes in Agenda: each action is one `writeLocal` batch (one clock tick,
 * pending, synced), built by the package's editing rules (`@unlease/calendar/services/editing`) so
 * the phone writes the same records. Those that can be taken back return their undo, which writes
 * the old values with a newer clock. Never mutate events another way.
 */
import { createId } from '@unlease/core/services/ids';
import { positionBetween } from '@unlease/core/services/fractionalIndex';
import type { Fields } from '@unlease/core/sync/record';
import { mergeField } from '@unlease/core/sync/textMerge';
import { nextLineColor, type LineColor } from '@unlease/design/colors';
import { CALENDAR_TEXT_LIMITS, EVENT_LIMITS, isOwn, type CalendarEvent, type EventFile } from '@unlease/calendar/models/events';
import { createEvent, deleteForGood, deleteOccurrence, duplicateEvent, moveOccurrence, restoreEvent, saveOccurrence, type EditScope, type EventChange, type EventDraft } from '@unlease/calendar/services/editing';
import { erasedCount } from '@unlease/core/services/erase';
import { calendarEraseChanges } from '@unlease/calendar/services/erase';
import type { IcsCalendar } from '@unlease/calendar/services/ics';
import { forgetImport, importChanges, importedEvents, trashImported, type ImportPlan } from '@unlease/calendar/services/importing';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { feedFields, labelFields } from '@unlease/calendar/sync/entities';

import { getRecord, writeLocal, type LocalChange } from '@shared/app/store/records';
import { useCalendarStore } from './library';

export type Undo = () => void;

const state = () => useCalendarStore.getState();

/** Exactly these fields of these records back to what they were. */
function undoFor(changes: readonly LocalChange[]): Undo {
  const previous: LocalChange[] = changes.map(change => {
    const record = getRecord(change.type, change.id);
    const patch: Fields = {};
    for (const field of Object.keys(change.patch)) patch[field] = record?.fields[field] ?? null;
    // A record this batch made goes back to nothing: its tombstone.
    if (!record) patch.deletedAt = Date.now();
    return { type: change.type, id: change.id, patch };
  });
  return () => writeLocal(previous);
}

function writeWithUndo(changes: readonly LocalChange[], now: number = Date.now()): Undo {
  if (changes.length === 0) return () => {};
  const undo = undoFor(changes);
  writeLocal(changes, now);
  return undo;
}

// ── typed text ─────────────────────────────────────────────────────────────

/** What the form opened with, for the title and the description: typed text merges with what came meanwhile. */
export interface TypedSince {
  readonly title: string | null;
  readonly description: string | null;
}

/** A typed field as `saveTypedText` saves it: an edit from elsewhere since `since` is merged with what was typed, word by word. */
function typed(id: string, field: 'title' | 'description', since: string | null, value: string): string {
  const kept = value.slice(0, CALENDAR_TEXT_LIMITS.calendarEvent[field]);
  const stored = getRecord('calendarEvent', id)?.fields[field];
  if (since === null || typeof stored !== 'string' || stored === since || stored === kept) return kept;
  return mergeField('calendarEvent', field, since, kept, stored, false);
}

/** An event's title or description as typed (an inline editor), merged with what came since `since`. Returns what is stored now. */
export function saveTypedText(type: 'calendarEvent', id: string, field: 'title' | 'description', since: string | null, value: string): string {
  const next = typed(id, field, since, value);
  if (getRecord(type, id)?.fields[field] !== next) writeLocal([{ type, id, patch: { [field]: next } }]);
  return next;
}

/** The batch with its typed fields merged where they write into a record that was already there. */
function mergeTyped(changes: readonly EventChange[], since: TypedSince): LocalChange[] {
  return changes.map(change => {
    if (!getRecord(change.type, change.id)) return change;
    const patch = { ...change.patch };
    if (typeof patch.title === 'string') patch.title = typed(change.id, 'title', since.title, patch.title);
    if (typeof patch.description === 'string') patch.description = typed(change.id, 'description', since.description, patch.description);
    return { ...change, patch };
  });
}

// ── events ─────────────────────────────────────────────────────────────────

/** A new event from the form or the grid; its id. */
export function addEvent(draft: EventDraft, now: number = Date.now()): string {
  const change = createEvent(draft, now);
  writeLocal([change], now);
  return change.id;
}

/** The form's « Enregistrer » over an occurrence, for the events `scope` names. */
export function saveEvent(occurrence: Occurrence, draft: EventDraft, scope: EditScope, since: TypedSince, now: number = Date.now()): Undo {
  return writeWithUndo(mergeTyped(saveOccurrence(occurrence, draft, scope, state().events, now), since), now);
}

/** An occurrence dragged to another time or day (or its end dragged). */
export function moveEvent(occurrence: Occurrence, times: { readonly start: string; readonly end?: string }, scope: EditScope, now: number = Date.now()): Undo {
  return writeWithUndo(moveOccurrence(occurrence, times, scope, state().events, now), now);
}

/** « Supprimer »: to the bin, or out of its series. */
export function deleteEvent(occurrence: Occurrence, scope: EditScope, now: number = Date.now()): Undo {
  return writeWithUndo(deleteOccurrence(occurrence, scope, state().events, now), now);
}

/** « Dupliquer »: a copy of one's own, its id. */
export function duplicate(occurrence: Occurrence, now: number = Date.now()): string {
  const change = duplicateEvent(occurrence, state().events, now);
  writeLocal([change], now);
  return change.id;
}

/** Back from the bin, with its exceptions: the undo puts it back there. */
export function restore(event: CalendarEvent): Undo {
  return writeWithUndo(restoreEvent(event, state().events));
}

export function deleteEventForGood(event: CalendarEvent, now: number = Date.now()): void {
  writeLocal(deleteForGood(event, state().events, now), now);
}

/** The events in the bin: series and single events of one's own, the last binned first. */
export function binnedEvents(): CalendarEvent[] {
  return Object.values(state().events)
    .filter(event => event.deletedAt === null && event.trashedAt !== null && isOwn(event) && !event.recurringId)
    .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
}

/** « Vider la corbeille »: how many went. */
export function emptyBin(now: number = Date.now()): number {
  const binned = binnedEvents();
  const changes = binned.flatMap(event => deleteForGood(event, state().events, now));
  writeLocal(changes, now);
  return binned.length;
}

/** The labels of an event, set whole. */
export function setEventLabels(id: string, labelIds: readonly string[]): Undo {
  return writeWithUndo([{ type: 'calendarEvent', id, patch: { labelIds: [...labelIds].slice(0, EVENT_LIMITS.labels) } }]);
}

/** A file this browser sent: every event holding it says so. */
export function markFileUploaded(fileId: string): void {
  const changes: LocalChange[] = [];
  for (const event of Object.values(state().events)) {
    if (!event.files.some(file => file.id === fileId && !file.uploaded)) continue;
    changes.push({ type: 'calendarEvent', id: event.id, patch: { files: event.files.map(file => (file.id === fileId ? { ...file, uploaded: true } : { ...file })) } });
  }
  if (changes.length > 0) writeLocal(changes);
}

/** The events holding a file, the live first. */
export function eventsWithFile(fileId: string): CalendarEvent[] {
  return Object.values(state().events).filter(event => event.files.some(file => file.id === fileId));
}

export type { EventFile };

// ── an import ──────────────────────────────────────────────────────────────

/** An import's plan, written as one batch (its labels, its events, the series it completes): how many events came. */
export function applyImport(plan: ImportPlan, now: number = Date.now()): number {
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
  const events = Object.values(state().events);
  const found = importedEvents(calendar, events);
  return { count: found.length, undo: writeWithUndo(trashImported(found, events, now), now) };
}

// ── erasing ────────────────────────────────────────────────────────────────

/** « Effacer des données »: the parts chosen, tombstoned as one batch (a label erased taken off the events that stay); how many records went. */
export function eraseCalendar(chosen: ReadonlySet<string>, now: number = Date.now()): number {
  const { events, labels, feeds } = state();
  const library = { events, labels, feeds };
  const changes = calendarEraseChanges(library, chosen, now);
  if (changes.length > 0) writeLocal(changes, now);
  return erasedCount(changes);
}

// ── labels ─────────────────────────────────────────────────────────────────

const liveLabels = () =>
  Object.values(state().labels)
    .filter(label => label.deletedAt === null)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1));

export function createLabel(name: string, now: number = Date.now()): string {
  const labels = liveLabels();
  const id = createId(now);
  writeLocal(
    [
      {
        type: 'calendarLabel',
        id,
        patch: labelFields({
          name: name.trim().slice(0, EVENT_LIMITS.labelName),
          color: nextLineColor(labels.map(label => label.color)),
          position: positionBetween(labels.at(-1)?.position ?? null, null),
          createdAt: now,
          deletedAt: null,
        }),
      },
    ],
    now,
  );
  return id;
}

export function renameLabel(id: string, name: string): void {
  writeLocal([{ type: 'calendarLabel', id, patch: { name: name.trim().slice(0, EVENT_LIMITS.labelName) } }]);
}

export function setLabelColor(id: string, color: LineColor): void {
  writeLocal([{ type: 'calendarLabel', id, patch: { color } }]);
}

/** A label gone: the events wearing it lose it, in the same batch. */
export function deleteLabel(id: string, now: number = Date.now()): Undo {
  const changes: LocalChange[] = [{ type: 'calendarLabel', id, patch: { deletedAt: now } }];
  for (const event of Object.values(state().events)) {
    if (event.deletedAt === null && event.labelIds.includes(id)) changes.push({ type: 'calendarEvent', id: event.id, patch: { labelIds: event.labelIds.filter(each => each !== id) } });
  }
  return writeWithUndo(changes, now);
}

// ── subscribed calendars ───────────────────────────────────────────────────

const liveFeeds = () =>
  Object.values(state().feeds)
    .filter(feed => feed.deletedAt === null)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));

/** A calendar subscribed to by its address: the server reads it and brings its events. */
export function addFeed(url: string, name: string, color: LineColor | null = null, now: number = Date.now()): string {
  const feeds = liveFeeds();
  const id = createId(now);
  writeLocal(
    [
      {
        type: 'calendarFeed',
        id,
        patch: feedFields({
          kind: 'ics',
          name: name.trim().slice(0, EVENT_LIMITS.feedName),
          url: url.slice(0, EVENT_LIMITS.url),
          color: color ?? nextLineColor([...feeds.map(feed => feed.color), ...liveLabels().map(label => label.color)]),
          hidden: false,
          position: positionBetween(feeds.at(-1)?.position ?? null, null),
          refreshedAt: null,
          error: '',
          createdAt: now,
          deletedAt: null,
        }),
      },
    ],
    now,
  );
  return id;
}

export function renameFeed(id: string, name: string): void {
  writeLocal([{ type: 'calendarFeed', id, patch: { name: name.trim().slice(0, EVENT_LIMITS.feedName) } }]);
}

export function setFeedColor(id: string, color: LineColor): void {
  writeLocal([{ type: 'calendarFeed', id, patch: { color } }]);
}

/** Shown or left out of the views, on every device. */
export function setFeedHidden(id: string, hidden: boolean): void {
  writeLocal([{ type: 'calendarFeed', id, patch: { hidden } }]);
}

/** Unsubscribed: the server lets its events go. */
export function deleteFeed(id: string, now: number = Date.now()): Undo {
  return writeWithUndo([{ type: 'calendarFeed', id, patch: { deletedAt: now } }], now);
}
