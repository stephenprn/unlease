/**
 * The barcodes a card can carry: Catima's thirteen formats, which ZXing reads on the phone and bwip-js
 * draws on both clients. A value is checked where its format has a rule (a check digit, a character
 * set), so a number typed by hand is caught before it reaches the till.
 */

export const BARCODE_FORMATS = ['code128', 'ean13', 'qr', 'ean8', 'upcA', 'upcE', 'code39', 'code93', 'codabar', 'itf', 'pdf417', 'aztec', 'dataMatrix'] as const;
export type BarcodeFormat = (typeof BARCODE_FORMATS)[number];

export interface Barcode {
  readonly format: BarcodeFormat;
  readonly value: string;
}

export const isBarcodeFormat = (value: unknown): value is BarcodeFormat => typeof value === 'string' && (BARCODE_FORMATS as readonly string[]).includes(value);

/** Two-dimensional: drawn square, the value often too long to show under it. */
export const isSquareFormat = (format: BarcodeFormat): boolean => format === 'qr' || format === 'aztec' || format === 'dataMatrix';

/** bwip-js's name for each format. */
export const BWIP_NAMES: Readonly<Record<BarcodeFormat, string>> = {
  code128: 'code128',
  ean13: 'ean13',
  qr: 'qrcode',
  ean8: 'ean8',
  upcA: 'upca',
  upcE: 'upce',
  code39: 'code39',
  code93: 'code93',
  codabar: 'rationalizedCodabar',
  itf: 'interleaved2of5',
  pdf417: 'pdf417',
  aztec: 'azteccode',
  dataMatrix: 'datamatrix',
};

/** GS1's check digit (EAN, UPC): weights 3 and 1 from the right, the digit itself left out. */
export function gs1CheckDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += Number(digits[digits.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

const gs1Holds = (value: string): boolean => gs1CheckDigit(value.slice(0, -1)) === Number(value.at(-1));

/** UPC-E written out as the UPC-A it stands for, for its check digit. */
function upcEToA(value: string): string {
  const [system, d1, d2, d3, d4, d5, last] = [value[0]!, value[1]!, value[2]!, value[3]!, value[4]!, value[5]!, value[6]!];
  let body: string;
  if (last <= '2') body = `${d1}${d2}${last}0000${d3}${d4}${d5}`;
  else if (last === '3') body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (last === '4') body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${last}`;
  return `${system}${body}`;
}

export type BarcodeProblem = 'empty' | 'digits' | 'length' | 'checkDigit' | 'characters' | 'tooLong';

/** What is wrong with a value for its format, or null when it can be drawn. */
export function barcodeProblem(format: BarcodeFormat, value: string): BarcodeProblem | null {
  if (value.length === 0) return 'empty';
  if (value.length > 2000) return 'tooLong';
  const digits = /^\d+$/.test(value);
  switch (format) {
    case 'ean13':
      if (!digits) return 'digits';
      if (value.length !== 13) return 'length';
      return gs1Holds(value) ? null : 'checkDigit';
    case 'ean8':
      if (!digits) return 'digits';
      if (value.length !== 8) return 'length';
      return gs1Holds(value) ? null : 'checkDigit';
    case 'upcA':
      if (!digits) return 'digits';
      if (value.length !== 12) return 'length';
      return gs1Holds(value) ? null : 'checkDigit';
    case 'upcE':
      if (!digits) return 'digits';
      if (value.length !== 8) return 'length';
      if (value[0] !== '0' && value[0] !== '1') return 'digits';
      return gs1CheckDigit(upcEToA(value.slice(0, 7))) === Number(value[7]) ? null : 'checkDigit';
    case 'itf':
      if (!digits) return 'digits';
      return value.length % 2 === 0 ? null : 'length';
    case 'code39':
      return /^[0-9A-Z \-.$/+%]+$/.test(value) ? null : 'characters';
    case 'codabar':
      return /^[A-Da-d]?[0-9\-$:/.+]+[A-Da-d]?$/.test(value) ? null : 'characters';
    case 'code93':
    case 'code128':
      // ASCII only: what a scanner at a till reads back.
      return /^[\x20-\x7e]+$/.test(value) ? null : 'characters';
    case 'qr':
    case 'pdf417':
    case 'aztec':
    case 'dataMatrix':
      return null;
    default:
      return null;
  }
}

/** The format a typed number most likely has: GS1's when its check digit holds, else Code 128, which takes anything a till reads. */
export function guessFormat(value: string): BarcodeFormat {
  if (/^\d{13}$/.test(value) && gs1Holds(value)) return 'ean13';
  if (/^\d{8}$/.test(value) && gs1Holds(value)) return 'ean8';
  if (/^\d{12}$/.test(value) && gs1Holds(value)) return 'upcA';
  return 'code128';
}
