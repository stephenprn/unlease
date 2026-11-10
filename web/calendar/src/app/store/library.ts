/**
 * Agenda's library: every event, label and subscribed calendar, in memory, folded from the shell's
 * records (`@shared/app/store/records`, which writes them through to IndexedDB and syncs them). A
 * leaf: another app's web app that shows events (Carnet's and Pages' mentions) imports it with
 * `data.ts` and nothing of Agenda's screens.
 *
 * Re-render discipline (load-bearing): each map is copied on write and an entity is replaced only
 * when its own record changed, so a selector on one event re-renders for that event alone.
 */
import { create } from 'zustand';

import type { CalendarEvent, CalendarFeed, CalendarLabel } from '@unlease/calendar/models/events';
import { eventFromRecord, feedFromRecord, labelFromRecord } from '@unlease/calendar/sync/entities';
import { CALENDAR_TYPES } from '@unlease/calendar/sync/types';

import type { Projection } from '@shared/app/store/records';

export interface CalendarState {
  /** Every event, live, in the bin or a tombstone (`deletedAt`): one's own, and those of subscriptions. */
  readonly events: Readonly<Record<string, CalendarEvent>>;
  /** Every label, deleted ones too. */
  readonly labels: Readonly<Record<string, CalendarLabel>>;
  /** Every subscribed calendar (the holidays' too), deleted ones too. */
  readonly feeds: Readonly<Record<string, CalendarFeed>>;
  /** Bumped by every change: cheap invalidation for derived caches (the spotlight, the occurrences). */
  readonly revision: number;
}

const EMPTY: CalendarState = { events: {}, labels: {}, feeds: {}, revision: 0 };

export const useCalendarStore = create<CalendarState>(() => EMPTY);

/** What the shell feeds: Agenda's records, and only those. */
export const calendarProjection: Projection = {
  types: CALENDAR_TYPES,
  apply(changed, fresh) {
    useCalendarStore.setState(state => {
      const base = fresh ? EMPTY : state;
      let events = base.events;
      let labels = base.labels;
      let feeds = base.feeds;
      for (const record of changed) {
        if (record.type === 'calendarEvent') {
          if (events === base.events) events = { ...base.events };
          (events as Record<string, CalendarEvent>)[record.id] = eventFromRecord(record);
        } else if (record.type === 'calendarLabel') {
          if (labels === base.labels) labels = { ...base.labels };
          (labels as Record<string, CalendarLabel>)[record.id] = labelFromRecord(record);
        } else if (record.type === 'calendarFeed') {
          if (feeds === base.feeds) feeds = { ...base.feeds };
          (feeds as Record<string, CalendarFeed>)[record.id] = feedFromRecord(record);
        }
      }
      return { events, labels, feeds, revision: base.revision + 1 };
    }, true);
  },
  clear() {
    useCalendarStore.setState(EMPTY, true);
  },
};

/** An event's title as words, for another app naming its mention; null once gone. */
export function eventTitle(id: string): string | null {
  const event = useCalendarStore.getState().events[id];
  return event && event.deletedAt === null ? event.title.trim() : null;
}
