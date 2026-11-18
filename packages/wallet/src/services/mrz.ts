/**
 * The machine-readable zone of a passport or an identity card (ICAO 9303), read on the device from a
 * scan's recognized text: the number, the names, the dates and the nationality, exactly, without
 * Claude. TD3 (passports, two lines of 44), TD1 (identity cards and residence permits since 2021,
 * three lines of 30), TD2 (two lines of 36), and France's identity card of 1988 to 2021 (two lines
 * of 36 of its own: its number starts with the month it was issued, and it gives no expiry).
 *
 * Recognition misreads `<` and mixes O with 0: each line is cleaned, and digits are put back where a
 * field can only hold digits. Every check digit is tried; a reading whose checks do not all hold is
 * still offered, marked, so the person checks it against the paper.
 */
import { DAY_PATTERN } from '@unlease/calendar/models/events';
import type { Day, PaperKind } from '../models/item';

export type MrzFormat = 'td1' | 'td2' | 'td3' | 'frId';

export interface MrzReading {
  readonly format: MrzFormat;
  readonly kind: PaperKind;
  /** The state that issued it, three letters (`FRA`; Germany's `D`). */
  readonly issuingState: string;
  readonly number: string;
  readonly surname: string;
  readonly givenNames: string;
  readonly nationality: string;
  readonly birthDate: Day | null;
  readonly sex: 'F' | 'M' | 'X';
  readonly expiresOn: Day | null;
  /** France's old card only: the month its number names, as the month's first day. */
  readonly issuedOn: Day | null;
  /** Every check digit holds. */
  readonly checked: boolean;
}

const VALUES = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** ICAO's check digit: weights 7, 3, 1; digits as themselves, A to Z as 10 to 35, `<` as 0. */
export function mrzCheckDigit(text: string): number {
  let sum = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const value = char === '<' ? 0 : VALUES.indexOf(char);
    sum += Math.max(0, value) * [7, 3, 1][i % 3]!;
  }
  return sum % 10;
}

const holds = (text: string, digit: string | undefined): boolean => digit !== undefined && /\d/.test(digit) && mrzCheckDigit(text) === Number(digit);

/** Where a field holds digits only, the letters recognition takes for digits. */
const DIGIT_FOR: Readonly<Record<string, string>> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8', T: '7' };
const digits = (text: string): string => [...text].map(char => DIGIT_FOR[char] ?? char).join('');

/** A line as recognition wrote it, made into MRZ characters: upper case, no spaces, `<` for its look-alikes. */
export function cleanMrzLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/[«‹＜([{]/g, '<')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9<]/g, '');
}

const names = (field: string): { surname: string; givenNames: string } => {
  const [surname = '', ...rest] = field.replace(/<+$/, '').split('<<');
  const clean = (part: string) => part.replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  return { surname: clean(surname), givenNames: clean(rest.join(' ')) };
};

