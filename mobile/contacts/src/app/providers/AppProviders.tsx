/** Contacts' root: the suite's shell (`AppShell`) around its navigator, with what feeds every screen (the sync's lifecycle, the cards shared to the app, the services' stylesheet hint, where places open). */
import React, { useEffect } from 'react';

import { useAppLifecycle } from '@shared/app/hooks/useAppLifecycle';
import { useBirthdayAlerts } from '@app/hooks/useBirthdayAlerts';
import { selectOnboarded, useSettingsStore } from '@shared/app/store/settingsStore';
import { AppShell } from '@shared/ui/AppShell';
import { ServicesCssSheet } from '@shared/ui/features/appearance/ServicesCssSheet';
import { MapsSheets } from '@shared/ui/features/maps/MapsSheets';
import { linking, RootNavigator } from '@ui/navigation/RootNavigator';
import { navigate, navigationRef } from '@ui/navigation/navigationRef';

import { bootstrap } from '../bootstrap';
import { listenForShares } from '../intake';

/** A birthday notification pressed: its contact (asking how to wish it, from its « Message » on the day). */
const openContact = (id: string, wish?: boolean): void => navigate('Contact', wish ? { id, wish: true } : { id });

/** Above every screen: the sync follows the app in and out of the foreground; a shared card opens the import; birthdays are kept armed. */
function Overlays(): React.ReactElement {
  useAppLifecycle();
  const onboarded = useSettingsStore(selectOnboarded);
  useEffect(() => (onboarded ? listenForShares(() => navigate('Import', { source: 'shared' })) : undefined), [onboarded]);
  useBirthdayAlerts(openContact);
  return (
    <>
      <ServicesCssSheet />
      <MapsSheets />
    </>
  );
}

export function AppProviders(): React.ReactElement {
  return (
    <AppShell app="contacts" bootstrap={bootstrap} linking={linking} navigationRef={navigationRef} overlays={<Overlays />} onSettings={() => navigate('Settings')}>
      <RootNavigator />
    </AppShell>
  );
}
