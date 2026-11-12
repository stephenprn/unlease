/**
 * « Effacer des données » for Pages (the suite's `EraseScreen`): its parts counted from the blocks as
 * they are now (`@unlease/pages/services/erase`: the pages, the journal), the chosen ones erased as
 * one batch.
 */
import React, { useMemo } from 'react';

import { pagesEraseParts } from '@unlease/pages/services/erase';
import { erasePages } from '@app/store/pages';
import { useLibraryStore } from '@app/store/libraryStore';
import { EraseScreen as SuiteErase } from '@shared/ui/screens/EraseScreen';

import type { ScreenProps } from '../navigation/types';

export function EraseScreen({ navigation }: ScreenProps<'Erase'>) {
  const blocks = useLibraryStore(s => s.blocks);
  const parts = useMemo(() => pagesEraseParts({ blocks }), [blocks]);
  return <SuiteErase app="pages" parts={parts} run={chosen => erasePages(chosen)} onBack={() => navigation.goBack()} onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Pages' }] })} />;
}
