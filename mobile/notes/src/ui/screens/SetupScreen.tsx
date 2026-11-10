/** The suite's first run (`@shared/ui/screens/SetupScreen`) as Carnet's: its brand, its part of the Claude form, then the board. */
import React from 'react';

import { SetupScreen as SuiteSetup } from '@shared/ui/screens/SetupScreen';

import { linkReadingExtra } from '../features/settings/LinkReading';
import type { ScreenProps } from '../navigation/types';

export function SetupScreen({ navigation }: ScreenProps<'Setup'>) {
  return <SuiteSetup app="notes" claudeExtra={linkReadingExtra} onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Board' }] })} />;
}
