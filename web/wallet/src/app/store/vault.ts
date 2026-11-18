/**
 * The vault in this browser: whether one exists, which tiers are open, and the keys, in memory only.
 *
 * - Made once per server (`POST /api/wallet/vault`, the first device's kept): a browser that finds
 *   one already there is asked its passphrase instead.
 * - Opened by the passphrase (or the recovery code) for this visit: both tiers open together.
 * - Locked again when the tab has been hidden for the time Réglages says (`lockAfter`: at once by
 *   default), after five minutes without a key or a click, and on « Verrouiller »: the keys are
 *   wiped, every opened item dropped, every picture opened revoked (`../files`).
 * - « Garder les cartes ouvertes dans ce navigateur »: the cards' key sealed by a browser key that
 *   cannot leave this browser (WebCrypto, not extractable, kept in IndexedDB), so cards open at the
 *   next visit without the passphrase; papers never.
 */
import { create } from 'zustand';

import { wipe } from '@unlease/wallet/crypto/cipher';
import { createVault, newRecovery, openWithPassphrase, openWithRecovery, passphraseField, VAULT_ID, VAULT_TYPE, type OpenVault, type VaultFields } from '@unlease/wallet/crypto/vault';
import { parseVaultCreate, WALLET_VAULT_PATH, type VaultCreateResponse } from '@unlease/wallet/sync/routes';

import { getStorageName } from '@shared/app/env';
import { writeLocal } from '@shared/app/store/records';
import { useSettingsStore } from '@shared/app/store/settings';
import { requestSync } from '@shared/app/sync/loop';
import { postJson } from '@shared/app/sync/transport';
import { browserCipher } from '../cipher';
import { forgetOpenedFiles } from '../files';
import { setKeys, useWalletStore } from './library';
import { usePrefsStore } from './prefs';

export type VaultStatus = 'none' | 'locked' | 'cards' | 'open';

interface VaultState {
  /** Both tiers open: the master key too (to change the passphrase, make a new kit). */
  readonly open: OpenVault | null;
  /** Only the cards' key (remembered in this browser). */
  readonly cards: Uint8Array | null;
  /** A vault just made here: its recovery code, shown until the person says it is kept (never stored). */
  readonly pendingKit: string | null;
}

export const useVaultStore = create<VaultState>(() => ({ open: null, cards: null, pendingKit: null }));

/** The recovery kit kept: forgotten here. */
export const kitKept = (): void => useVaultStore.setState({ pendingKit: null });

/** Where the vault stands here: none made, locked, cards only, or open. */
export function vaultStatus(vault: VaultFields | null, state: VaultState): VaultStatus {
  if (!vault) return 'none';
  if (state.open) return 'open';
  return state.cards ? 'cards' : 'locked';
}

export const useVaultStatus = (): VaultStatus => {
  const vault = useWalletStore(s => s.vault);
  return useVaultStore(s => vaultStatus(vault, s));
};

function follow(state: Omit<VaultState, 'pendingKit'>): void {
  useVaultStore.setState(state);
  setKeys({ cards: state.open?.cards ?? state.cards, papers: state.open?.papers ?? null });
}

function opened(keys: OpenVault): void {
  follow({ open: keys, cards: null });
  armIdle();
  if (rememberedHere()) void rememberCards(keys.cards);
}

/** Locks the papers (and the cards, unless this browser keeps them): the keys wiped, the opened pictures revoked. */
export function lockVault(): void {
  const state = useVaultStore.getState();
  const remembered = state.open && rememberedHere() ? state.open.cards.slice() : state.cards;
  if (state.open) wipe(state.open.master, state.open.papers, remembered === state.open.cards ? null : state.open.cards);
  forgetOpenedFiles();
  follow({ open: null, cards: remembered });
}

/** What a first device sends: a new vault, kept by the server unless another device's came first. */
export async function makeVault(passphrase: string, now = Date.now()): Promise<{ readonly recoveryCode: string } | 'taken'> {
  const made = await createVault(browserCipher, passphrase, now);
  const server = useSettingsStore.getState().server;
  if (!server) {
    // A browser that keeps everything to itself: its vault is its own record.
    writeLocal([{ type: VAULT_TYPE, id: VAULT_ID, patch: { ...made.fields } }], now);
    useVaultStore.setState({ pendingKit: made.recoveryCode });
    opened(made.keys);
    return { recoveryCode: made.recoveryCode };
  }
  const answer = await postJson<VaultCreateResponse>(server, WALLET_VAULT_PATH, { fields: made.fields }, value => {
    const parsed = parseVaultCreate(value);
    return parsed && typeof (value as { created?: unknown }).created === 'boolean' ? { created: (value as { created: boolean }).created, fields: parsed.fields } : null;
  });
  // The server's record arrives by the sync; this browser needs it now.
  useWalletStore.setState(state => ({ ...state, vault: answer.fields }));
  requestSync();
  if (!answer.created) {
    wipe(made.keys.master, made.keys.cards, made.keys.papers);
    return 'taken';
  }
  useVaultStore.setState({ pendingKit: made.recoveryCode });
  opened(made.keys);
  return { recoveryCode: made.recoveryCode };
}

