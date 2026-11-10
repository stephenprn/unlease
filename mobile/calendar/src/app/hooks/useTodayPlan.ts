/** « Aujourd'hui »'s plan: gathered again when what it reads changes, ordered again each minute (the now line, « Dans 20 min »). */
import { useMemo } from 'react';

import type { TodayPlan } from '@unlease/calendar/services/today';

import { selectPrefs, useCalendarUiStore } from '../store/calendarUi';
import { useLibraryStore } from '../store/libraryStore';
import { gatherToday, todayPlan } from '../today';

export function useTodayPlan(today: string, now: number): { readonly plan: TodayPlan; readonly dailyPageId: string | null } {
  const events = useLibraryStore(s => s.events);
  const feeds = useLibraryStore(s => s.feeds);
  const people = useLibraryStore(s => s.people);
  const carnet = useLibraryStore(s => s.carnet);
  const blocks = useLibraryStore(s => s.blocks);
  const labels = useLibraryStore(s => s.calendarLabels);
  const prefs = useCalendarUiStore(selectPrefs);
  const gathered = useMemo(
    () => gatherToday(useLibraryStore.getState(), prefs, today),
    // The pieces of the state it reads: a change elsewhere (a link's reading) gathers nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, feeds, people, carnet, blocks, labels, prefs, today],
  );
  const plan = useMemo(() => todayPlan(gathered, today, now), [gathered, today, now]);
  return { plan, dailyPageId: gathered.dailyPageId };
}
