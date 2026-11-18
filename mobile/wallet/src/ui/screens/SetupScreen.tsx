/** The suite's first run (`@shared/ui/screens/SetupScreen`) as Wallet's: its brand (a sibling's connection offered when another app is here already), then the home, where the vault is made. */
import React from 'react';

import { SetupScreen as SuiteSetup } from '@shared/ui/screens/SetupScreen';

import type { ScreenProps } from '../navigation/types';

export function SetupScreen({ navigation }: ScreenProps<'Setup'>) {
  return <SuiteSetup app="wallet" appSections={[]} onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })} />;
}
