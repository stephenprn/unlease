/**
 * Phone numbers: kept as typed, read as digits to call, to compare and to open WhatsApp. WhatsApp
 * needs the international form (`https://wa.me/33612345678`); a national number (`06 12 34 56 78`)
 * takes the calling code of the person's « Indicatif par défaut » (Réglages; the device's region
 * until one is chosen), as the phone's own dialer does. The contact form picks a number's code beside
 * it and writes it with its `+` (`numberParts`, `composeNumber`); a contact's page shows and dials
 * every number with its code (`shownNumber`, `dialNumber`).
 */
import type { Contact, PhoneEntry } from '../models/contacts';

/** Calling codes of the regions people most likely keep numbers from; a number in another country is typed with its `+`. */
export const CALLING_CODES: Readonly<Record<string, string>> = {
  FR: '33', BE: '32', CH: '41', LU: '352', MC: '377', DE: '49', AT: '43', NL: '31', GB: '44', IE: '353', ES: '34', PT: '351', IT: '39',
  DK: '45', SE: '46', NO: '47', FI: '358', IS: '354', PL: '48', CZ: '420', SK: '421', HU: '36', RO: '40', BG: '359', GR: '30', HR: '385',
  SI: '386', RS: '381', TR: '90', UA: '380', RU: '7', IL: '972', MA: '212', DZ: '213', TN: '216', SN: '221', CI: '225', CM: '237',
  US: '1', CA: '1', MX: '52', BR: '55', AR: '54', CL: '56', CO: '57', PE: '51', AU: '61', NZ: '64', JP: '81', KR: '82', CN: '86',
  IN: '91', SG: '65', HK: '852', TW: '886', TH: '66', VN: '84', PH: '63', ZA: '27', NG: '234', EG: '20', AE: '971', SA: '966',
  RE: '262', GP: '590', MQ: '596', GF: '594', NC: '687', PF: '689',
};

/** Regions whose national numbers start with a 0 that the international form keeps (Italy's landlines). */
const KEEPS_ZERO = new Set(['IT', 'SM', 'VA']);
/** Regions where a national number starts with 1 (the North American plan's trunk prefix). */
const TRUNK_ONE = new Set(['US', 'CA']);

/** The region of a language tag (`fr-FR` -> `FR`, `en-US` -> `US`), or null for a tag without one. */
export function regionOf(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const parts = tag.replace('_', '-').split('-');
  const region = parts.slice(1).find(part => /^[A-Za-z]{2}$/.test(part));
  return region ? region.toUpperCase() : null;
}

/**
 * The number as a dialer reads it: digits, a leading `+`, `*` and `#` (`00` becomes `+`). In an
 * international number the trunk prefix some write in brackets is left out (`+33 (0)6…` -> `+336…`).
 */
