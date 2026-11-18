/**
 * « Effacer des données », Clock's (`@shared/ui/screens/EraseScreen`): its parts counted from the
 * alarms, the saved timers and the world clocks as they are (`clock/services/erase`), and the batch erasing it; then the alarms.
 */
import React, { useMemo } from 'react';

import { eraseParts } from '@unlease/clock/services/erase';
import { eraseAlarms } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { EraseScreen as SuiteErase } from '@shared/ui/screens/EraseScreen';

import type { ScreenProps } from '../navigation/types';

export function EraseScreen({ navigation }: ScreenProps<'Erase'>) {
  const alarms = useLibraryStore(s => s.alarms);
  const timers = useLibraryStore(s => s.timers);
  const worldClocks = useLibraryStore(s => s.worldClocks);
  const parts = useMemo(() => eraseParts({ alarms, timers, worldClocks }), [alarms, timers, worldClocks]);
  return <SuiteErase app="clock" parts={parts} run={chosen => eraseAlarms(chosen)} onBack={() => navigation.goBack()} onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Alarms' }] })} />;
}
