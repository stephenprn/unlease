/**
 * What this browser keeps of Wallet's own (Réglages, never synced: `WalletPrefs`), in localStorage:
 * how soon the papers lock again, and how a card shows at a till.
 */
import { create } from 'zustand';

import { DEFAULT_WALLET_PREFS, readWalletPrefs, type WalletPrefs } from '@unlease/wallet/models/prefs';

import { getStorageName } from '@shared/app/env';

export const usePrefsStore = create<WalletPrefs>(() => DEFAULT_WALLET_PREFS);

const storageKey = (): string => `${getStorageName()}.wallet`;

export function loadPrefs(): void {
  let stored: unknown;
  try {
    stored = JSON.parse(localStorage.getItem(storageKey()) ?? 'null');
  } catch {
    stored = null;
  }
  usePrefsStore.setState(readWalletPrefs(stored), true);
}

export function setPrefs(patch: Partial<WalletPrefs>): void {
  usePrefsStore.setState(patch);
  try {
    localStorage.setItem(storageKey(), JSON.stringify(usePrefsStore.getState()));
  } catch {
    // A private window: kept for this visit.
  }
}

export function resetPrefs(): void {
  usePrefsStore.setState(DEFAULT_WALLET_PREFS, true);
}
