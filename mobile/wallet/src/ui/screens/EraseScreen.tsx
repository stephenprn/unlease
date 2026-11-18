/** « Effacer des données » for Wallet (the suite's `EraseScreen`): the cards, the identity papers, the documents, and the papers this phone cannot open. */
import React, { useMemo } from 'react';

import { eraseParts } from '@unlease/wallet/services/erase';
import { eraseWallet } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { EraseScreen as SuiteErase } from '@shared/ui/screens/EraseScreen';

import type { ScreenProps } from '../navigation/types';

export function EraseScreen({ navigation }: ScreenProps<'Erase'>) {
  const items = useLibraryStore(s => s.items);
  const parts = useMemo(() => eraseParts(Object.values(items)), [items]);
  return <SuiteErase app="wallet" parts={parts} run={chosen => eraseWallet(chosen)} onBack={() => navigation.goBack()} onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })} />;
}
