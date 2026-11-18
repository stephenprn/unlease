/**
 * Wallet's web app: everything it brings to the shell (`shared/modules`). The cards at the till, the
 * identity papers and the documents, sealed on the device (`@unlease/wallet/crypto`), opened by the
 * vault's passphrase for a visit; an item and its form over its place; « Coffre » and « À la caisse »
 * in Réglages; « Effacer des données ». No spotlight kind: nothing opened is ever indexed.
 */
import { tx } from '@unlease/core/i18n';
import { WALLET_SETTINGS_PLACES } from '@unlease/wallet/services/settingsPlaces';
import { eraseParts } from '@unlease/wallet/services/erase';

import type { AppModule } from '@shared/modules';
import { eraseWallet } from './app/store/actions';
import { useWalletStore } from './app/store/library';
import { followLocking, lockVault } from './app/store/vault';
import { walletData } from './data';
import { openNew } from './ui/features/open';
import { WALLET_SETTINGS } from './ui/features/settings/WalletSettings';
import { HOME, parseWalletRoute, WALLET_ROUTES } from './ui/routes';
import { isWalletPlace, WalletBottomBar, WalletHeaderActions, WalletNav, WalletOverlays, walletPageUnder, walletPathOf, WalletScreen, walletStillThere, useWalletTitle } from './ui/WalletShell';

export const walletModule: AppModule = {
  id: 'wallet',
  home: HOME,
  data: walletData,
  start: followLocking,

  routes: { names: WALLET_ROUTES, parse: parseWalletRoute },
  Screen: WalletScreen,
  pageUnder: walletPageUnder,
  pathOf: walletPathOf,
  isHome: isWalletPlace,
  backTo: () => HOME,
  useTitle: (page, overlay) => useWalletTitle(page, overlay),
  stillThere: walletStillThere,
  Overlays: WalletOverlays,

  Nav: WalletNav,
  HeaderActions: WalletHeaderActions,
  BottomBar: WalletBottomBar,
  searchHome: HOME,

  commands: [
    { title: tx('Add a card'), icon: 'card', key: 'c', run: () => openNew('card') },
    { title: tx('Add a paper'), icon: 'idCard', run: () => openNew('idCard') },
    { title: tx('Add a document'), icon: 'file', run: () => openNew('document') },
    { title: tx('Lock now'), icon: 'lock', key: 'l', run: lockVault },
  ],

  settingsSections: WALLET_SETTINGS,
  erase: {
    parts: () => eraseParts(Object.values(useWalletStore.getState().items)),
    run: chosen => eraseWallet(chosen),
  },
  settingsPlaces: WALLET_SETTINGS_PLACES,
};
