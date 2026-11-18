import type { SyncRecord } from '@unlease/core/sync/record';
import { isValidField } from '@unlease/core/sync/schema';
import { TEST_KDF, testCipher } from '../../crypto/__tests__/testCipher';
import { createVault, ITEM_TYPE, VAULT_TYPE } from '../../crypto/vault';
import { EMPTY_DETAILS } from '../../models/item';
import { itemFromRecord, itemKeyOf, newItemFields, sealItemValues, vaultFromRecord } from '../entities';

const record = (type: string, id: string, fields: Record<string, unknown>): SyncRecord => ({ type, id, fields, clocks: {} }) as unknown as SyncRecord;

describe('wallet records', () => {
  it('seals an item whole, every field passing its type’s checks, and reads it back', async () => {
    const vault = await createVault(testCipher, 'pass', 1, TEST_KDF);
    const details = { ...EMPTY_DETAILS, number: '19AB12345', expiresOn: '2031-04-02', files: [{ id: 'f1', role: 'front' as const, mime: 'image/jpeg', name: 'recto.jpg', width: 10, height: 6, bytes: 99, thumb: 't1' }] };
    const { fields } = newItemFields(testCipher, vault.keys.papers, 'item-1', { kind: 'passport', title: 'Passeport', details, notes: '', text: 'P<UTO…' }, 5);
    for (const [field, value] of Object.entries(fields)) expect([field, isValidField(ITEM_TYPE, field, value)]).toEqual([field, true]);
    expect(fields.files).toEqual(['f1', 't1']);
    expect(fields.tier).toBe('papers');
    expect(JSON.stringify(fields)).not.toContain('19AB12345');

    const shown = itemFromRecord(testCipher, record(ITEM_TYPE, 'item-1', fields), { cards: vault.keys.cards, papers: vault.keys.papers });
    expect(shown).toMatchObject({ locked: false, kind: 'passport', title: 'Passeport', details: { number: '19AB12345', expiresOn: '2031-04-02' }, usage: { count: 0, at: null } });

    const locked = itemFromRecord(testCipher, record(ITEM_TYPE, 'item-1', fields), { cards: vault.keys.cards, papers: null });
    expect(locked).toMatchObject({ locked: true, tier: 'papers', fileIds: ['f1', 't1'] });
  });

  it('writes a patch under the item’s own key, and refuses a seal moved from another item', async () => {
    const vault = await createVault(testCipher, 'pass', 1, TEST_KDF);
    const tiers = { cards: vault.keys.cards, papers: vault.keys.papers };
    const a = newItemFields(testCipher, vault.keys.cards, 'a', { kind: 'card', title: 'Bio', details: EMPTY_DETAILS, notes: '', text: '' }, 1);
    const b = newItemFields(testCipher, vault.keys.cards, 'b', { kind: 'card', title: 'Café', details: EMPTY_DETAILS, notes: '', text: '' }, 1);
    const recA = record(ITEM_TYPE, 'a', a.fields);
    const key = itemKeyOf(testCipher, recA, tiers)!;
    const patch = sealItemValues(testCipher, key, 'a', { title: 'Bio & Co', favourite: true });
    expect(Object.keys(patch).sort()).toEqual(['favourite', 'title']);
    expect(itemFromRecord(testCipher, record(ITEM_TYPE, 'a', { ...a.fields, ...patch }), tiers)).toMatchObject({ title: 'Bio & Co', favourite: true });
    // b's title moved into a: it does not open there, and reads as empty.
    expect(itemFromRecord(testCipher, record(ITEM_TYPE, 'a', { ...a.fields, title: b.fields.title }), tiers)).toMatchObject({ title: '' });
  });

  it('reads a whole vault, and nothing from a partial one', async () => {
    const vault = await createVault(testCipher, 'pass', 7, TEST_KDF);
    for (const [field, value] of Object.entries(vault.fields)) expect([field, isValidField(VAULT_TYPE, field, value)]).toEqual([field, true]);
    expect(vaultFromRecord(record(VAULT_TYPE, 'vault', { ...vault.fields }))).toEqual(vault.fields);
    expect(vaultFromRecord(record(VAULT_TYPE, 'vault', { cards: vault.fields.cards }))).toBeNull();
  });
});
