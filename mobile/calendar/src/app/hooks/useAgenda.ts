/** The views' items for a range of days, read again only when what they come from changed. */
import { useMemo } from 'react';

import { agendaIn, type Agenda } from '../agenda';
import { selectPrefs, useCalendarUiStore } from '../store/calendarUi';
import { useLibraryStore } from '../store/libraryStore';

export function useAgenda(from: string, to: string, labelId: string | null = null): Agenda {
  const events = useLibraryStore(s => s.events);
  const feeds = useLibraryStore(s => s.feeds);
  const people = useLibraryStore(s => s.people);
  const carnet = useLibraryStore(s => s.carnet);
  const blocks = useLibraryStore(s => s.blocks);
  const labels = useLibraryStore(s => s.calendarLabels);
  const prefs = useCalendarUiStore(selectPrefs);
  return useMemo(
    () => agendaIn(useLibraryStore.getState(), prefs, from, to, labelId),
    // The pieces of the state the agenda reads: a change elsewhere (a link's reading) draws nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, feeds, people, carnet, blocks, labels, prefs, from, to, labelId],
  );
}