/** Opens both tiers by the passphrase; false when it is not this vault's. */
export async function unlockWithPassphrase(passphrase: string): Promise<boolean> {
  const vault = useWalletStore.getState().vault;
  if (!vault) return false;
  const keys = await openWithPassphrase(browserCipher, vault, passphrase);
  if (!keys) return false;
  opened(keys);
  return true;
}

/** Opens both tiers by the recovery code; false when it is not this vault's. A new passphrase is chosen next. */
export async function unlockWithRecovery(code: string): Promise<boolean> {
  const vault = useWalletStore.getState().vault;
  if (!vault) return false;
  const keys = await openWithRecovery(browserCipher, vault, code);
  if (!keys) return false;
  opened(keys);
  return true;
}

/** A new passphrase, written to the vault for every device: the old one opens nothing once it syncs. */
export async function changePassphrase(passphrase: string): Promise<void> {
  const open = useVaultStore.getState().open;
  if (!open) throw new Error('vault locked');
  writeLocal([{ type: VAULT_TYPE, id: VAULT_ID, patch: { passphrase: await passphraseField(browserCipher, open.master, passphrase) } }]);
}

/** A new recovery kit: the old code opens nothing once it syncs. Returns the code, shown once. */
export async function renewRecovery(): Promise<string> {
  const open = useVaultStore.getState().open;
  if (!open) throw new Error('vault locked');
  const { field, code } = await newRecovery(browserCipher, open.master);
  writeLocal([{ type: VAULT_TYPE, id: VAULT_ID, patch: { recovery: field } }]);
  return code;
}

// ── locking again ──────────────────────────────────────────────────────────

/** Five minutes without a key, a click or a touch. */
const IDLE_MS = 5 * 60_000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

function armIdle(): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (!useVaultStore.getState().open) return;
  idleTimer = setTimeout(lockVault, IDLE_MS);
}

function onVisibility(): void {
  if (hiddenTimer) clearTimeout(hiddenTimer);
  hiddenTimer = null;
  if (document.visibilityState !== 'hidden' || !useVaultStore.getState().open) return;
  const after = usePrefsStore.getState().lockAfter;
  if (after === 0) lockVault();
  else hiddenTimer = setTimeout(lockVault, after * 1000);
}

let following = false;

/** Once, at start: the vault locks itself as Réglages says. */
export function followLocking(): void {
  if (following) return;
  following = true;
  document.addEventListener('visibilitychange', onVisibility);
  for (const kind of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.addEventListener(kind, armIdle, { passive: true, capture: true });
  // Leaving the page: nothing of the keys outlives it (memory only), and the pictures are revoked.
  window.addEventListener('pagehide', () => lockVault());
  void loadRememberedCards();
}

// ── cards kept open in this browser ────────────────────────────────────────

const REMEMBER_DB = (): string => `${getStorageName()}.wallet-keys`;
const rememberFlag = (): string => `${getStorageName()}.wallet.rememberCards`;

export function rememberedHere(): boolean {
  try {
    return localStorage.getItem(rememberFlag()) !== null;
  } catch {
    return false;
  }
}

function keyStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return new Promise(resolve => {
    const request = indexedDB.open(REMEMBER_DB(), 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('keys', mode);
      const asked = run(tx.objectStore('keys'));
      asked.onsuccess = () => resolve(asked.result ?? null);
      asked.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    };
  });
}

async function rememberCards(cards: Uint8Array): Promise<void> {
  const wrapper = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapper, cards.slice()));
  await keyStore('readwrite', store => store.put({ wrapper, iv, sealed }, 'cards'));
  try {
    localStorage.setItem(rememberFlag(), '1');
  } catch {
    // Kept for this visit.
  }
}

async function loadRememberedCards(): Promise<void> {
  if (!rememberedHere() || useVaultStore.getState().open) return;
  const kept = await keyStore<{ wrapper: CryptoKey; iv: Uint8Array<ArrayBuffer>; sealed: Uint8Array<ArrayBuffer> }>('readonly', store => store.get('cards'));
  if (!kept) return;
  try {
    const cards = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: kept.iv }, kept.wrapper, kept.sealed));
    if (!useVaultStore.getState().open) follow({ open: null, cards });
  } catch {
    await forgetRememberedCards();
  }
}

/** Cards kept open here, or not: switching it off forgets the browser's key at once. */
export async function setRememberCards(on: boolean): Promise<void> {
  const state = useVaultStore.getState();
  if (on) {
    const cards = state.open?.cards ?? state.cards;
    if (cards) await rememberCards(cards);
    return;
  }
  await forgetRememberedCards();
  if (!state.open && state.cards) {
    wipe(state.cards);
    follow({ open: null, cards: null });
  }
}

async function forgetRememberedCards(): Promise<void> {
  await keyStore('readwrite', store => store.delete('cards'));
  try {
    localStorage.removeItem(rememberFlag());
  } catch {
    // Nothing kept.
  }
}

/** Test seam: back to nothing. */
export function resetVault(): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (hiddenTimer) clearTimeout(hiddenTimer);
  useVaultStore.setState({ open: null, cards: null, pendingKit: null }, true);
  setKeys({ cards: null, papers: null });
}
