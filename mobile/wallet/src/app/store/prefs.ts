/** Wallet's settings on this phone, never synced (`WalletPrefs`): when papers lock again, how a card shows at a till. */
import { create } from 'zustand';

import { DEFAULT_WALLET_PREFS, readWalletPrefs, type WalletPrefs } from '@unlease/wallet/models/prefs';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';

const KEY = 'wallet.prefs';

export const usePrefsStore = create<WalletPrefs>(() => DEFAULT_WALLET_PREFS);

export function loadPrefs(): void {
  usePrefsStore.setState(readWalletPrefs(readPreferences()[KEY]), true);
}

export function setPrefs(patch: Partial<WalletPrefs>): void {
  const prefs = readWalletPrefs({ ...usePrefsStore.getState(), ...patch });
  writePreference(KEY, prefs);
  usePrefsStore.setState(prefs, true);
}
