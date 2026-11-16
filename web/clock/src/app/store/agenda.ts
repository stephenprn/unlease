/**
 * Agenda's records as Clock's web app holds them: read only, folded from the shell's records like
 * Agenda's own library, for what an alarm says of the day as it rings (`@unlease/clock/services/morning`:
 * the day's events, the first one, one too close to the alarm). Clock folds them itself from
 * Agenda's package rather than borrow Agenda's web app (`@calendar/data`): no app's web code is
 * Clock's to import (the web's lint). An event opens in Agenda's own web app (`suitePlace`).
 *
 * Each map is copied on write and an entity replaced only when its own record changed.
 */
import { create } from 'zustand';

import type { CalendarEvent, CalendarFeed } from '@unlease/calendar/models/events';
import { eventFromRecord, feedFromRecord } from '@unlease/calendar/sync/entities';
import { CALENDAR_TYPES } from '@unlease/calendar/sync/types';

import type { Projection } from '@shared/app/store/records';
import type { AppData } from '@shared/modules';

export interface AgendaState {
  /** Every event, live, in the bin or a tombstone: one's own and those of the calendars followed. */
  readonly events: Readonly<Record<string, CalendarEvent>>;
  /** Every calendar followed (the holidays' too), deleted ones too: a hidden one's events are left out. */
  readonly feeds: Readonly<Record<string, CalendarFeed>>;
  readonly revision: number;
}

const EMPTY: AgendaState = { events: {}, feeds: {}, revision: 0 };

export const useAgendaStore = create<AgendaState>(() => EMPTY);

/** Agenda's types, all of them (its labels too: the sync pulls an app's types whole), the labels left unread. */
export const agendaProjection: Projection = {
  types: CALENDAR_TYPES,
  apply(changed, fresh) {
    useAgendaStore.setState(state => {
      const base = fresh ? EMPTY : state;
      let { events, feeds } = base;
      for (const record of changed) {
        if (record.type === 'calendarEvent') {
          if (events === base.events) events = { ...base.events };
          (events as Record<string, CalendarEvent>)[record.id] = eventFromRecord(record);
        } else if (record.type === 'calendarFeed') {
          if (feeds === base.feeds) feeds = { ...base.feeds };
          (feeds as Record<string, CalendarFeed>)[record.id] = feedFromRecord(record);
        }
      }
      return { events, feeds, revision: base.revision + 1 };
    }, true);
  },
  clear() {
    useAgendaStore.setState(EMPTY, true);
  },
};

/** Agenda's records in Clock's web app. */
export const agendaData: AppData = {
  id: 'calendar',
  projection: agendaProjection,
};
