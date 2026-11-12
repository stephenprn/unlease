/** The suite's first run (`@shared/ui/screens/SetupScreen`) as Carnet's: its brand, its part of the Claude form, the Keep import while it holds nothing, then the board. */
import React from 'react';

import { KEEP_SOURCE } from '@unlease/notes/services/keepImport';
import { SetupScreen as SuiteSetup, type SetupImporter } from '@shared/ui/screens/SetupScreen';

import { KeepWizard } from '../features/importing/KeepWizard';
import { linkReadingExtra } from '../features/settings/LinkReading';
import type { ScreenProps } from '../navigation/types';

/** The Keep import, offered as a step of the first run (its wizard, the setup's head and foot around it). */
const KEEP_IMPORTER: SetupImporter = { source: () => KEEP_SOURCE, Wizard: KeepWizard };

export function SetupScreen({ navigation }: ScreenProps<'Setup'>) {
  return <SuiteSetup app="notes" claudeExtra={linkReadingExtra} importer={KEEP_IMPORTER} onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Board' }] })} />;
}
