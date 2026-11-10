/**
 * Agenda's records as Carnet's and Pages' phone apps hold them (their notes and pages mention events,
 * a page's calendar block lists the next ones): read only, kept under one key, `agenda`, since their
 * keys (`labels`) would meet Carnet's in one state. Agenda's own app keeps its own library.
 *
 * A leaf: it imports only the shared code and the packages, so Pages borrows it
 * (`@carnet/app/store/eventsProjection`). Untouched entries keep their identity, so a mention
 * re-renders only for its own event.
 */
import type { SyncRecord } from '@unlease/core/sync/record';
import type { CalendarEvent, CalendarFeed, CalendarLabel } from '@unlease/calendar/models/events';
import { eventFromRecord, feedFromRecord, labelFromRecord } from '@unlease/calendar/sync/entities';
import type { LibraryBase, LibraryProjection } from '@shared/app/store/library';

export interface AgendaRecords {
  readonly events: Readonly<Record<string, CalendarEvent>>;
  readonly labels: Readonly<Record<string, CalendarLabel>>;
  readonly feeds: Readonly<Record<string, CalendarFeed>>;
}

export interface EventsState extends LibraryBase {
  readonly agenda: AgendaRecords;
}

const EMPTY: AgendaRecords = { events: {}, labels: {}, feeds: {} };

export function eventsProjection(): LibraryProjection<EventsState> {
  return {
    empty: { agenda: EMPTY, revision: 0 },
    decode: (base: EventsState, changed: readonly SyncRecord[]): EventsState => {
      let { events, labels, feeds } = base.agenda;
      const before = base.agenda;
      for (const record of changed) {
        if (record.type === 'calendarEvent') {
          if (events === before.events) events = { ...before.events };
          (events as Record<string, CalendarEvent>)[record.id] = eventFromRecord(record);
        } else if (record.type === 'calendarLabel') {
          if (labels === before.labels) labels = { ...before.labels };
          (labels as Record<string, CalendarLabel>)[record.id] = labelFromRecord(record);
        } else if (record.type === 'calendarFeed') {
          if (feeds === before.feeds) feeds = { ...before.feeds };
          (feeds as Record<string, CalendarFeed>)[record.id] = feedFromRecord(record);
        }
      }
      if (events === before.events && labels === before.labels && feeds === before.feeds) return base;
      return { ...base, agenda: { events, labels, feeds } };
    },
    clear: () => undefined,
  };
}
