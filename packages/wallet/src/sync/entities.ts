/**
 * Wallet's records to and from what the apps show. Reading opens each seal with the keys this device
 * holds now: an item of a tier still locked reads as a `LockedItem` (what the server sees of it), and
 * a seal that does not open (damaged, or sealed elsewhere) reads as the field's default. Reading never
 * throws. Writing seals each field under the item's own key, its place named (`crypto/seal`).
 */
import { editedAt, type Fields, type SyncRecord } from '@unlease/core/sync/record';
import { DAY_PATTERN } from '@unlease/calendar/models/events';
import type { WalletCipher } from '../crypto/cipher';
import { fieldPlace, openValue, sealValue } from '../crypto/seal';
import { ITEM_TYPE, newKey, openItemKey, readDerivedSeal, sealItemKey, WALLET_TIERS, type TierKeys, type VaultFields, type WalletTier } from '../crypto/vault';
import { isBarcodeFormat, type Barcode } from '../models/barcode';
import { isDocumentType } from '../models/documentTypes';
import { EMPTY_DETAILS, isItemKind, ITEM_LIMITS, tierOfKind, type FileRole, type ItemDetails, type ItemKind, type ShownItem, type Usage, type WalletFile, type WalletItem } from '../models/item';
// Declares Wallet's record types to the sync before any record is read.
import { SEALED_ITEM_FIELDS, type SealedItemField } from './types';

const asTime = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const asNullableTime = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const asString = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');
const asDay = (value: unknown): string | null => (typeof value === 'string' && DAY_PATTERN.test(value) ? value : null);
const asId = (value: unknown): string | null => (typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null);
const asCount = (value: unknown): number => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0);
const asTier = (value: unknown): WalletTier => ((WALLET_TIERS as readonly unknown[]).includes(value) ? (value as WalletTier) : 'papers');
const asIds = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => asId(id) !== null) : []);

/** The vault's fields, or null when the record is not a whole vault. */
export function vaultFromRecord(record: SyncRecord | undefined): VaultFields | null {
  const f = record?.fields;
  if (!f || readDerivedSeal(f.passphrase) === null || readDerivedSeal(f.recovery) === null || typeof f.cards !== 'string' || typeof f.papers !== 'string') return null;
  return { passphrase: f.passphrase as string, recovery: f.recovery as string, cards: f.cards, papers: f.papers, createdAt: asTime(f.createdAt) };
}

const FILE_ROLES: readonly FileRole[] = ['front', 'back', 'page', 'photo'];

function readFile(value: unknown): WalletFile | null {
  if (typeof value !== 'object' || value === null) return null;
  const f = value as Record<string, unknown>;
  const id = asId(f.id);
  if (!id) return null;
  return {
    id,
    role: FILE_ROLES.includes(f.role as FileRole) ? (f.role as FileRole) : 'page',
    mime: typeof f.mime === 'string' && /^[a-z]+\/[a-z0-9.+-]+$/.test(f.mime) ? f.mime : 'application/octet-stream',
    name: asString(f.name, 200),
    width: asCount(f.width),
    height: asCount(f.height),
    bytes: asCount(f.bytes),
    thumb: asId(f.thumb),
  };
}

function readBarcode(value: unknown): Barcode | null {
  if (typeof value !== 'object' || value === null) return null;
  const b = value as Record<string, unknown>;
  return isBarcodeFormat(b.format) && typeof b.value === 'string' && b.value ? { format: b.format, value: b.value.slice(0, 2000) } : null;
}

/** Sealed details read back, every part checked: what is wrong reads as empty. */
export function readDetails(value: unknown): ItemDetails {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return EMPTY_DETAILS;
  const d = value as Record<string, unknown>;
  const balance = d.balance as Record<string, unknown> | null | undefined;
  return {
    issuer: asString(d.issuer, 200),
    issuerContactId: asId(d.issuerContactId),
    personContactId: asId(d.personContactId),
    holder: asString(d.holder, 200),
    number: asString(d.number, 200),
    barcode: readBarcode(d.barcode),
    color: typeof d.color === 'string' && /^[a-z]{1,20}$/.test(d.color) ? d.color : null,
    issuedOn: asDay(d.issuedOn),
    expiresOn: asDay(d.expiresOn),
    birthDate: asDay(d.birthDate),
    nationality: typeof d.nationality === 'string' && /^[A-Z]{1,3}$/.test(d.nationality) ? d.nationality : '',
    balance:
      balance && typeof balance === 'object' && typeof balance.amount === 'number' && Number.isFinite(balance.amount) && typeof balance.currency === 'string' && /^[A-Z]{3}$/.test(balance.currency)
        ? { amount: balance.amount, currency: balance.currency }
        : null,
    docType: isDocumentType(d.docType) ? d.docType : null,
    docDate: asDay(d.docDate),
    keepUntil: d.keepUntil === 'forever' ? 'forever' : asDay(d.keepUntil),
    labels: Array.isArray(d.labels)
      ? [...new Set(d.labels.filter((label): label is string => typeof label === 'string' && label.trim() !== '').map(label => label.trim().slice(0, ITEM_LIMITS.label)))].slice(0, ITEM_LIMITS.labels)
      : [],
    files: Array.isArray(d.files) ? d.files.flatMap(file => readFile(file) ?? []).slice(0, ITEM_LIMITS.files) : [],
    remind: Array.isArray(d.remind) ? [...new Set(d.remind.filter((days): days is number => Number.isInteger(days) && days >= 0 && days <= 3650))].sort((a, b) => b - a) : null,
  };
}

