/**
 * The alarms as the screens read them: the live ones as they ring (`ringingAlarms`: an alarm for an
 * Agenda event at that event's time, holidays and days off kept quiet) in the list's order (by time of
 * day, then the oldest first: `byTime`), one by its id, and the day's events from Agenda for a morning.
 */
import { useMemo } from 'react';

import type { Alarm } from '@unlease/clock/models/alarm';
import { ringingAlarms } from '@unlease/clock/services/agenda';
import { dayAhead, type DayAhead } from '@unlease/clock/services/morning';
import { byTime } from '@unlease/clock/services/schedule';
import type { Day } from '@unlease/calendar/models/events';
import { dayToInstant, instantToDay } from '@unlease/calendar/services/time';
import { useMinute } from '@shared/app/hooks/useMinute';

import { useAgendaStore } from '../store/agenda';
import { useClockStore } from '../store/library';

/** Outside React (an action): one alarm as it rings now. */
export function ringingAlarmNow(id: string, now: number = Date.now()): Alarm | undefined {
  const alarm = useClockStore.getState().alarms[id];
  if (!alarm) return undefined;
  const agenda = useAgendaStore.getState();
  return ringingAlarms([alarm], { events: Object.values(agenda.events), feeds: Object.values(agenda.feeds) }, now)[0];
}

/** Every live alarm as it rings, by time of day; again whenever the alarms, Agenda's records or the day change. */
export function useLiveAlarms(): readonly Alarm[] {
  const alarms = useClockStore(s => s.alarms);
  const events = useAgendaStore(s => s.events);
  const feeds = useAgendaStore(s => s.feeds);
  const day = instantToDay(useMinute());
  return useMemo(
    // Counted from the day's start: the quiet days run from the day before.
    () => ringingAlarms(Object.values(alarms).filter(alarm => alarm.deletedAt === null), { events: Object.values(events), feeds: Object.values(feeds) }, dayToInstant(day)).sort(byTime),
    [alarms, events, feeds, day],
  );
}

/** One live alarm as it rings; undefined once deleted or not there. */
export function useAlarm(id: string | null): Alarm | undefined {
  const alarms = useLiveAlarms();
  return id === null ? undefined : alarms.find(alarm => alarm.id === id);
}

/** A day's events from Agenda (its own and the calendars shown), as an alarm that day would say them. */
export function useDayAhead(day: Day): DayAhead {
  const events = useAgendaStore(s => s.events);
  const feeds = useAgendaStore(s => s.feeds);
  return useMemo(() => dayAhead({ events: Object.values(events), feeds: Object.values(feeds) }, day), [events, feeds, day]);
}
