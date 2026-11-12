/**
 * « Effacer des données » for Carnet (`@shared/ui/screens/EraseScreen`, from Réglages › Données): its
 * parts counted from the library as it is now (`notes/services/erase`: the notes, the collections, the
 * links of « Non classé », the labels, what Claude notes), erased as one batch (`eraseData`), then the
 * board.
 */
import React, { useMemo } from 'react';

import { eraseParts } from '@unlease/notes/services/erase';
import { eraseData } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { EraseScreen as SuiteErase } from '@shared/ui/screens/EraseScreen';

import type { ScreenProps } from '../navigation/types';

export function EraseScreen({ navigation }: ScreenProps<'Erase'>) {
  const notes = useLibraryStore(s => s.notes);
  const checks = useLibraryStore(s => s.checks);
  const links = useLibraryStore(s => s.links);
  const labels = useLibraryStore(s => s.labels);
  const attachments = useLibraryStore(s => s.attachments);
  const linkTemplates = useLibraryStore(s => s.linkTemplates);
  // Counted again whenever a record changes (a sync landing while the page is open).
  const parts = useMemo(() => eraseParts({ notes, checks, links, labels, attachments, linkTemplates }), [notes, checks, links, labels, attachments, linkTemplates]);
  return (
    <SuiteErase
      app="notes"
      parts={parts}
      run={eraseData}
      onBack={() => navigation.goBack()}
      onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Board', params: { view: 'notes' } }] })}
    />
  );
}
