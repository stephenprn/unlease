/** Carnet's root: the suite's shell (`AppShell`) around its navigator, with its capture sheet and transfer panel above every screen. */
import React from 'react';

import { AppShell } from '@shared/ui/AppShell';
import { linking, RootNavigator } from '@ui/navigation/RootNavigator';
import { navigate, navigationRef } from '@ui/navigation/navigationRef';
import { Overlays } from '@ui/features/capture/Overlays';

import { bootstrap } from '../bootstrap';

export function AppProviders(): React.ReactElement {
  return (
    <AppShell app="notes" bootstrap={bootstrap} linking={linking} navigationRef={navigationRef} overlays={<Overlays />} onSettings={() => navigate('Settings')}>
      <RootNavigator />
    </AppShell>
  );
}
