/**
 * What the wallet holds: items, each a card or a paper, opened from its sealed record. A card lives
 * in the `cards` tier (open on a phone without asking), a paper in `papers` (the fingerprint or the
 * passphrase each time). An item's kind says its tier for good.
 */
import type { Barcode } from './barcode';
import type { DocumentType } from './documentTypes';
import type { WalletTier } from '../crypto/vault';

/** Cards: a loyalty or member card, a gift card or voucher, the emergency card. */
export const CARD_KINDS = ['card', 'giftCard', 'emergency'] as const;
/** Papers: identity papers, then any document. */
export const PAPER_KINDS = ['idCard', 'passport', 'drivingLicence', 'healthCard', 'residencePermit', 'otherId', 'document'] as const;
export const ITEM_KINDS = [...CARD_KINDS, ...PAPER_KINDS] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export type CardKind = (typeof CARD_KINDS)[number];
export type PaperKind = (typeof PAPER_KINDS)[number];
/** The identity papers, shown in « Identité ». */
export const IDENTITY_KINDS: readonly PaperKind[] = ['idCard', 'passport', 'drivingLicence', 'healthCard', 'residencePermit', 'otherId'];

export const isItemKind = (value: unknown): value is ItemKind => typeof value === 'string' && (ITEM_KINDS as readonly string[]).includes(value);
export const tierOfKind = (kind: ItemKind): WalletTier => ((CARD_KINDS as readonly string[]).includes(kind) ? 'cards' : 'papers');
export const isIdentityKind = (kind: ItemKind): boolean => (IDENTITY_KINDS as readonly string[]).includes(kind);

/** A day, `2026-11-02`. */
export type Day = string;

/** What a file is to its item: a card's or a paper's front and back, a document's page, a photo kept with it. */
export type FileRole = 'front' | 'back' | 'page' | 'photo';

/** A file of an item, as its sealed details describe it: the blob holds only sealed bytes. */
export interface WalletFile {
  readonly id: string;
  readonly role: FileRole;
  /** The original's type: `image/jpeg`, `application/pdf`. */
  readonly mime: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  /** Its small picture, sealed too (a blob of its own), or null (a PDF not yet drawn). */
  readonly thumb: string | null;
}

export interface Money {
  readonly amount: number;
  /** ISO 4217: `EUR`. */
  readonly currency: string;
}

/** What an item says, sealed whole (one field): every part optional, as each kind uses its own. */
export interface ItemDetails {
  /** The shop, the authority, the company that issued it. */
  readonly issuer: string;
  /** That issuer as a contact (an insurer, a landlord), or null. */
  readonly issuerContactId: string | null;
  /** Whom it concerns, as a contact (a child's passport), or null: the owner. */
  readonly personContactId: string | null;
  /** The name written on it. */
  readonly holder: string;
  /** Its number: a card's, a passport's, a contract's. */
  readonly number: string;
  readonly barcode: Barcode | null;
  /** A pigment key (`design/colors`), or null for the kind's own. */
  readonly color: string | null;
  readonly issuedOn: Day | null;
  readonly expiresOn: Day | null;
  readonly birthDate: Day | null;
  /** Three letters, as a passport writes it (`FRA`). */
  readonly nationality: string;
  /** A gift card's or a voucher's balance. */
  readonly balance: Money | null;
  readonly docType: DocumentType | null;
  /** A document's date (a notice's, a bill's). */
  readonly docDate: Day | null;
  /** Kept until then, `forever`, or null: its type's rule. */
  readonly keepUntil: Day | 'forever' | null;
  readonly labels: readonly string[];
  readonly files: readonly WalletFile[];
  /** Days before it expires when a reminder rings, or null: its kind's. */
  readonly remind: readonly number[] | null;
}

export const EMPTY_DETAILS: ItemDetails = {
  issuer: '',
  issuerContactId: null,
  personContactId: null,
  holder: '',
  number: '',
  barcode: null,
  color: null,
  issuedOn: null,
  expiresOn: null,
  birthDate: null,
  nationality: '',
  balance: null,
  docType: null,
  docDate: null,
  keepUntil: null,
  labels: [],
  files: [],
  remind: null,
};

/** How often and how lately a card was shown at a till: its order in « Cartes ». */
export interface Usage {
  readonly count: number;
  readonly at: number | null;
}

/** An item opened: every field read from its seals. */
export interface WalletItem {
  readonly id: string;
  readonly locked: false;
  readonly tier: WalletTier;
  readonly kind: ItemKind;
  readonly title: string;
  readonly details: ItemDetails;
  readonly notes: string;
  /** The words read on its files (text recognition), for search. */
  readonly text: string;
  readonly usage: Usage;
  readonly favourite: boolean;
  /** The blobs it holds, as the server sees them (ids only). */
  readonly fileIds: readonly string[];
  readonly createdAt: number;
  readonly deletedAt: number | null;
  readonly editedAt: number;
}

/** An item whose tier this device cannot open now: only what the server sees of it. */
export interface LockedItem {
  readonly id: string;
  readonly locked: true;
  readonly tier: WalletTier;
  readonly fileIds: readonly string[];
  readonly createdAt: number;
  readonly deletedAt: number | null;
  readonly editedAt: number;
}

export type ShownItem = WalletItem | LockedItem;

/** The most each sealed value holds, in UTF-8 bytes before sealing. */
export const ITEM_LIMITS = {
  title: 400,
  details: 24_000,
  notes: 40_000,
  text: 200_000,
  /** Labels on one item, and a label's length. */
  labels: 20,
  label: 60,
  /** Files on one item: pages of one document. */
  files: 60,
} as const;
