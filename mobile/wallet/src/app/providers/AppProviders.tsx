/** Wallet's root: the suite's shell (`AppShell`) around its navigator, the sync following the app in and out of the foreground. */
import React from 'react';

import { useAppLifecycle } from '@shared/app/hooks/useAppLifecycle';
import { AppShell } from '@shared/ui/AppShell';
import { linking, RootNavigator } from '@ui/navigation/RootNavigator';
import { navigate, navigationRef } from '@ui/navigation/navigationRef';
import { FingerprintOffer } from '@ui/features/vault/FingerprintOffer';

import { bootstrap } from '../bootstrap';

function Overlays(): React.ReactElement {
  useAppLifecycle();
  return <FingerprintOffer />;
}

export function AppProviders(): React.ReactElement {
  return (
    <AppShell app="wallet" bootstrap={bootstrap} linking={linking} navigationRef={navigationRef} overlays={<Overlays />} onSettings={() => navigate('Settings')}>
      <RootNavigator />
    </AppShell>
  );
}
