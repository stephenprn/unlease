/**
 * The vault on this phone: whether one exists, which tiers are open, and the keys, in memory.
 *
 * - The cards' key is kept by the Keystore once the vault was opened here: cards open at start,
 *   without asking (the till is no place for a prompt).
 * - The papers' key opens by the fingerprint (or the screen lock) once it was offered and accepted,
 *   else by the passphrase; it locks again when the app leaves the screen (after Réglages' delay), and
 *   while it is open the window refuses screenshots and the recents thumbnail.
 * - The passphrase opens both tiers (Argon2id, natively); the recovery code too, then asks a new one.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

import { t } from '@unlease/core/i18n';
import { fromBase64Url, toBase64Url } from '@unlease/wallet/crypto/bytes';
import { wipe } from '@unlease/wallet/crypto/cipher';
import { createVault, newRecovery, openWithPassphrase, openWithRecovery, passphraseField, VAULT_ID, VAULT_TYPE, type OpenVault } from '@unlease/wallet/crypto/vault';
import { parseVaultCreate, WALLET_VAULT_PATH, type VaultCreateResponse } from '@unlease/wallet/sync/routes';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { askServer } from '@shared/app/sync/transport';
import { requestSync } from '@shared/app/sync/syncManager';
import { biometrics, vaultNative } from '@platform/vault';

import { phoneCipher } from '../cipher';
import { getRecord, useLibraryStore, writeLocal } from './libraryStore';
import { usePrefsStore } from './prefs';
import { itemsWith } from './walletProjection';

export type VaultStatus = 'none' | 'locked' | 'cards' | 'open';

interface VaultState {
  readonly master: Uint8Array | null;
  readonly cards: Uint8Array | null;
  readonly papers: Uint8Array | null;
  /** The papers' key is kept behind the fingerprint on this phone. */
  readonly fingerprint: boolean;
  /** A vault just made here: its recovery code, shown until the person says it is kept (never stored). */
  readonly pendingKit: string | null;
  /** Opened by the passphrase on a phone that could keep the papers behind the fingerprint: it is offered once. */
  readonly offerFingerprint: boolean;
}

export const useVaultStore = create<VaultState>(() => ({ master: null, cards: null, papers: null, fingerprint: false, pendingKit: null, offerFingerprint: false }));

/** The recovery kit kept: it is forgotten here, and the fingerprint offered. */
export function kitKept(): void {
  useVaultStore.setState({ pendingKit: null });
}

export function vaultStatusOf(hasVault: boolean, state: VaultState): VaultStatus {
  if (!hasVault) return 'none';
  if (state.papers) return 'open';
  return state.cards ? 'cards' : 'locked';
}

export const useVaultStatus = (): VaultStatus => {
  const hasVault = useLibraryStore(s => s.vault !== null);
  return useVaultStore(s => vaultStatusOf(hasVault, s));
};

function follow(next: Partial<VaultState>): void {
  useVaultStore.setState(next);
  const { cards, papers } = useVaultStore.getState();
  useLibraryStore.setState(state => ({ ...state, items: itemsWith({ cards, papers }, state.itemRecords), revision: state.revision + 1 }));
  vaultNative.setSecure(papers !== null);
}

const PROMPT = (): { title: string; subtitle: string } => ({ title: t('Open your papers'), subtitle: t('Your fingerprint or your screen lock') });

/** At start: the cards open from the Keystore, without asking. */
export async function openCardsAtStart(): Promise<void> {
  useVaultStore.setState({ fingerprint: vaultNative.hasTierKey('papers') });
  if (!vaultNative.hasTierKey('cards')) return;
  const key = fromBase64Url(await vaultNative.loadTierKey('cards', '', ''));
  if (key && key.length === 32) follow({ cards: key });
}

async function opened(keys: OpenVault): Promise<void> {
  follow({ master: keys.master, cards: keys.cards, papers: keys.papers });
  // The cards' key kept here, so they open next time without asking.
  await vaultNative.storeTierKey('cards', toBase64Url(keys.cards), '', '').catch(() => false);
}

/** Whether this phone can keep the papers' key behind the fingerprint, and has not yet. */
export const fingerprintOffered = (): boolean => !useVaultStore.getState().fingerprint && biometrics() === 'ready' && useVaultStore.getState().papers !== null;

/** Keeps the papers' key behind the fingerprint (asked once now). */
export async function enableFingerprint(): Promise<boolean> {
  const papers = useVaultStore.getState().papers;
  if (!papers) return false;
  const p = PROMPT();
  const kept = await vaultNative.storeTierKey('papers', toBase64Url(papers), t('Unlock with your fingerprint'), p.subtitle);
  useVaultStore.setState({ fingerprint: kept });
  return kept;
}

export const dismissFingerprintOffer = (): void => useVaultStore.setState({ offerFingerprint: false });

export function disableFingerprint(): void {
  vaultNative.forgetTierKey('papers');
  useVaultStore.setState({ fingerprint: false });
}

export type FingerprintOutcome = 'opened' | 'cancelled' | 'invalidated' | 'none';

