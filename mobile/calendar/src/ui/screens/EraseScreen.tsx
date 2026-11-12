/**
 * « Effacer des données » for Agenda (the suite's `EraseScreen`): its parts counted from the records
 * as they are now (`@unlease/calendar/services/erase`: one's own events, the imported ones, the
 * subscriptions, the labels), the chosen ones erased as one batch.
 */
import React, { useMemo } from 'react';

import { calendarEraseParts } from '@unlease/calendar/services/erase';
import { eraseCalendar } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { EraseScreen as SuiteErase } from '@shared/ui/screens/EraseScreen';

import type { ScreenProps } from '../navigation/types';

export function EraseScreen({ navigation }: ScreenProps<'Erase'>) {
  const events = useLibraryStore(s => s.events);
  const labels = useLibraryStore(s => s.calendarLabels);
  const feeds = useLibraryStore(s => s.feeds);
  const parts = useMemo(() => calendarEraseParts({ events, labels, feeds }), [events, labels, feeds]);
  return <SuiteErase app="calendar" parts={parts} run={chosen => eraseCalendar(chosen)} onBack={() => navigation.goBack()} onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Calendar' }] })} />;
}
