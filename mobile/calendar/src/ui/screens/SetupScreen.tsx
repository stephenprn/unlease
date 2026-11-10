/** The suite's first run (`@shared/ui/screens/SetupScreen`) as Agenda's: its brand (a sibling's connection offered when another app of the suite is here already), then the calendar. */
import React from 'react';

import { SetupScreen as SuiteSetup } from '@shared/ui/screens/SetupScreen';

import type { ScreenProps } from '../navigation/types';
import { SECTIONS } from './AdminScreen';

export function SetupScreen({ navigation }: ScreenProps<'Setup'>) {
  return <SuiteSetup app="calendar" appSections={SECTIONS} onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Calendar' }] })} />;
}
