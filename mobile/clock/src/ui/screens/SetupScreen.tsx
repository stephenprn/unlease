/**
 * The suite's first run (`@shared/ui/screens/SetupScreen`) as Clock's: its brand (a sibling's
 * connection offered when another app of the suite is here already), the server's choices and the
 * colours, then the alarms. Clock has nothing to import.
 */
import React from 'react';

import { SetupScreen as SuiteSetup } from '@shared/ui/screens/SetupScreen';

import type { ScreenProps } from '../navigation/types';

export function SetupScreen({ navigation }: ScreenProps<'Setup'>) {
  return <SuiteSetup app="clock" onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Alarms' }] })} />;
}
