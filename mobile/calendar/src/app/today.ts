/**
 * « Aujourd'hui » on this phone: what today and tomorrow hold, gathered as the views gather it
 * (`agendaIn`: the calendars hidden left out, the layers kept on), put in the day's order by
 * `planToday`; Carnet's reminders missed and still set (with its layer on), and the day's page in
 * Pages when this phone holds it. Pure, so the view, the widget and the tests read it the same way.
 */
import type { CalendarPrefs } from '@unlease/calendar/models/prefs';
import { addDays } from '@unlease/calendar/services/time';
import { overdueReminders, planToday, type DayItem, type TodayPlan } from '@unlease/calendar/services/today';
import { dailyPageOf } from '@unlease/pages/services/dailyPage';

import { agendaIn, eventItem } from './agenda';
import type { LibraryState } from './store/libraryStore';

export interface TodayGathered {
  /** What touches `today` and the day after. */
  readonly items: readonly DayItem[];
  readonly overdue: ReturnType<typeof overdueReminders>;
  /** The day's page in Pages: « Note du jour » opens it rather than making it. */
  readonly dailyPageId: string | null;
}

/** What `today` and the day after hold (`days` more for a widget that may be drawn after midnight). */
export function gatherToday(state: LibraryState, prefs: CalendarPrefs, today: string, days = 2): TodayGathered {
  const agenda = agendaIn(state, prefs, today, addDays(today, days));
  return {
    items: [...agenda.extras, ...agenda.occurrences.map(occurrence => eventItem(state, occurrence))],
    overdue: prefs.noteReminders ? overdueReminders(Object.values(state.carnet.notes), today) : [],
    dailyPageId: dailyPageOf(state.blocks, today),
  };
}

/** The day at a glance, at `now`. */
export function todayPlan(gathered: TodayGathered, today: string, now: number): TodayPlan {
  return planToday({ today, now, items: gathered.items, overdue: gathered.overdue, dailyPageId: gathered.dailyPageId });
}