export function dialable(number: string): string {
  const typed = number.trim();
  const plus = typed.startsWith('+');
  const trimmed = plus || typed.startsWith('00') ? typed.replace(/\(\s*0\s*\)/g, '') : typed;
  const digits = trimmed.replace(/[^0-9*#]/g, '');
  if (plus) return `+${digits}`;
  if (digits.startsWith('00') && digits.length > 4) return `+${digits.slice(2)}`;
  return digits;
}

/**
 * What a call dials: the international form (`+33612345678`) when it can be known, a national number
 * taking `region`'s code (« Indicatif par défaut »), so it reaches the person from abroad too; else
 * the number as a dialer reads it (a short number, `*123#`).
 */
export function dialNumber(number: string, region: string | null = null): string {
  const international = internationalDigits(number, region);
  return international ? `+${international}` : dialable(number);
}

/** The `tel:` address that calls it, as `dialNumber` dials it; null for a number with no digit. */
export function telHref(number: string, region: string | null = null): string | null {
  const digits = dialNumber(number, region);
  return /[0-9]/.test(digits) ? `tel:${digits.replace(/#/g, '%23')}` : null;
}

/** The `sms:` address that writes to it, as `dialNumber` dials it; null for a number with no digit. */
export function smsHref(number: string, region: string | null = null): string | null {
  const digits = dialNumber(number, region);
  return /^\+?[0-9]+$/.test(digits) ? `sms:${digits}` : null;
}

/**
 * The international digits, without the `+` (`33612345678`): as typed when it starts with `+` or
 * `00`, else with the region's calling code in place of the national prefix. Null when it cannot be
 * known (a national number and no region, a short code).
 */
export function internationalDigits(number: string, region: string | null): string | null {
  const digits = dialable(number);
  if (!/^\+?[0-9]+$/.test(digits)) return null;
  if (digits.startsWith('+')) return digits.length >= 8 ? digits.slice(1) : null;
  if (digits.length < 6 || !region) return null;
  const code = CALLING_CODES[region.toUpperCase()];
  if (!code) return null;
  if (TRUNK_ONE.has(region.toUpperCase())) {
    const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    // No area code starts with 0 or 1: such a number is another country's, typed without its code.
    return national.length === 10 && /^[2-9]/.test(national) ? `1${national}` : null;
  }
  const national = KEEPS_ZERO.has(region.toUpperCase()) ? digits : digits.replace(/^0/, '');
  return `${code}${national}`;
}

/** WhatsApp's chat with this number (`https://wa.me/<digits>`); null when its international form cannot be known. */
export function whatsappUrl(number: string, region: string | null): string | null {
  const digits = internationalDigits(number, region);
  return digits ? `https://wa.me/${digits}` : null;
}

// ── a number's country, in the form and on the page ──────────────────────────

/** The regions of each calling code, in `CALLING_CODES`' order (`1` -> US, CA). */
const REGIONS_OF_CODE: ReadonlyMap<string, readonly string[]> = (() => {
  const regions = new Map<string, string[]>();
  for (const [region, code] of Object.entries(CALLING_CODES)) regions.set(code, [...(regions.get(code) ?? []), region]);
  return regions;
})();

/** A calling code is one to three digits. */
const LONGEST_CODE = 3;

/** A number as the contact form shows it: its country, picked beside it, and the rest, typed in its field. */
export interface NumberParts {
  /** The country whose calling code it takes; null for none (a code this list does not know, or none chosen). */
  readonly region: string | null;
  /** The number after its code (`6 12 34 56 78`), or as typed when it has none. */
  readonly rest: string;
}

/**
 * A stored number split for the form: an international one (`+33 6 12 34 56 78`, `0033…`) by its
 * calling code (the country `fallback` names when it shares the code, as Canada shares the United
 * States'), the rest as typed after it; a national one (`06 12 34 56 78`) and an empty one take
 * `fallback`, the « Indicatif par défaut ». An unknown code leaves the whole number in its field.
 */
export function numberParts(number: string, fallback: string | null): NumberParts {
  const typed = number.trim();
  const prefix = typed.startsWith('+') ? 1 : /^00[1-9]/.test(typed) ? 2 : 0;
  if (prefix === 0) return { region: fallback, rest: typed };
  const digits = typed.slice(prefix).replace(/[^0-9]/g, '');
  for (let length = LONGEST_CODE; length >= 1; length -= 1) {
    const regions = REGIONS_OF_CODE.get(digits.slice(0, length));
    if (!regions) continue;
    // The rest begins after the code's last digit, its separators left out.
    let at = prefix;
    for (let seen = 0; seen < length; at += 1) if (/[0-9]/.test(typed[at]!)) seen += 1;
    const region = fallback && regions.includes(fallback) ? fallback : regions[0]!;
    return { region, rest: typed.slice(at).replace(/^[\s.\-/)]+/, '') };
  }
  return { region: null, rest: typed };
}

/**
 * The number a contact form writes from its parts: `rest` with `region`'s calling code in place of
 * its trunk prefix (`FR`, `06 12 34 56 78` -> `+33 6 12 34 56 78`; Italy keeps its 0), the rest as
 * typed. Kept as typed when it already says its code (`+44…`, `0044…`), when no country is picked,
 * and when its international form cannot be known (a short number, `*123#`).
 */
export function composeNumber(region: string | null, rest: string): string {
  const typed = rest.trim();
  if (!typed || !region || typed.startsWith('+') || typed.startsWith('00')) return typed;
  const code = CALLING_CODES[region.toUpperCase()];
  if (!code || !internationalDigits(typed, region)) return typed;
  let national = typed.replace(/^\(\s*0\s*\)\s*/, '');
  if (TRUNK_ONE.has(region.toUpperCase())) national = national.replace(/^1(?=[\s.\-(]*[2-9])[\s.-]*/, '');
  else if (!KEEPS_ZERO.has(region.toUpperCase())) national = national.replace(/^0[\s.-]*/, '');
  return `+${code} ${national}`;
}

/**
 * The number a contact form writes for a row that opened as `opened` (its stored number and its
 * parts): as stored while its code and its rest are as they opened, so a number nobody touched is
 * never rewritten; else `composeNumber` (a new row, a number edited, a code picked).
 */
export function writtenNumber(opened: (NumberParts & { readonly number: string }) | undefined, region: string | null, rest: string): string {
  if (opened && opened.region === region && opened.rest === rest) return opened.number;
  return composeNumber(region, rest);
}

/**
 * The number as a contact's page shows it: with its calling code (`+33 6 12 34 56 78`), a national
 * one taking `region`'s (« Indicatif par défaut »), `00` written `+`; as typed when its code cannot
 * be known (a short number, no default).
 */
export function shownNumber(number: string, region: string | null): string {
  const typed = number.trim();
  if (/^00[1-9]/.test(typed) && internationalDigits(typed, null)) return `+${typed.slice(2)}`;
  return composeNumber(region, typed);
}

/**
 * The digits numbers are first grouped by: the last nine, which leave out the country and the trunk
 * prefix. Two numbers in one group are the same only when `samePhone` says so.
 */
export function phoneKey(number: string): string {
  const digits = dialable(number).replace(/[^0-9]/g, '');
  return digits.length > 9 ? digits.slice(-9) : digits;
}

/**
 * The same number, however it was typed: `06 12 34 56 78` and `+33 6 12 34 56 78` in France. When
 * both say their country (with `+` or `00`, or a national number in `region`, the person's « Pays de
 * vos numéros »), the whole international number decides, so `+34 612 345 678` is never
 * `+33 6 12 34 56 78`; else their last nine digits.
 */
export function samePhone(a: string, b: string, region: string | null = null): boolean {
  const ka = phoneKey(a);
  if (ka.length < 6 || ka !== phoneKey(b)) return false;
  const ia = internationalDigits(a, region);
  const ib = internationalDigits(b, region);
  return !ia || !ib || ia === ib;
}

const hasDigits = (entry: PhoneEntry): boolean => /[0-9]/.test(entry.number);

/** The number a quick call dials: the first mobile, else the main one, else the first. */
export function callNumber(contact: Pick<Contact, 'phones'>): PhoneEntry | null {
  const phones = contact.phones.filter(hasDigits);
  return phones.find(entry => entry.kind === 'mobile') ?? phones.find(entry => entry.kind === 'main') ?? phones[0] ?? null;
}

/** The number WhatsApp is opened on: the first mobile, else the first. */
export function whatsappNumber(contact: Pick<Contact, 'phones'>): PhoneEntry | null {
  const phones = contact.phones.filter(hasDigits);
  return phones.find(entry => entry.kind === 'mobile') ?? phones[0] ?? null;
}

/** The person's contact whose number this is (a call's caller, a duplicate), live ones only; `region` as `samePhone`'s. */
export function contactOfNumber<T extends Pick<Contact, 'phones' | 'deletedAt' | 'trashedAt'>>(contacts: Iterable<T>, number: string, region: string | null = null): T | null {
  for (const contact of contacts) {
    if (contact.deletedAt !== null || contact.trashedAt !== null) continue;
    if (contact.phones.some(entry => samePhone(entry.number, number, region))) return contact;
  }
  return null;
}
