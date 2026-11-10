/**
 * What this phone alone remembers of Agenda (never synced): how the calendar looks
 * (`CalendarPrefs`: its view, the week's first day, weekends, week numbers, the hours' format, a new
 * event's length and reminders, the layers shown from the other apps, the weather), and, in memory
 * only, the day it shows.
 */
import { create } from 'zustand';

import { CALENDAR_PREFS_DEFAULTS, readCalendarPrefs, type CalendarPrefs } from '@unlease/calendar/models/prefs';
import type { CalendarView } from '@unlease/calendar/services/eventText';
import { today } from '@unlease/calendar/services/time';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';

const KEY = 'calendar.prefs';

interface CalendarUiState {
  readonly prefs: CalendarPrefs;
  /** The day the views are around (`2026-11-02`). */
  readonly day: string;
  /** The view shown: the preference's at start, then what the switcher picks. */
  readonly view: CalendarView;
}

export const useCalendarUiStore = create<CalendarUiState>(() => ({ prefs: CALENDAR_PREFS_DEFAULTS, day: today(Date.now()), view: 'schedule' }));

export const selectPrefs = (s: CalendarUiState): CalendarPrefs => s.prefs;
export const selectDay = (s: CalendarUiState): string => s.day;
export const selectView = (s: CalendarUiState): CalendarView => s.view;

/** On the phone the schedule opens first unless the person chose another view. */
export function loadCalendarUi(now: number = Date.now()): void {
  const stored = readPreferences()[KEY];
  const prefs = readCalendarPrefs(stored ?? { ...CALENDAR_PREFS_DEFAULTS, view: 'schedule' });
  useCalendarUiStore.setState({ prefs, day: today(now), view: prefs.view });
}

export function setPrefs(patch: Partial<CalendarPrefs>): void {
  const prefs = { ...useCalendarUiStore.getState().prefs, ...patch };
  writePreference(KEY, prefs);
  useCalendarUiStore.setState({ prefs });
}

export function showDay(day: string): void {
  useCalendarUiStore.setState({ day });
}

/** The view chosen is remembered for the next start too. */
export function showView(view: CalendarView, day?: string): void {
  setPrefs({ view });
  useCalendarUiStore.setState(day ? { view, day } : { view });
}
