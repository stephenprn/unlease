/**
 * Agenda's events as the other web apps hold them (Carnet's notes and Pages' pages mention events,
 * Pages embeds the next ones): read only, folded from the shell's records like Agenda's own library,
 * for naming a mention, finding an event to mention and drawing a calendar block. Kept here, in
 * Carnet's area, because both Carnet's and Pages' web apps reach it (Pages may import Carnet's);
 * Agenda's own web app keeps its library and never installs this.
 *
 * Each map is copied on write and an entity replaced only when its own record changed, so a selector
 * on one event re-renders for that event alone.
 */
import { create } from 'zustand';

import type { CalendarEvent, CalendarFeed, CalendarLabel } from '@unlease/calendar/models/events';
import { eventFromRecord, feedFromRecord, labelFromRecord } from '@unlease/calendar/sync/entities';
import { CALENDAR_TYPES } from '@unlease/calendar/sync/types';

import type { Projection } from '@shared/app/store/records';
import type { AppData } from '@shared/modules';

export interface EventsState {
  readonly events: Readonly<Record<string, CalendarEvent>>;
  readonly labels: Readonly<Record<string, CalendarLabel>>;
  readonly feeds: Readonly<Record<string, CalendarFeed>>;
}

const EMPTY: EventsState = { events: {}, labels: {}, feeds: {} };

export const useEventsStore = create<EventsState>(() => EMPTY);

export const eventsProjection: Projection = {
  types: CALENDAR_TYPES,
  apply(changed, fresh) {
    useEventsStore.setState(state => {
      const base = fresh ? EMPTY : state;
      let { events, labels, feeds } = base;
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
      return { events, labels, feeds };
    }, true);
  },
  clear() {
    useEventsStore.setState(EMPTY, true);
  },
};

/** Agenda's records in another app's web app (Carnet's, Pages'): an event opens in Agenda's own (`suitePlace`). */
export const eventsData: AppData = {
  id: 'calendar',
  projection: eventsProjection,
};
