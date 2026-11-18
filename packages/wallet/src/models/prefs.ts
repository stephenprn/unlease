/**
 * The device's own Wallet settings, never synced: how soon the papers lock again, whether the phone's
 * fingerprint opens them, and how a card shows at a till.
 */

/** Seconds in the background (or idle, on the web) before the papers lock again: 0 at once. */
export const LOCK_AFTER_CHOICES = [0, 60, 300] as const;
export type LockAfter = (typeof LOCK_AFTER_CHOICES)[number];

export interface WalletPrefs {
  readonly lockAfter: LockAfter;
  /** The screen at full brightness while a card's barcode shows. */
  readonly brighten: boolean;
  /** The barcode at the top of the screen, where a till's scanner reaches it. */
  readonly barcodeTop: boolean;
}

export const DEFAULT_WALLET_PREFS: WalletPrefs = { lockAfter: 0, brighten: true, barcodeTop: false };

export function readWalletPrefs(value: unknown): WalletPrefs {
  if (typeof value !== 'object' || value === null) return DEFAULT_WALLET_PREFS;
  const raw = value as Record<string, unknown>;
  return {
    lockAfter: (LOCK_AFTER_CHOICES as readonly unknown[]).includes(raw.lockAfter) ? (raw.lockAfter as LockAfter) : DEFAULT_WALLET_PREFS.lockAfter,
    brighten: typeof raw.brighten === 'boolean' ? raw.brighten : DEFAULT_WALLET_PREFS.brighten,
    barcodeTop: typeof raw.barcodeTop === 'boolean' ? raw.barcodeTop : DEFAULT_WALLET_PREFS.barcodeTop,
  };
}
