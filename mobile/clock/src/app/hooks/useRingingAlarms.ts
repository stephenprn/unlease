/**
 * The alarms as they ring (`ringingAlarms`): an alarm for an Agenda event at that event's time, an
 * alarm that asks for it quiet on public holidays and days off. Everything that counts rings reads
 * them (the week, the cards, the evening check, the engine's plan), never the stored ones.
 */
import { useMemo } from 'react';

import { dayToInstant, instantToDay } from '@unlease/calendar/services/time';
import type { Alarm } from '@unlease/clock/models/alarm';
import { ringingAlarms } from '@unlease/clock/services/agenda';
import { useMinute } from '@shared/app/hooks/useMinute';

import { useLibraryStore } from '../store/libraryStore';

/** Outside React (the engine, the notices, an action): the alarms as they ring now. */
export function ringingAlarmsNow(now: number = Date.now()): Alarm[] {
  const state = useLibraryStore.getState();
  return ringingAlarms(Object.values(state.alarms), { events: Object.values(state.events), feeds: Object.values(state.feeds) }, now);
}

/** One alarm as it rings now; undefined when there is none by that id. */
export function ringingAlarmNow(id: string, now: number = Date.now()): Alarm | undefined {
  const stored = useLibraryStore.getState().alarms[id];
  if (!stored) return undefined;
  const state = useLibraryStore.getState();
  return ringingAlarms([stored], { events: Object.values(state.events), feeds: Object.values(state.feeds) }, now)[0];
}

/** The alarms as they ring, by id, again whenever the alarms, Agenda's records or the day change. */
export function useRingingAlarms(): Readonly<Record<string, Alarm>> {
  const alarms = useLibraryStore(state => state.alarms);
  const events = useLibraryStore(state => state.events);
  const feeds = useLibraryStore(state => state.feeds);
  const now = useMinute();
  const day = instantToDay(now);
  return useMemo(() => {
    const out: Record<string, Alarm> = {};
    // Counted from the day's start: the quiet days run from the day before.
    for (const alarm of ringingAlarms(Object.values(alarms), { events: Object.values(events), feeds: Object.values(feeds) }, dayToInstant(day))) out[alarm.id] = alarm;
    return out;
  }, [alarms, events, feeds, day]);
}
