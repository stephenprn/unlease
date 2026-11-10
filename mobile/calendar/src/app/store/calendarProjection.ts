/**
 * Agenda's records as screens read them: every event, label and subscribed calendar
 * (`@unlease/calendar/models/events`), the labels' and calendars' order. A projection of the shared
 * library (`@shared/app/store/library`): only the touched maps are replaced, and an entry keeps its
 * identity unless its own record changed.
 *
 * A leaf: it imports only the shared code and the packages, so another app of the suite may borrow
 * it (Carnet and Pages, to name the events their text mentions).
 */
import { comparePositions } from '@unlease/core/services/fractionalIndex';
import type { SyncRecord } from '@unlease/core/sync/record';
import type { CalendarEvent, CalendarFeed, CalendarLabel } from '@unlease/calendar/models/events';
import { eventFromRecord, feedFromRecord, labelFromRecord } from '@unlease/calendar/sync/entities';
import type { LibraryBase, LibraryProjection } from '@shared/app/store/library';

export interface CalendarState extends LibraryBase {
  /** Every event this device holds (series, exceptions, subscriptions' and holidays'), in the bin and deleted ones too. */
  readonly events: Readonly<Record<string, CalendarEvent>>;
  /** Every label, deleted ones too. */
  readonly calendarLabels: Readonly<Record<string, CalendarLabel>>;
  /** The live labels, in their order. */
  readonly calendarLabelOrder: readonly string[];
  /** Every subscribed calendar (and the holidays'), deleted ones too. */
  readonly feeds: Readonly<Record<string, CalendarFeed>>;
  /** The live calendars, in their order. */
  readonly feedOrder: readonly string[];
}

const EMPTY: CalendarState = { events: {}, calendarLabels: {}, calendarLabelOrder: [], feeds: {}, feedOrder: [], revision: 0 };

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function order<T extends { readonly id: string; readonly position: string; readonly deletedAt: number | null }>(map: Readonly<Record<string, T>>): string[] {
  return Object.values(map)
    .filter(item => item.deletedAt === null)
    .sort(comparePositions)
    .map(item => item.id);
}

export function calendarProjection(): LibraryProjection<CalendarState> {
  function decode(base: CalendarState, changed: readonly SyncRecord[]): CalendarState {
    const draft: { -readonly [K in keyof CalendarState]: CalendarState[K] } = { ...base };
    let events = false;
    let labels = false;
    let feeds = false;
    for (const record of changed) {
      if (record.type === 'calendarEvent') {
        if (!events) draft.events = { ...draft.events };
        events = true;
        (draft.events as Record<string, CalendarEvent>)[record.id] = eventFromRecord(record);
      } else if (record.type === 'calendarLabel') {
        if (!labels) draft.calendarLabels = { ...draft.calendarLabels };
        labels = true;
        (draft.calendarLabels as Record<string, CalendarLabel>)[record.id] = labelFromRecord(record);
      } else if (record.type === 'calendarFeed') {
        if (!feeds) draft.feeds = { ...draft.feeds };
        feeds = true;
        (draft.feeds as Record<string, CalendarFeed>)[record.id] = feedFromRecord(record);
      }
    }
    if (labels) {
      const next = order(draft.calendarLabels);
      if (!sameIds(next, draft.calendarLabelOrder)) draft.calendarLabelOrder = next;
    }
    if (feeds) {
      const next = order(draft.feeds);
      if (!sameIds(next, draft.feedOrder)) draft.feedOrder = next;
    }
    return draft;
  }
  return { empty: EMPTY, decode, clear: () => undefined };
}
