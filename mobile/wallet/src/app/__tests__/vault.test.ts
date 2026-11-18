/**
 * The vault on a phone keeping everything to itself (no server): made once, its cards' key kept by
 * the Keystore (the mock's), the papers opened by the fingerprint once offered; an item sealed, opened
 * with the keys, locked again, deleted and taken back. Wallet syncs its records and Contacts'.
 */
import { EMPTY_DETAILS, type WalletItem } from '@unlease/wallet/models/item';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { syncedTypes } from '@shared/app/store/library';

import { state as native } from '../../../../shared/__mocks__/NativeWalletVault';
import { addItem, deleteItem, prepareItem } from '../store/actions';
import { getRecord, loadLibrary, resetLibrary, useLibraryStore } from '../store/libraryStore';
import { enableFingerprint, lockPapers, makeVault, unlockWithFingerprint, useVaultStore } from '../store/vault';

const item = (id: string): WalletItem => useLibraryStore.getState().items[id] as WalletItem;

describe('Wallet on a phone', () => {
  beforeEach(() => {
    closeDatabase();
    resetLibrary();
    openDatabase({ name: 'wallet.sqlite' });
    loadLibrary();
    native.keys.clear();
    useVaultStore.setState({ master: null, cards: null, papers: null, fingerprint: false });
  });

  it('syncs its records and Contacts’', () => {
    expect(syncedTypes('wallet')).toEqual(expect.arrayContaining(['walletVault', 'walletItem', 'contact']));
  });

  it('makes the vault, seals a passport, locks it and opens it again by the fingerprint', async () => {
    const made = await makeVault('le chat dort sur la valise');
    expect(made).toMatchObject({ recoveryCode: expect.stringMatching(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){7}$/) });
    expect(native.keys.has('cards')).toBe(true);
    expect(useLibraryStore.getState().vault).not.toBeNull();

    const prepared = prepareItem('passport')!;
    addItem(prepared, { kind: 'passport', title: 'Passeport', details: { ...EMPTY_DETAILS, number: '19AB12345' }, notes: '', text: '' });
    expect(item(prepared.id)).toMatchObject({ locked: false, title: 'Passeport', details: { number: '19AB12345' } });
    expect(JSON.stringify(getRecord('walletItem', prepared.id))).not.toContain('19AB12345');
    expect(native.secure).toBe(true);

    expect(await enableFingerprint()).toBe(true);
    lockPapers();
    expect(useLibraryStore.getState().items[prepared.id]).toMatchObject({ locked: true });
    expect(native.secure).toBe(false);

    expect(await unlockWithFingerprint()).toBe('opened');
    expect(item(prepared.id).title).toBe('Passeport');

    const undo = deleteItem(prepared.id);
    expect(item(prepared.id).deletedAt).not.toBeNull();
    undo();
    expect(item(prepared.id).deletedAt).toBeNull();
  });
});
