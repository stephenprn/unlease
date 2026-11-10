/** The suite's first run (`@shared/ui/screens/SetupScreen`) as Contacts': its brand (a sibling's connection offered when another app of the suite is here already), then the list. */
import React from 'react';

import { SetupScreen as SuiteSetup } from '@shared/ui/screens/SetupScreen';

import type { ScreenProps } from '../navigation/types';

export function SetupScreen({ navigation }: ScreenProps<'Setup'>) {
  return <SuiteSetup app="contacts" onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Contacts' }] })} />;
}
