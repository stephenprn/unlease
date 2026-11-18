/**
 * Wallet's server routes. The server keeps the vault whole and files sealed bytes; it reads nothing.
 *
 * - `POST /api/wallet/vault` creates the vault once: the first fields sent are kept and stored as the
 *   `walletVault` record under the server's clock; a later call gets the vault already there (`created`
 *   false), so two devices starting at once share one.
 * - A file sealed on the device (`crypto/seal`, `UWB1`…) goes up through the platform's `PUT /api/files/:id`
 *   as `application/octet-stream`, kept as it is (no picture made of it, nothing read), and comes back
 *   from `GET /api/blobs/:id?variant=original`. In Seafile it is `Wallet/<id>.bin`.
 * - `POST /api/wallet/read` is « Remplir avec Claude », only on the person's say: the pages of one item,
 *   opened on the device, are sent once; Claude's reading comes back and nothing is kept.
 */
import { DAY_PATTERN } from '@unlease/calendar/models/events';
import { readDerivedSeal, type VaultFields } from '../crypto/vault';
import { isSealed } from '../crypto/seal';
import { isItemKind, type ItemKind } from '../models/item';
import { isDocumentType, type DocumentType } from '../models/documentTypes';

export const WALLET_VAULT_PATH = '/api/wallet/vault';
export const WALLET_READ_PATH = '/api/wallet/read';

/** The largest sealed file the server takes: a scan of many pages, as a PDF. */
export const WALLET_BLOB_MAX_BYTES = 40 * 1024 * 1024;

export interface VaultCreateRequest {
  readonly fields: VaultFields;
}

export interface VaultCreateResponse {
  /** This call's vault was kept; false: another device's was already there, and is this one. */
  readonly created: boolean;
  readonly fields: VaultFields;
}

/** A page sent for Claude to read: JPEG or PNG, base64. */
export interface ReadPage {
  readonly mime: 'image/jpeg' | 'image/png';
  readonly base64: string;
}

export const READ_MAX_PAGES = 4;
/** Each page's most, base64: a scan downscaled to 1600 px on its long side fits well under it. */
export const READ_MAX_PAGE_CHARS = 2_800_000;

export interface ReadRequest {
  readonly pages: readonly ReadPage[];
  /** What the person said it is, or null: Claude says. */
  readonly kind: ItemKind | null;
  /** The interface's language: Claude writes a title and an issuer in it. */
  readonly lang: 'fr' | 'en';
}

/** What Claude read, every part optional: the device shows it to be checked before anything is saved. */
export interface ReadFields {
  readonly kind: ItemKind | null;
  readonly title: string | null;
  readonly issuer: string | null;
  readonly holder: string | null;
  readonly number: string | null;
  readonly issuedOn: string | null;
  readonly expiresOn: string | null;
  readonly birthDate: string | null;
  readonly docType: DocumentType | null;
  readonly docDate: string | null;
  readonly amount: number | null;
  readonly currency: string | null;
  readonly summary: string | null;
}

export interface ReadResponse {
  readonly fields: ReadFields;
}

/** A vault sent to be created, checked whole; null when a part is missing or misshapen. */
export function parseVaultCreate(raw: unknown): VaultCreateRequest | null {
  const fields = (raw as { fields?: Record<string, unknown> } | null)?.fields;
  if (!fields || typeof fields !== 'object') return null;
  const { passphrase, recovery, cards, papers, createdAt } = fields;
  if (!readDerivedSeal(passphrase) || !readDerivedSeal(recovery) || !isSealed(cards, 32) || !isSealed(papers, 32)) return null;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt) || createdAt < 0) return null;
  return { fields: { passphrase: passphrase as string, recovery: recovery as string, cards, papers, createdAt } };
}

export function parseReadRequest(raw: unknown): ReadRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.pages) || r.pages.length === 0 || r.pages.length > READ_MAX_PAGES) return null;
  const pages: ReadPage[] = [];
  for (const page of r.pages as unknown[]) {
    const p = page as Record<string, unknown> | null;
    if (!p || (p.mime !== 'image/jpeg' && p.mime !== 'image/png') || typeof p.base64 !== 'string' || p.base64.length === 0 || p.base64.length > READ_MAX_PAGE_CHARS) return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(p.base64)) return null;
    pages.push({ mime: p.mime, base64: p.base64 });
  }
  const kind = r.kind === null || r.kind === undefined ? null : isItemKind(r.kind) ? r.kind : undefined;
  if (kind === undefined || (r.lang !== 'fr' && r.lang !== 'en')) return null;
  return { pages, kind, lang: r.lang };
}

const text = (value: unknown, max: number): string | null => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const day = (value: unknown): string | null => (typeof value === 'string' && DAY_PATTERN.test(value) ? value : null);

/** Claude's answer read as fields, what is misshapen left out. */
export function readReadFields(value: unknown): ReadFields {
  const r = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const amount = typeof r.amount === 'number' && Number.isFinite(r.amount) ? r.amount : null;
  const currency = typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency) ? r.currency : null;
  return {
    kind: isItemKind(r.kind) ? r.kind : null,
    title: text(r.title, 200),
    issuer: text(r.issuer, 200),
    holder: text(r.holder, 200),
    number: text(r.number, 200),
    issuedOn: day(r.issuedOn),
    expiresOn: day(r.expiresOn),
    birthDate: day(r.birthDate),
    docType: isDocumentType(r.docType) ? r.docType : null,
    docDate: day(r.docDate),
    amount,
    currency: amount === null ? null : currency,
    summary: text(r.summary, 600),
  };
}
