/** The suite's first run (`@shared/ui/screens/SetupScreen`) as Pages': its brand (a sibling's connection offered when Carnet is here already), then the pages' home. */
import React from 'react';

import { SetupScreen as SuiteSetup } from '@shared/ui/screens/SetupScreen';

import type { ScreenProps } from '../navigation/types';
import { SECTIONS } from './AdminScreen';

export function SetupScreen({ navigation }: ScreenProps<'Setup'>) {
  return <SuiteSetup app="pages" appSections={SECTIONS} onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Pages' }] })} />;
}
