/** The suite's first run (`@shared/ui/screens/SetupScreen`) as Pages': its brand (a sibling's connection offered when Carnet is here already), its import while it holds no page, then the pages' home. */
import React from 'react';

import { SetupScreen as SuiteSetup } from '@shared/ui/screens/SetupScreen';

import type { ScreenProps } from '../navigation/types';
import { SECTIONS } from './AdminScreen';
import { PagesImport } from '../features/importing/PagesImport';

const IMPORTER = { source: () => 'Notion', Wizard: PagesImport };

export function SetupScreen({ navigation }: ScreenProps<'Setup'>) {
  return <SuiteSetup app="pages" appSections={SECTIONS} importer={IMPORTER} onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Pages' }] })} />;
}
