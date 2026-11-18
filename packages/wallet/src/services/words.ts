/** What Wallet says of its items, in the interface's language: kinds, document types, formats, expiries. */
import { localized, t, tx } from '@unlease/core/i18n';
import { formatIsoDay, plural } from '@unlease/core/services/format';
import { isLineColor, type LineColor } from '@unlease/design/colors';
import type { GlyphName } from '@unlease/design/glyphs';
import type { BarcodeFormat, BarcodeProblem } from '../models/barcode';
import { DOCUMENT_TYPE_INFO, type DocumentType } from '../models/documentTypes';
import { tierOfKind, type ItemKind, type PaperKind } from '../models/item';
import type { ExpiryState, KeepTerm } from './expiry';

const KIND_NAMES = localized<ItemKind>({
  card: tx('Card'),
  giftCard: tx('Gift card'),
  emergency: tx('Emergency card'),
  idCard: tx('Identity card'),
  passport: tx('Passport'),
  drivingLicence: tx('Driving licence'),
  healthCard: tx('Health insurance card'),
  residencePermit: tx('Residence permit'),
  otherId: tx('Other identity paper'),
  document: tx('Document'),
});

export const kindName = (kind: ItemKind): string => t(KIND_NAMES[kind]);

export const KIND_GLYPHS: Readonly<Record<ItemKind, GlyphName>> = {
  card: 'card',
  giftCard: 'gift',
  emergency: 'medical',
  idCard: 'idCard',
  passport: 'passport',
  drivingLicence: 'car',
  healthCard: 'heartPulse',
  residencePermit: 'idCard',
  otherId: 'idCard',
  document: 'page',
};

/**
 * A paper's pigment, the colour of the thing itself as France issues it (the passport's burgundy, the
 * card's blue, the licence's pink, the Carte Vitale's green), so a paper is known at a glance. A card
 * wears the colour its person picks.
 */
export const PAPER_INKS: Readonly<Record<PaperKind, LineColor>> = {
  idCard: 'sky',
  passport: 'magenta',
  drivingLicence: 'pink',
  healthCard: 'green',
  residencePermit: 'lilac',
  otherId: 'grey',
  document: 'ochre',
};

/** An item's pigment: a card's own (an emergency card's red), a paper's kind's. */
export function itemInk(item: { readonly kind: ItemKind; readonly details: { readonly color: string | null } }): LineColor {
  if (item.kind === 'emergency') return 'red';
  if (tierOfKind(item.kind) === 'papers') return PAPER_INKS[item.kind as PaperKind];
  return item.details.color && isLineColor(item.details.color) ? item.details.color : 'grey';
}

const TYPE_NAMES = localized<DocumentType>({
  tax: tx('Taxes'),
  work: tx('Work and pay'),
  bank: tx('Bank and loans'),
  insurance: tx('Insurance'),
  housing: tx('Housing'),
  property: tx('Property'),
  utilities: tx('Bills'),
  health: tx('Health'),
  vehicle: tx('Vehicle'),
  purchase: tx('Purchases and warranties'),
  family: tx('Family and civil status'),
  education: tx('Education'),
  other: tx('Other'),
});

export const documentTypeName = (type: DocumentType): string => t(TYPE_NAMES[type]);
export const documentTypeGlyph = (type: DocumentType): GlyphName => DOCUMENT_TYPE_INFO[type].glyph;

/** A format's name, as it is written on a scanner's settings (the same in both languages but the QR code's). */
export function formatName(format: BarcodeFormat): string {
  switch (format) {
    case 'code128':
      return 'Code 128';
    case 'ean13':
      return 'EAN-13';
    case 'qr':
      return t('QR code');
    case 'ean8':
      return 'EAN-8';
    case 'upcA':
      return 'UPC-A';
    case 'upcE':
      return 'UPC-E';
    case 'code39':
      return 'Code 39';
    case 'code93':
      return 'Code 93';
    case 'codabar':
      return 'Codabar';
    case 'itf':
      return 'ITF';
    case 'pdf417':
      return 'PDF417';
    case 'aztec':
      return 'Aztec';
    case 'dataMatrix':
      return 'Data Matrix';
    default:
      return format;
  }
}

/** Why a typed value cannot be drawn in its format, as one sentence under the field. */
export function barcodeProblemWords(problem: BarcodeProblem, format: BarcodeFormat): string {
  switch (problem) {
    case 'empty':
      return t('Type the number written under the barcode.');
    case 'digits':
      return t('{format} holds digits only.', { format: formatName(format) });
    case 'length':
      return format === 'itf' ? t('ITF holds an even number of digits.') : t('{format} holds {count} digits.', { format: formatName(format), count: format === 'ean13' ? 13 : format === 'upcA' ? 12 : 8 });
    case 'checkDigit':
      return t('The last digit doesn’t match the others: check the number, or scan the card.');
    case 'characters':
      return t('{format} can’t hold some of these characters.', { format: formatName(format) });
    case 'tooLong':
      return t('This is too long for a barcode.');
    default:
      return t('This number can’t be drawn as a barcode.');
  }
}

/** « Expire dans 3 ans », « Expire aujourd’hui », « A expiré il y a 12 jours ». */
export function expiryWords(state: ExpiryState): string | null {
  const days = state.days;
  if (days === null) return null;
  if (days === 0) return t('Expires today');
  if (days < 0) {
    const ago = -days;
    if (ago < 60) return t('Expired {time} ago', { time: plural(ago, 'day') });
    if (ago < 730) return t('Expired {time} ago', { time: plural(Math.floor(ago / 30.44), 'month') });
    return t('Expired {time} ago', { time: plural(Math.floor(ago / 365.25), 'year') });
  }
  if (days < 60) return t('Expires in {time}', { time: plural(days, 'day') });
  if (days < 730) return t('Expires in {time}', { time: plural(Math.floor(days / 30.44), 'month') });
  return t('Expires in {time}', { time: plural(Math.floor(days / 365.25), 'year') });
}

/** « Valable jusqu’au 2 nov. 2031 ». */
export const validUntilWords = (day: string): string => t('Valid until {date}', { date: formatIsoDay(day) });

/** « À garder jusqu’au 31 déc. 2028 », « À garder pour toujours », « À garder jusqu’à la retraite ». */
export function keepWords(term: KeepTerm): string | null {
  if (term === null) return null;
  if (term === 'forever') return t('Keep for good');
  if (term === 'retirement') return t('Keep until your pension is settled');
  return t('Keep until {date}', { date: formatIsoDay(term) });
}

/** What a reminder says, never the paper's number: « Votre passeport expire dans 6 mois ». */
export function reminderWords(kind: ItemKind, title: string, daysBefore: number): { readonly title: string; readonly body: string } {
  const name = title.trim() || kindName(kind);
  const when = expiryWords({ tone: 'soon', days: daysBefore }) ?? '';
  const body =
    kind === 'passport' && daysBefore >= 150
      ? t('Many countries ask for 6 months of validity on arrival: renew it now if you travel soon.')
      : kind === 'giftCard'
        ? t('Spend what is left on it before it expires.')
        : t('Time to renew it, or to replace it with the new one.');
  return { title: `${name} · ${when}`, body };
}
