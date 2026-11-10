/** Pages' root: the suite's shell (`AppShell`) around its navigator, with what feeds every screen (the sync's lifecycle, the services' stylesheet hint). */
import React from 'react';

import { useAppLifecycle } from '@shared/app/hooks/useAppLifecycle';
import { AppShell } from '@shared/ui/AppShell';
import { ServicesCssSheet } from '@shared/ui/features/appearance/ServicesCssSheet';
import { linking, RootNavigator } from '@ui/navigation/RootNavigator';
import { navigate, navigationRef } from '@ui/navigation/navigationRef';

import { bootstrap } from '../bootstrap';

/** Above every screen: the sync follows the app in and out of the foreground. */
function Overlays(): React.ReactElement {
  useAppLifecycle();
  return <ServicesCssSheet />;
}

export function AppProviders(): React.ReactElement {
  return (
    <AppShell app="pages" bootstrap={bootstrap} linking={linking} navigationRef={navigationRef} overlays={<Overlays />} onSettings={() => navigate('Settings')}>
      <RootNavigator />
    </AppShell>
  );
}
