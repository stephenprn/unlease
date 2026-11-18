/**
 * The demo's wallet: a vault made with the app's own cryptography and a made-up passphrase
 * (`DEMO_PASSPHRASE`, said under the unlock field), then cards, identity papers and documents sealed
 * in it, all made up. The vault is the server's record (as `POST /api/wallet/vault` writes it); the
 * items are a device's, written a few weeks back. The browser starts as one that kept its cards open
 * (« Garder les cartes ouvertes dans ce navigateur »): the cards show at once, the papers and the
 * documents ask the passphrase, as the app does. Loaded only by Wallet's demo: Argon2id costs a moment.
 */
import { addDays, instantToDay } from '@unlease/calendar/services/time';
import { formatHlc } from '@unlease/core/sync/hlc';
import type { SyncRecord } from '@unlease/core/sync/record';
import { createVault, VAULT_ID, VAULT_TYPE, ITEM_TYPE } from '@unlease/wallet/crypto/vault';
import { gs1CheckDigit } from '@unlease/wallet/models/barcode';
import { EMPTY_DETAILS, tierOfKind, type ItemDetails, type ItemKind } from '@unlease/wallet/models/item';
import { newItemFields, sealItemValues } from '@unlease/wallet/sync/entities';

import { browserCipher } from '@wallet/app/cipher';
import { rememberCards, sayDemoPassphrase, setRememberCards } from '@wallet/app/store/vault';

/** The demo vault's passphrase: made up, public, the same on every load. */
export const DEMO_PASSPHRASE = 'open the demo';

const DAY = 86_400_000;

interface ItemSeed {
  readonly id: string;
  readonly kind: ItemKind;
  readonly title: string;
  readonly details: Partial<ItemDetails>;
  readonly notes?: string;
  /** How long ago it was added. */
  readonly ago: number;
  /** Times shown at a till, and how long ago last: the order of « Cartes ». */
  readonly used?: readonly [count: number, agoDays: number];
  readonly favourite?: boolean;
}

/** An EAN-13 of the in-store range (20…), its check digit counted: no product's. */
const ean13 = (twelve: string): string => `${twelve}${gs1CheckDigit(twelve)}`;

function seeds(now: number): ItemSeed[] {
  const today = instantToDay(now);
  const day = (offset: number): string => addDays(today, offset);
  const holder = 'Jordan Ellis';
  return [
    {
      id: 'demo-wallet-bakery',
      kind: 'card',
      title: 'Golden Crust Bakery',
      details: { issuer: 'Golden Crust Bakery', holder, number: ean13('200014273865'), barcode: { format: 'ean13', value: ean13('200014273865') }, color: 'ochre' },
      notes: 'The tenth loaf is free.',
      ago: 80 * DAY,
      used: [41, 1],
      favourite: true,
    },
    {
      id: 'demo-wallet-bookshop',
      kind: 'card',
      title: 'Paper Lantern Books',
      details: { issuer: 'Paper Lantern Books', holder, number: 'PLB-0048-3172', barcode: { format: 'code128', value: 'PLB00483172' }, color: 'blue' },
      ago: 60 * DAY,
      used: [12, 6],
    },
    {
      id: 'demo-wallet-climbing',
      kind: 'card',
      title: 'Boulder Loft',
      details: { issuer: 'Boulder Loft climbing gym', holder, number: 'BL-77215', barcode: { format: 'qr', value: 'https://boulder-loft.example/member/77215' }, color: 'green', expiresOn: day(140) },
      notes: 'Ten-visit pass, renewed every year.',
      ago: 200 * DAY,
      used: [23, 3],
    },
    {
      id: 'demo-wallet-cinema',
      kind: 'card',
      title: 'Lantern Street Cinema',
      details: { issuer: 'Lantern Street Cinema', holder, number: '6042 1187 5530', barcode: { format: 'code128', value: '604211875530' }, color: 'lilac' },
      ago: 30 * DAY,
      used: [4, 12],
    },
    {
      id: 'demo-wallet-gift',
      kind: 'giftCard',
      title: 'Hillside Cellar gift card',
      details: { issuer: 'Hillside Cellar', number: '7781 0042 9917 3305', barcode: { format: 'code128', value: '7781004299173305' }, color: 'red', balance: { amount: 35, currency: 'EUR' }, expiresOn: day(240) },
      notes: 'A birthday present from Sam.',
      ago: 20 * DAY,
      used: [1, 20],
    },
    {
      id: 'demo-wallet-emergency',
      kind: 'emergency',
      title: 'Medical information',
      details: { holder, birthDate: '1991-04-12' },
      notes: 'Blood type O+. Allergic to penicillin. Asthma: an inhaler in the left pocket.\nCall Sam Ellis, +33 6 00 00 00 00.',
      ago: 90 * DAY,
    },
    {
      id: 'demo-wallet-id',
      kind: 'idCard',
      title: 'Identity card',
      details: { issuer: 'Ministry of the Interior', holder, number: 'X4RT72Q91', birthDate: '1991-04-12', nationality: 'FRA', issuedOn: day(-3 * 365), expiresOn: day(7 * 365) },
      ago: 70 * DAY,
    },
    {
      id: 'demo-wallet-passport',
      kind: 'passport',
      title: 'Passport',
      details: { issuer: 'Ministry of the Interior', holder, number: '21ZX48163', birthDate: '1991-04-12', nationality: 'FRA', issuedOn: day(-10 * 365 + 50), expiresOn: day(50) },
      notes: 'Renew before the trip in the spring.',
      ago: 70 * DAY,
    },
    {
      id: 'demo-wallet-tax',
      kind: 'document',
      title: 'Income tax notice 2026',
      details: { issuer: 'Tax office', holder, number: '26 75 A123 456 78', docType: 'tax', docDate: day(-95), labels: ['Taxes 2026'] },
      notes: 'Tax on 2025’s income. Paid monthly from September; the balance is taken in December.',
      ago: 94 * DAY,
    },
    {
      id: 'demo-wallet-electricity',
      kind: 'document',
      title: 'Electricity bill, October',
      details: { issuer: 'Brightline Energy', holder, number: 'Customer 5501 2276', docType: 'utilities', docDate: day(-18) },
      notes: '€84.20, taken on the 5th of next month.',
      ago: 17 * DAY,
    },
  ];
}

