/** Agenda's root: the suite's shell (`AppShell`) around its navigator, with what feeds every screen (the sync's lifecycle, the calendar files shared to the app, the reminders kept armed, where places open). */
import React, { useEffect } from 'react';

import { useAppLifecycle } from '@shared/app/hooks/useAppLifecycle';
import { openPlace } from '@shared/app/openPlace';
import { selectOnboarded, useSettingsStore } from '@shared/app/store/settingsStore';
import { AppShell } from '@shared/ui/AppShell';
import { ServicesCssSheet } from '@shared/ui/features/appearance/ServicesCssSheet';
import { MapsSheets } from '@shared/ui/features/maps/MapsSheets';
import { linking, RootNavigator } from '@ui/navigation/RootNavigator';
import { backToCalendar, navigate, navigationRef, push } from '@ui/navigation/navigationRef';
import { dismissReminder, type PressedEvent } from '@platform/notifications';

import { bootstrap } from '../bootstrap';
import { useEventAlarms } from '../hooks/useEventAlarms';
import { listenForShares } from '../intake';
import { publishWidgets } from '../widgets';
import { later } from '../later';

/**
 * A reminder pressed: its event, at that occurrence; its « Y aller »: the way there too, over the
 * event (back from the maps, the event), the reminder gone from the shade. The morning digest:
 * « Aujourd'hui » on its day.
 */
const openEvent = (event: PressedEvent): void => {
  if ('digestDay' in event) {
    backToCalendar({ view: 'today', day: event.digestDay });
    return;
  }
  navigate('Event', { id: event.eventId, at: event.occurrence || undefined });
  if (!event.directions) return;
  if (event.directions.id) later(dismissReminder(event.directions.id));
  later(openPlace(event.directions.place, { directions: true }));
};

/** Back in the foreground: the widgets learn the new day. Stable, as the lifecycle hook restarts on a new one. */
const onForeground = (): void => later(publishWidgets());

/** Above every screen: the sync follows the app in and out of the foreground (the widgets learn the new day); a shared `.ics` opens the import, and other apps' ways in their screens (`listenForShares`); reminders are kept armed. */
function Overlays(): React.ReactElement {
  useAppLifecycle(onForeground);
  const onboarded = useSettingsStore(selectOnboarded);
  useEffect(
    () =>
      onboarded
        ? listenForShares({
            import: () => navigate('Import', { source: 'shared' }),
            event: handed => push('Edit', handed),
            subscribe: url => push('Feeds', { url }),
            words: words => backToCalendar({ words }, { merge: true }),
            day: day => backToCalendar({ day, view: 'day' }),
          })
        : undefined,
    [onboarded],
  );
  useEventAlarms(openEvent);
  return (
    <>
      <ServicesCssSheet />
      <MapsSheets />
    </>
  );
}

export function AppProviders(): React.ReactElement {
  return (
    <AppShell app="calendar" bootstrap={bootstrap} linking={linking} navigationRef={navigationRef} overlays={<Overlays />} onSettings={() => navigate('Settings')}>
      <RootNavigator />
    </AppShell>
  );
}
