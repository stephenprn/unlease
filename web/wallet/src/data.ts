/**
 * Wallet's records as its web app holds them (sealed), what this browser remembers of it (its
 * Réglages), and its files waiting to be sent (sealed too). No other app shows Wallet's records.
 */
import { ITEM_TYPE } from '@unlease/wallet/crypto/vault';

import { getRecord } from '@shared/app/store/records';
import type { AppData } from '@shared/modules';
import { useWalletStore, walletProjection } from './app/store/library';
import { loadPrefs, resetPrefs } from './app/store/prefs';
import { resetVault } from './app/store/vault';
import { paths } from './ui/routes';

export const walletData: AppData = {
  id: 'wallet',
  projection: walletProjection,
  load: loadPrefs,
  reset: () => {
    resetPrefs();
    resetVault();
  },
  // A file sealed here, kept until the server has it: its item names its id in the clear (`files`), never what it is.
  fileOwner: id => {
    const owner = Object.values(useWalletStore.getState().records).find(record => Array.isArray(record.fields.files) && record.fields.files.includes(id));
    if (!owner) return null;
    const live = getRecord(ITEM_TYPE, owner.id)?.fields.deletedAt === null;
    return { done: !live, mime: 'application/octet-stream', image: false, mark: () => {} };
  },
  refPaths: { walletItem: paths.item },
};