/**
 * The vault and its items as records, the passphrase said under the unlock field, and the cards'
 * key kept in this browser as a visit that ticked « Garder les cartes ouvertes » left it.
 */
export async function buildDemoWallet(now: number = Date.now()): Promise<SyncRecord[]> {
  const made = await createVault(browserCipher, DEMO_PASSPHRASE, now - 95 * DAY);
  const records: SyncRecord[] = [];
  // Written by the server, under its own clock, as the vault route does.
  const vaultClock = formatHlc(now - 95 * DAY, 0, 'demoserver');
  records.push({ type: VAULT_TYPE, id: VAULT_ID, fields: { ...made.fields }, clocks: Object.fromEntries(Object.keys(made.fields).map(key => [key, vaultClock])) });
  seeds(now).forEach((seed, index) => {
    const time = now - seed.ago;
    const tierKey = tierOfKind(seed.kind) === 'cards' ? made.keys.cards : made.keys.papers;
    const { fields, itemKey } = newItemFields(browserCipher, tierKey, seed.id, { kind: seed.kind, title: seed.title, details: { ...EMPTY_DETAILS, ...seed.details }, notes: seed.notes ?? '', text: '' }, time);
    const used = seed.used ? { count: seed.used[0], at: now - seed.used[1] * DAY } : undefined;
    const patch = { ...fields, ...sealItemValues(browserCipher, itemKey, seed.id, { ...(used ? { usage: used } : {}), ...(seed.favourite ? { favourite: true } : {}) }) };
    itemKey.fill(0);
    const clock = formatHlc(time, index, 'demoseed');
    records.push({ type: ITEM_TYPE, id: seed.id, fields: patch, clocks: Object.fromEntries(Object.keys(patch).map(key => [key, clock])) });
  });
  await rememberCards(made.keys.cards);
  made.keys.master.fill(0);
  made.keys.papers.fill(0);
  made.keys.cards.fill(0);
  sayDemoPassphrase(DEMO_PASSPHRASE);
  return records;
}

/** A load without the demo's wallet (`setup`, `empty`): nothing kept of an earlier load's cards. */
export const forgetDemoWallet = (): Promise<void> => setRememberCards(false);
