import { describe, expect, it } from 'vitest';

import { openWithPassphrase, VAULT_TYPE } from '@unlease/wallet/crypto/vault';
import { isOpen, itemFromRecord, vaultFromRecord } from '@unlease/wallet/sync/entities';

import { setStorageName } from '@shared/app/env';
import { browserCipher } from '@wallet/app/cipher';
import { rememberedHere, shownPassphrase } from '@wallet/app/store/vault';
import { buildDemoWallet, DEMO_PASSPHRASE, forgetDemoWallet } from '../demoWallet';

describe('the demo’s wallet', () => {
  it('seals its cards, papers and documents in a vault its passphrase opens, the cards kept open in this browser', async () => {
    setStorageName('unlease-demo-test');
    const records = await buildDemoWallet(Date.UTC(2026, 10, 18, 12));
    const vault = vaultFromRecord(records.find(record => record.type === VAULT_TYPE))!;
    expect(Object.values(records[0]!.clocks).every(clock => clock.endsWith('-demoserver'))).toBe(true);
    const keys = (await openWithPassphrase(browserCipher, vault, DEMO_PASSPHRASE))!;
    expect(keys).not.toBeNull();
    const items = records.filter(record => record.type !== VAULT_TYPE);
    const opened = items.map(record => itemFromRecord(browserCipher, record, { cards: keys.cards, papers: keys.papers })).filter(isOpen);
    expect(opened).toHaveLength(items.length);
    expect(opened.filter(item => item.tier === 'cards').map(item => item.kind).sort()).toEqual(['card', 'card', 'card', 'card', 'emergency', 'giftCard']);
    expect(opened.filter(item => item.tier === 'papers').map(item => item.kind).sort()).toEqual(['document', 'document', 'idCard', 'passport']);
    // The cards alone open with the cards' key; the papers stay sealed.
    const cardsOnly = items.map(record => itemFromRecord(browserCipher, record, { cards: keys.cards, papers: null }));
    expect(cardsOnly.filter(isOpen).every(item => item.tier === 'cards')).toBe(true);
    expect(cardsOnly.filter(item => item.locked)).toHaveLength(4);
    expect(rememberedHere()).toBe(true);
    expect(shownPassphrase()).toBe(DEMO_PASSPHRASE);
    await forgetDemoWallet();
    expect(rememberedHere()).toBe(false);
  });
});