function day(yymmdd: string, century: 'birth' | 'expiry', now: number): Day | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const thisYear = new Date(now).getUTCFullYear();
  let year: number;
  if (century === 'birth') year = 2000 + yy > thisYear ? 1900 + yy : 2000 + yy;
  else year = 2000 + yy > thisYear + 50 ? 1900 + yy : 2000 + yy;
  const value = `${year}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
  if (!DAY_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return date.getUTCMonth() + 1 === Number(yymmdd.slice(2, 4)) && date.getUTCDate() === Number(yymmdd.slice(4, 6)) ? value : null;
}

const sexOf = (char: string | undefined): 'F' | 'M' | 'X' => (char === 'F' ? 'F' : char === 'M' ? 'M' : 'X');
const trimFiller = (text: string): string => text.replace(/<+$/, '').replace(/</g, '');

/** What a paper is, from its document code: P a passport; a residence permit (France's `IR`, `AR`…); else an identity card. */
function kindOf(code: string, issuingState: string): PaperKind {
  if (code.startsWith('P')) return 'passport';
  if (issuingState === 'FRA' && (code === 'IR' || code === 'AR' || code === 'TS')) return 'residencePermit';
  if (code.startsWith('I') || code.startsWith('A') || code.startsWith('C')) return 'idCard';
  return 'otherId';
}

function readTd3(l1: string, l2Raw: string, now: number): MrzReading {
  const l2 = l2Raw.slice(0, 13) + digits(l2Raw.slice(13, 20)) + l2Raw[20] + digits(l2Raw.slice(21, 28)) + l2Raw.slice(28, 43) + digits(l2Raw.slice(43));
  const code = l1.slice(0, 2).replace(/<$/, '');
  const issuingState = trimFiller(l1.slice(2, 5));
  const checked =
    holds(l2.slice(0, 9), l2[9]) &&
    holds(l2.slice(13, 19), l2[19]) &&
    holds(l2.slice(21, 27), l2[27]) &&
    holds(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43), l2[43]);
  return {
    format: 'td3',
    kind: kindOf(code, issuingState),
    issuingState,
    number: trimFiller(l2.slice(0, 9)),
    ...names(l1.slice(5)),
    nationality: trimFiller(l2.slice(10, 13)),
    birthDate: day(l2.slice(13, 19), 'birth', now),
    sex: sexOf(l2[20]),
    expiresOn: day(l2.slice(21, 27), 'expiry', now),
    issuedOn: null,
    checked,
  };
}

function readTd1(l1Raw: string, l2Raw: string, l3: string, now: number): MrzReading {
  const l1 = l1Raw;
  const l2 = digits(l2Raw.slice(0, 7)) + l2Raw[7] + digits(l2Raw.slice(8, 15)) + l2Raw.slice(15, 29) + digits(l2Raw.slice(29));
  const code = l1.slice(0, 2).replace(/<$/, '');
  const issuingState = trimFiller(l1.slice(2, 5));
  // A number longer than nine runs on into the optional data, its check digit after it (`<` in its place).
  let number = l1.slice(5, 14);
  let numberChecked = holds(number, l1[14]);
  if (l1[14] === '<') {
    const rest = l1.slice(15, 30).replace(/<+$/, '');
    number += rest.slice(0, -1);
    numberChecked = holds(number, rest.at(-1));
  }
  const checked =
    numberChecked && holds(l2.slice(0, 6), l2[6]) && holds(l2.slice(8, 14), l2[14]) && holds(l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29), l2[29]);
  return {
    format: 'td1',
    kind: kindOf(code, issuingState),
    issuingState,
    number: trimFiller(number),
    ...names(l3),
    nationality: trimFiller(l2.slice(15, 18)),
    birthDate: day(l2.slice(0, 6), 'birth', now),
    sex: sexOf(l2[7]),
    expiresOn: day(l2.slice(8, 14), 'expiry', now),
    issuedOn: null,
    checked,
  };
}

function readTd2(l1: string, l2Raw: string, now: number): MrzReading {
  const l2 = l2Raw.slice(0, 13) + digits(l2Raw.slice(13, 20)) + l2Raw[20] + digits(l2Raw.slice(21, 28)) + l2Raw.slice(28, 35) + digits(l2Raw.slice(35));
  const code = l1.slice(0, 2).replace(/<$/, '');
  const issuingState = trimFiller(l1.slice(2, 5));
  const checked =
    holds(l2.slice(0, 9), l2[9]) && holds(l2.slice(13, 19), l2[19]) && holds(l2.slice(21, 27), l2[27]) && holds(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 35), l2[35]);
  return {
    format: 'td2',
    kind: kindOf(code, issuingState),
    issuingState,
    number: trimFiller(l2.slice(0, 9)),
    ...names(l1.slice(5)),
    nationality: trimFiller(l2.slice(10, 13)),
    birthDate: day(l2.slice(13, 19), 'birth', now),
    sex: sexOf(l2[20]),
    expiresOn: day(l2.slice(21, 27), 'expiry', now),
    issuedOn: null,
    checked,
  };
}

/** France's card of 1988 to 2021: `IDFRA`, the surname, the office; then the number, the given names, the birth date. */
function readFrenchId(l1: string, l2Raw: string, now: number): MrzReading {
  const l2 = digits(l2Raw.slice(0, 4)) + l2Raw.slice(4, 12) + digits(l2Raw[12] ?? '') + l2Raw.slice(13, 27) + digits(l2Raw.slice(27, 34)) + l2Raw[34] + digits(l2Raw.slice(35));
  const number = l2.slice(0, 12);
  const checked = holds(number, l2[12]) && holds(l2.slice(27, 33), l2[33]) && holds(l1 + l2.slice(0, 35), l2[35]);
  // Its number starts with the year and month it was issued, always past.
  const issued = /^\d{4}/.test(number) ? day(`${number.slice(0, 4)}01`, 'birth', now) : null;
  return {
    format: 'frId',
    kind: 'idCard',
    issuingState: 'FRA',
    number: trimFiller(number),
    surname: l1.slice(5, 30).replace(/</g, ' ').replace(/\s+/g, ' ').trim(),
    givenNames: l2.slice(13, 27).replace(/<+$/, '').split('<<').map(part => part.replace(/</g, ' ').trim()).filter(Boolean).join(', '),
    nationality: 'FRA',
    birthDate: day(l2.slice(27, 33), 'birth', now),
    sex: sexOf(l2[34]),
    expiresOn: null,
    issuedOn: issued,
    checked,
  };
}

/** The zone read from its lines, cleaned; null when they are not one. */
export function readMrz(lines: readonly string[], now: number): MrzReading | null {
  const clean = lines.map(cleanMrzLine).filter(line => line.length > 0);
  if (clean.length === 3 && clean.every(line => line.length === 30)) return readTd1(clean[0]!, clean[1]!, clean[2]!, now);
  if (clean.length !== 2) return null;
  const [l1, l2] = clean as [string, string];
  if (l1.length === 44 && l2.length === 44 && l1.startsWith('P')) return readTd3(l1, l2, now);
  if (l1.length === 36 && l2.length === 36) {
    const td2 = readTd2(l1, l2, now);
    if (!l1.startsWith('IDFRA') || td2.checked) return td2;
    // France's old card shares TD2's size: whichever checks hold, else its own when its number starts with a month.
    const french = readFrenchId(l1, l2, now);
    return french.checked || /^\d{4}/.test(l2) ? french : td2;
  }
  return null;
}

/**
 * The zone found in a page's recognized text: the run of two or three lines, at its foot, that read
 * as one. Lines a character too long or short (a `<` lost or doubled) are not guessed at.
 */
export function findMrz(text: string, now: number): MrzReading | null {
  const lines = text
    .split(/\r?\n/)
    .map(cleanMrzLine)
    .filter(line => line.length >= 28 && (line.match(/</g)?.length ?? 0) >= 2);
  let best: MrzReading | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    for (const count of [3, 2]) {
      if (i - count + 1 < 0) continue;
      const reading = readMrz(lines.slice(i - count + 1, i + 1), now);
      if (reading?.checked) return reading;
      if (reading && !best) best = reading;
    }
  }
  return best;
}