function readUsage(value: unknown): Usage {
  if (typeof value !== 'object' || value === null) return { count: 0, at: null };
  const u = value as Record<string, unknown>;
  return { count: asCount(u.count), at: asNullableTime(u.at) };
}

/** The key an item's fields are sealed under, when this device holds its tier's. */
export function itemKeyOf(cipher: WalletCipher, record: SyncRecord, tiers: TierKeys): Uint8Array | null {
  const tierKey = tiers[asTier(record.fields.tier)];
  return tierKey ? openItemKey(cipher, tierKey, record.id, record.fields.key) : null;
}

/** An item as this device can show it: opened, or locked. */
export function itemFromRecord(cipher: WalletCipher, record: SyncRecord, tiers: TierKeys): ShownItem {
  const f = record.fields;
  const tier = asTier(f.tier);
  const base = { id: record.id, tier, fileIds: asIds(f.files), createdAt: asTime(f.createdAt), deletedAt: asNullableTime(f.deletedAt), editedAt: editedAt(record) };
  const key = itemKeyOf(cipher, record, tiers);
  if (!key) return { ...base, locked: true };
  const open = (field: SealedItemField): unknown => openValue(cipher, key, f[field], fieldPlace(ITEM_TYPE, record.id, field));
  const kind = open('kind');
  const shown: WalletItem = {
    ...base,
    locked: false,
    // A kind that does not open falls back to its tier's plainest.
    kind: isItemKind(kind) && tierOfKind(kind) === tier ? kind : tier === 'cards' ? 'card' : 'document',
    title: asString(open('title'), ITEM_LIMITS.title),
    details: readDetails(open('details')),
    notes: asString(open('notes'), ITEM_LIMITS.notes),
    text: asString(open('text'), ITEM_LIMITS.text),
    usage: readUsage(open('usage')),
    favourite: open('favourite') === true,
  };
  key.fill(0);
  return shown;
}

/** The sealed fields an item's values are written as. */
export interface SealedValues {
  readonly kind?: ItemKind;
  readonly title?: string;
  readonly details?: ItemDetails;
  readonly notes?: string;
  readonly text?: string;
  readonly usage?: Usage;
  readonly favourite?: boolean;
}

/** Some of an item's values sealed under its key: a patch for `writeLocal`. */
export function sealItemValues(cipher: WalletCipher, itemKey: Uint8Array, itemId: string, values: SealedValues): Fields {
  const out: Fields = {};
  for (const field of SEALED_ITEM_FIELDS) {
    const value = values[field];
    if (value !== undefined) out[field] = sealValue(cipher, itemKey, value, fieldPlace(ITEM_TYPE, itemId, field));
  }
  return out;
}

/** The files the server must keep for an item: each file and its small picture. */
export const blobIdsOf = (details: ItemDetails): string[] => [...new Set(details.files.flatMap(file => (file.thumb ? [file.id, file.thumb] : [file.id])))];

export interface NewItem {
  readonly kind: ItemKind;
  readonly title: string;
  readonly details: ItemDetails;
  readonly notes: string;
  readonly text: string;
}

/** A new item's fields, whole, and its key (to seal its files with): a new one, or the one its files were already sealed under. */
export function newItemFields(cipher: WalletCipher, tierKey: Uint8Array, itemId: string, item: NewItem, now: number, itemKey: Uint8Array = newKey(cipher)): { readonly fields: Fields; readonly itemKey: Uint8Array } {
  const fields: Fields = {
    tier: tierOfKind(item.kind),
    key: sealItemKey(cipher, tierKey, itemId, itemKey),
    ...sealItemValues(cipher, itemKey, itemId, { ...item, usage: { count: 0, at: null }, favourite: false }),
    files: blobIdsOf(item.details),
    createdAt: now,
    deletedAt: null,
  };
  return { fields, itemKey };
}

export const isOpen = (item: ShownItem): item is WalletItem => !item.locked;
