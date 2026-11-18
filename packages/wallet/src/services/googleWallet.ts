/**
 * A pass shared from Google Wallet (« Partager », then « Copier le lien »): a link to
 * `pay.google.com/gp/v/save/` followed by a signed token (a JWT) that names the pass. It is read here,
 * on the device, without asking Google anything: Google shows the pass itself only to a signed-in
 * account, and the suite never talks to Google.
 *
 * What the token holds depends on who made it. A pass shared from the Wallet app names only its
 * class and its object (`3388000000018663570.KCmember`, `3388000000018663570.M-0202267355-20260505202845`):
 * the issuer writes the card's number into the object's id, so the number is the run of digits
 * there that is not a date. A token made by a shop's own site may carry the whole pass (its number,
 * its barcode, its programme's name), taken as it is.
 */
import { fromBase64Url, fromUtf8 } from '@unlease/core/services/bytes';
import { barcodeProblem, type Barcode, type BarcodeFormat } from '../models/barcode';

/** What a Google Wallet link gives of a card: every part may be missing, the person fills in the rest. */
export interface GoogleWalletCard {
  readonly kind: 'card' | 'giftCard';
  /** The programme's or the shop's name, when the link carries it, else ''. */
  readonly title: string;
  /** The card's number, read from the pass or from its id, else ''. */
  readonly number: string;
  /** The barcode, when the link carries it (format and value); else the number is typed under the format guessed from it. */
  readonly barcode: Barcode | null;
  /** The pass's class as Google names it (`KCmember`): the issuer's own word for the card, a hint for its name. */
  readonly program: string;
}

/** A Google Wallet link in a text (a share's words around it, a paste), or null. */
export function findGoogleWalletLink(text: string): string | null {
  const match = /https?:\/\/pay\.google\.com\/gp\/v\/save\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)/.exec(text);
  return match ? match[0] : null;
}

/** The kinds of pass that are a card here: loyalty, gift cards, offers, and the generic passes (a member's card, a library's). */
const OBJECT_KINDS: readonly { readonly key: string; readonly kind: GoogleWalletCard['kind'] }[] = [
  { key: 'loyaltyObjects', kind: 'card' },
  { key: 'giftCardObjects', kind: 'giftCard' },
  { key: 'genericObjects', kind: 'card' },
  { key: 'offerObjects', kind: 'card' },
];

const CLASS_KEYS: Readonly<Record<string, string>> = {
  loyaltyObjects: 'loyaltyClasses',
  giftCardObjects: 'giftCardClasses',
  genericObjects: 'genericClasses',
  offerObjects: 'offerClasses',
};

/** Google's barcode types, as this wallet names them. */
const BARCODE_TYPES: Readonly<Record<string, BarcodeFormat>> = {
  CODE_128: 'code128',
  EAN_13: 'ean13',
  EAN_8: 'ean8',
  QR_CODE: 'qr',
  UPC_A: 'upcA',
  UPC_E: 'upcE',
  CODE_39: 'code39',
  CODABAR: 'codabar',
  ITF_14: 'itf',
  PDF_417: 'pdf417',
  AZTEC: 'aztec',
  DATA_MATRIX: 'dataMatrix',
};

type Json = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
/** A localized string (`{ defaultValue: { value } }`) or a plain one. */
const localizedText = (value: unknown): string => (isObject(value) && isObject(value.defaultValue) ? text(value.defaultValue.value) : text(value));
/** An id's own part, after the issuer's number and its dot. */
const ownPart = (id: string): string => id.slice(id.indexOf('.') + 1);

/** A run of digits that reads as a moment (`20260505202845`) or a day (`20260505`), not a number. */
function isDate(digits: string): boolean {
  if (digits.length !== 8 && digits.length !== 12 && digits.length !== 14) return false;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  return year >= 1990 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/**
 * The card's number in a pass's id: the longest run of digits (6 to 24 of them) that is not a date,
 * the first of two as long. `M-0202267355-20260505202845` gives `0202267355`.
 */
export function numberInPassId(id: string): string {
  const runs = (ownPart(id).match(/\d+/g) ?? []).filter(run => run.length >= 6 && run.length <= 24 && !isDate(run));
  return runs.reduce((best, run) => (run.length > best.length ? run : best), '');
}

function barcodeOf(object: Json): Barcode | null {
  const barcode = object.barcode;
  if (!isObject(barcode)) return null;
  const format = BARCODE_TYPES[text(barcode.type)];
  const value = text(barcode.value);
  return format && value && !barcodeProblem(format, value) ? { format, value } : null;
}

/** The token's payload, or null when the text holds no Google Wallet link that reads. */
function payloadOf(link: string): Json | null {
  const token = link.slice(link.lastIndexOf('/') + 1);
  const bytes = fromBase64Url(token.split('.')[1] ?? '');
  if (!bytes) return null;
  try {
    const claims: unknown = JSON.parse(fromUtf8(bytes));
    return isObject(claims) && claims.typ === 'savetogooglepay' && isObject(claims.payload) ? claims.payload : null;
  } catch {
    return null;
  }
}

/** The first card a Google Wallet link in this text names, or null (no link, a token that does not read, a pass that is not a card: a ticket, a boarding pass). */
export function readGoogleWalletLink(input: string): GoogleWalletCard | null {
  const link = findGoogleWalletLink(input);
  const payload = link ? payloadOf(link) : null;
  if (!payload) return null;
  for (const { key, kind } of OBJECT_KINDS) {
    const objects = payload[key];
    const object = Array.isArray(objects) ? objects.find(isObject) : undefined;
    if (!object) continue;
    const id = text(object.id);
    const classId = text(object.classId) || (isObject(object.classReference) ? text(object.classReference.id) : '');
    const classes = payload[CLASS_KEYS[key]!];
    const known = (Array.isArray(classes) ? classes.filter(isObject) : []).find(each => text(each.id) === classId) ?? (isObject(object.classReference) ? object.classReference : null);
    const barcode = barcodeOf(object);
    const number = text(object.accountId) || text(object.cardNumber) || barcode?.value || numberInPassId(id);
    const title =
      (known && (text(known.programName) || text(known.issuerName) || localizedText(known.localizedProgramName) || localizedText(known.localizedIssuerName))) ||
      localizedText(object.cardTitle) ||
      localizedText(object.header) ||
      '';
    return { kind, title, number, barcode, program: classId ? ownPart(classId) : '' };
  }
  return null;
}
