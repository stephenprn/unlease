/**
 * The suite's first run (`@shared/ui/screens/SetupScreen`) as Agenda's: its brand (a sibling's
 * connection offered when another app of the suite is here already), the import of Google Agenda's
 * export while the agenda holds nothing (skipped, it waits in Réglages), then the calendar.
 */
import React from 'react';

import { t } from '@unlease/core/i18n';
import { SetupScreen as SuiteSetup } from '@shared/ui/screens/SetupScreen';

import { CalendarImport } from '../features/importing/CalendarImport';
import type { ScreenProps } from '../navigation/types';
import { SECTIONS } from './AdminScreen';

const IMPORTER = { source: () => t('Google Agenda'), Wizard: CalendarImport };

export function SetupScreen({ navigation }: ScreenProps<'Setup'>) {
  return <SuiteSetup app="calendar" appSections={SECTIONS} importer={IMPORTER} onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Calendar' }] })} />;
}