/** The papers opened by the fingerprint. */
export async function unlockWithFingerprint(): Promise<FingerprintOutcome> {
  if (!vaultNative.hasTierKey('papers')) return 'none';
  const p = PROMPT();
  const answer = await vaultNative.loadTierKey('papers', p.title, p.subtitle);
  if (answer === 'invalidated') {
    useVaultStore.setState({ fingerprint: false });
    return 'invalidated';
  }
  const key = fromBase64Url(answer);
  if (!key || key.length !== 32) return 'cancelled';
  follow({ papers: key });
  return 'opened';
}

export async function unlockWithPassphrase(passphrase: string): Promise<boolean> {
  const vault = useLibraryStore.getState().vault;
  if (!vault) return false;
  const keys = await openWithPassphrase(phoneCipher, vault, passphrase);
  if (!keys) return false;
  await opened(keys);
  if (fingerprintOffered()) useVaultStore.setState({ offerFingerprint: true });
  return true;
}

export async function unlockWithRecovery(code: string): Promise<boolean> {
  const vault = useLibraryStore.getState().vault;
  if (!vault) return false;
  const keys = await openWithRecovery(phoneCipher, vault, code);
  if (!keys) return false;
  await opened(keys);
  return true;
}

/** The papers locked again: their key and the master wiped, every opened file deleted. The cards stay. */
/** The papers locked: their keys wiped and, unless a viewer is reading one of them still (`handOff`), the files opened for viewing. */
export function lockPapers(keepOpened = false): void {
  const { master, papers } = useVaultStore.getState();
  if (!papers && !master) return;
  wipe(master, papers);
  if (!keepOpened) vaultNative.wipeOpened();
  follow({ master: null, papers: null });
}

/** A new vault for this server (the first device's kept). */
export async function makeVault(passphrase: string, now = Date.now()): Promise<{ readonly recoveryCode: string } | 'taken'> {
  const made = await createVault(phoneCipher, passphrase, now);
  const server = useSettingsStore.getState().server;
  if (!server) {
    writeLocal([{ type: VAULT_TYPE, id: VAULT_ID, patch: { ...made.fields } }], now);
    useVaultStore.setState({ pendingKit: made.recoveryCode });
    await opened(made.keys);
    return { recoveryCode: made.recoveryCode };
  }
  const answer = await askServer<VaultCreateResponse>(server, WALLET_VAULT_PATH, { fields: made.fields }, value => {
    const parsed = parseVaultCreate(value);
    return parsed && typeof (value as { created?: unknown }).created === 'boolean' ? { created: (value as { created: boolean }).created, fields: parsed.fields } : null;
  });
  // The server's record arrives by the sync; this phone needs it now.
  useLibraryStore.setState(state => ({ ...state, vault: answer.fields }));
  requestSync();
  if (!answer.created) {
    wipe(made.keys.master, made.keys.cards, made.keys.papers);
    return 'taken';
  }
  useVaultStore.setState({ pendingKit: made.recoveryCode });
  await opened(made.keys);
  return { recoveryCode: made.recoveryCode };
}

export async function changePassphrase(passphrase: string): Promise<void> {
  const master = useVaultStore.getState().master;
  if (!master) throw new Error('vault locked');
  writeLocal([{ type: VAULT_TYPE, id: VAULT_ID, patch: { passphrase: await passphraseField(phoneCipher, master, passphrase) } }]);
}

export async function renewRecovery(): Promise<string> {
  const master = useVaultStore.getState().master;
  if (!master) throw new Error('vault locked');
  const { field, code } = await newRecovery(phoneCipher, master);
  writeLocal([{ type: VAULT_TYPE, id: VAULT_ID, patch: { recovery: field } }]);
  return code;
}

/** The vault was made elsewhere, or by the sync: whether this phone has it. */
export const hasVault = (): boolean => getRecord(VAULT_TYPE, VAULT_ID) !== undefined || useLibraryStore.getState().vault !== null;

// ── locking again as the app leaves the screen ─────────────────────────────

let leftAt: number | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
// A file handed to the phone's viewer (a PDF): the app leaving for it still locks the papers, but the
// file the viewer reads stays until the app is back in front.
let handedOff = false;

/** A file is being handed to the viewer (`on`), or the hand-off failed (no viewer). */
export function handOff(on = true): void {
  handedOff = on;
}

function onAppState(state: AppStateStatus): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (state === 'active') {
    // Back in front after the delay (the timer may not have run in the background).
    const after = usePrefsStore.getState().lockAfter * 1000;
    if (leftAt !== null && Date.now() - leftAt >= after) lockPapers();
    // Back from the viewer: what it read goes, if the papers locked meanwhile.
    if (handedOff && !useVaultStore.getState().papers) vaultNative.wipeOpened();
    handedOff = false;
    leftAt = null;
    return;
  }
  if (state !== 'background') return;
  leftAt = Date.now();
  const after = usePrefsStore.getState().lockAfter;
  const keep = handedOff;
  if (after === 0) lockPapers(keep);
  else timer = setTimeout(() => lockPapers(keep), after * 1000);
}

let following = false;

export function followLocking(): void {
  if (following) return;
  following = true;
  AppState.addEventListener('change', onAppState);
}
