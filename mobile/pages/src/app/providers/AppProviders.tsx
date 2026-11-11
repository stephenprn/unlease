/** Pages' root: the suite's shell (`AppShell`) around its navigator, with what feeds every screen (the sync's lifecycle, the text shared to the app, the services' stylesheet hint). */
import React, { useEffect } from 'react';

import { useAppLifecycle } from '@shared/app/hooks/useAppLifecycle';
import { selectOnboarded, useSettingsStore } from '@shared/app/store/settingsStore';
import { AppShell } from '@shared/ui/AppShell';
import { ServicesCssSheet } from '@shared/ui/features/appearance/ServicesCssSheet';
import { linking, RootNavigator } from '@ui/navigation/RootNavigator';
import { navigate, navigationRef } from '@ui/navigation/navigationRef';

import { bootstrap } from '../bootstrap';
import { listenForShares } from '../intake';

/** Above every screen: the sync follows the app in and out of the foreground; text shared to the app becomes a page, opened. */
function Overlays(): React.ReactElement {
  useAppLifecycle();
  const onboarded = useSettingsStore(selectOnboarded);
  useEffect(() => (onboarded ? listenForShares(id => navigate('Page', { id })) : undefined), [onboarded]);
  return <ServicesCssSheet />;
}

export function AppProviders(): React.ReactElement {
  return (
    <AppShell app="pages" bootstrap={bootstrap} linking={linking} navigationRef={navigationRef} overlays={<Overlays />} onSettings={() => navigate('Settings')}>
      <RootNavigator />
    </AppShell>
  );
}
