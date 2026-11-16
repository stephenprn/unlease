/**
 * « Nettoyer les contacts »: tools that tidy the address book, the same on both clients. Each tool
 * reads the live contacts (never one in the bin, nor one merged into another) and lists what it
 * would change, a finding each: the value as it is, what it becomes, why, and whether it is safe
 * enough to be ticked at once. Nothing is written by finding: the ticked findings become one batch
 * (`cleanupWrites`), which the clients write with its undo. The duplicates are a tool of the place
 * too, their own screen (`duplicates.ts`).
 *
 * - `countryCodes`: numbers written without their country code (06 12 34 56 78), written with the
 *   code of a country the person picks (+33 6 12 34 56 78); those whose length does not fit that
 *   country are listed unticked.
 * - `numbers`: numbers written in their own ways (dots, 0033, no space) written one way, and the
 *   same number twice in a contact kept once.
 * - `names`: names in capitals or in lower case, extra spaces, an e-mail or a number in place of a
 *   name, a whole name in the first name (unticked: only the person knows where it ends).
 * - `emails`: addresses in capitals, with spaces or `mailto:`, a known typo in the domain (unticked),
 *   one that is not an address (no fix: the contact opens), the same address twice in a contact.
 * - `empty`: contacts with no name, no number and no e-mail, to the bin.
 */
import { localized, t, tx, type Params } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import type { Fields } from '@unlease/core/sync/record';
import type { GlyphName } from '@unlease/design/glyphs';
import { CONTACT_LIMITS, isLive, type Contact, type EmailEntry, type PhoneEntry } from '../models/contacts';
import { isEmailAddress } from './checks';
import { sortContacts, splitName, UNNAMED } from './names';
import { CALLING_CODES, composeNumber, dialable, internationalDigits, numberParts, samePhone } from './phones';

// ── the tools ───────────────────────────────────────────────────────────────

/** Every tool of the place, in its order: the duplicates first (their own screen), then those that fix. */
export const CLEANUP_TOOLS = ['duplicates', 'countryCodes', 'numbers', 'names', 'emails', 'empty'] as const;
export type CleanupTool = (typeof CLEANUP_TOOLS)[number];
/** The tools whose findings are fixed here, ticked and applied in one batch. */
export type FixingTool = Exclude<CleanupTool, 'duplicates'>;
export const FIXING_TOOLS: readonly FixingTool[] = ['countryCodes', 'numbers', 'names', 'emails', 'empty'];

export const isFixingTool = (value: unknown): value is FixingTool => typeof value === 'string' && (FIXING_TOOLS as readonly string[]).includes(value);

/** The place's own words, in the interface's language as they are read. */
export const CLEANUP_WORDS = localized({
  title: tx('Clean up contacts'),
  lead: tx('Tools that tidy your address book. Each one shows every change before it is made, and the slip takes it back.'),
  nothing: tx('Nothing to fix'),
  selectAll: tx('Select all'),
  selectNone: tx('Select none'),
  allFine: tx('All tidy'),
  regionLabel: tx('Country of these numbers'),
  regionNone: tx('Pick the country these numbers belong to: their code is written before them.'),
  regionMissing: tx('Which country are these numbers from?'),
  ignore: tx('Ignore'),
});

/** A tool as the place lists it and its page heads it. */
export interface CleanupToolWords {
  readonly glyph: GlyphName;
  readonly title: string;
  /** What it does, in a sentence, at its page's head. */
  readonly lead: string;
  /** What its page says when there is nothing to fix. */
  readonly empty: string;
}

export const CLEANUP_TOOL_WORDS: Readonly<Record<CleanupTool, CleanupToolWords>> = {
  duplicates: {
    glyph: 'copy',
    title: tx('Duplicates'),
    lead: tx('Contacts with the same email, number or name. Merging keeps the first, completes it with what the others have besides, and moves the others to the bin.'),
    empty: tx('Everyone appears once. After an import, come back here: duplicate contacts gather here.'),
  },
  countryCodes: {
    glyph: 'globe',
    title: tx('Country codes'),
    lead: tx('A number written without its country code (06 12 34 56 78) only reaches the person from that country. Written with it (+33 6 12 34 56 78), it works from anywhere, in WhatsApp and on any phone.'),
    empty: tx('Every number is written with its country code.'),
  },
  numbers: {
    glyph: 'phone',
    title: tx('Number formatting'),
    lead: tx('Numbers written each their own way (dots, 0033, no spaces) written the same way; the same number twice in a contact kept once.'),
    empty: tx('Every number is written the same way.'),
  },
  names: {
    glyph: 'person',
    title: tx('Names'),
    lead: tx('Names in capitals or in lower case, extra spaces, an e-mail or a number in place of a name, a whole name in the first name.'),
    empty: tx('Every name is written properly.'),
  },
  emails: {
    glyph: 'email',
    title: tx('E-mail addresses'),
    lead: tx('Addresses in capitals or with spaces, a typo in the domain, the same address twice in a contact, and those that are not addresses at all.'),
    empty: tx('Every e-mail address reads as one.'),
  },
  empty: {
    glyph: 'trash',
    title: tx('Empty contacts'),
    lead: tx('Contacts with no name, no number and no e-mail address: they go to the bin, where they wait a week.'),
    empty: tx('Every contact holds a name, a number or an e-mail address.'),
  },
};

/** A tool's state in one line, on the place's list: « 12 numbers without a country code », or « Nothing to fix ». */
export function cleanupStateLine(tool: CleanupTool, count: number): string {
  if (count === 0) return t(CLEANUP_WORDS.nothing);
  switch (tool) {
    case 'duplicates':
      return plural(count, 'group of duplicates', 'groups of duplicates');
    case 'countryCodes':
      return plural(count, 'number without a country code', 'numbers without a country code');
    case 'numbers':
      return plural(count, 'number to tidy', 'numbers to tidy');
    case 'names':
      return plural(count, 'name to tidy', 'names to tidy');
    case 'emails':
      return plural(count, 'e-mail address to tidy', 'e-mail addresses to tidy');
    case 'empty':
      return plural(count, 'empty contact', 'empty contacts');
  }
}

/** The place's own row in Réglages: everything there is to fix, or nothing. */
export function cleanupSummaryLine(count: number): string {
  return count === 0 ? t('Nothing to fix: your contacts are tidy.') : plural(count, 'thing to fix', 'things to fix');
}

/** The slip once fixed: « 12 numbers completed », « 3 contacts moved to the bin ». */
export function cleanupDoneLine(tool: FixingTool, count: number): string {
  switch (tool) {
    case 'countryCodes':
      return plural(count, 'number completed', 'numbers completed');
    case 'empty':
      return plural(count, 'contact moved to the bin', 'contacts moved to the bin');
    default:
      return plural(count, 'fix made', 'fixes made');
  }
}

/** « Corriger 12 »: the page's one primary action. */
export const fixWords = (count: number): string => (count === 0 ? t('Fix') : t('Fix {count}', { count }));

// ── a finding ───────────────────────────────────────────────────────────────

/** A sentence the client translates where it is shown (the findings are kept while the language changes). */
export interface Words {
  readonly key: string;
  readonly params?: Params;
}

/** A value as typed, or a sentence saying what stands there (« Supprimé », « Dans la corbeille »). */
export type Shown = string | Words;

/** A shown value in the interface's language. */
export const shownText = (shown: Shown): string => (typeof shown === 'string' ? shown : t(shown.key, shown.params));

/** What one finding changes in its contact; composed with the others ticked on it (`cleanupWrites`). */
export type CleanupEdit =
  | { readonly kind: 'phone'; readonly entryId: string; readonly number: string }
  | { readonly kind: 'dropPhone'; readonly entryId: string }
  | { readonly kind: 'email'; readonly entryId: string; readonly address: string }
  | { readonly kind: 'dropEmail'; readonly entryId: string }
  | { readonly kind: 'name'; readonly firstName: string; readonly lastName: string; readonly company: string; readonly addEmail?: string; readonly addPhone?: string }
  | { readonly kind: 'trash' };

export interface CleanupFinding {
  /** Unique within its tool, and the same while the contact does not change: the tick's key. */
  readonly key: string;
  readonly tool: FixingTool;
  readonly contactId: string;
  readonly before: Shown;
  /** What it becomes; null when it cannot be fixed here (only the person can: their contact opens). */
  readonly after: Shown | null;
  /** Why it is listed, or what to check before ticking it. */
  readonly why: Words | null;
  /** Safe enough to be ticked at once. */
  readonly ticked: boolean;
  readonly edit: CleanupEdit | null;
}

/** A run of a value: kept from the other value, or changed (what a row marks). */
export interface DiffPart {
  readonly text: string;
  readonly changed: boolean;
}

/** The longest value compared letter by letter; past it, only the common start and end are kept. */
const DIFF_MOST = 120;

/**
 * `to` in runs, those not in `from` marked: « lucas girard » -> « Lucas Girard » marks the L and the
 * G alone, « 06 12… » -> « +33 6 12… » the « +33 » and nothing of the number (the longest common
 * subsequence, letter by letter). Read the other way (`diffParts(after, before)`), it marks what goes.
 */
export function diffParts(from: string, to: string): DiffPart[] {
  const a = [...from];
  const b = [...to];
  const kept = new Array<boolean>(b.length).fill(false);
  if (a.length <= DIFF_MOST && b.length <= DIFF_MOST) {
    // lengths[i][j]: the longest common subsequence of a[i…] and b[j…].
    const lengths = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) lengths[i]![j] = a[i] === b[j] ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        kept[j] = true;
        i += 1;
        j += 1;
      } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) i += 1;
      else j += 1;
    }
  } else {
    let head = 0;
    while (head < a.length && head < b.length && a[head] === b[head]) kept[head++] = true;
    for (let tail = 1; tail <= Math.min(a.length, b.length) - head && a[a.length - tail] === b[b.length - tail]; tail += 1) kept[b.length - tail] = true;
  }
  const parts: DiffPart[] = [];
  b.forEach((char, index) => {
    const changed = !kept[index];
    const last = parts[parts.length - 1];
    if (last && last.changed === changed) parts[parts.length - 1] = { text: last.text + char, changed };
    else parts.push({ text: char, changed });
  });
  return parts;
}

const words = (key: string, params?: Params): Words => (params ? { key, params } : { key });

/** What a finding says (its `why`, a sentence in place of a value): keys, translated where shown. */
const WHY = {
  sameNumber: tx('Already in this contact.'),
  sameAddress: tx('Already in this contact.'),
  noDigit: tx('No digit: this is not a number.'),
  checkLength: tx('Its length does not fit a number with +{code}: check it before adding the code.'),
  noFit: tx('Too short or too long for a number with +{code}: open the contact to check it.'),
  otherPlan: tx('Numbers of this country are written in their own way: open the contact to add its code.'),
  inCapitals: tx('In capitals.'),
  inLowerCase: tx('In lower case.'),
  spaces: tx('Extra spaces.'),
  emailName: tx('An e-mail address in place of a name: it goes with the e-mail addresses.'),
  numberName: tx('A number in place of a name: it goes with the numbers.'),
  split: tx('First name “{first}”, last name “{last}”: check where the first name ends.'),
  typo: tx('A typo in “{domain}”?'),
  notAddress: tx('Not a full e-mail address: open the contact to correct it.'),
  holdsMore: tx('It still holds a note, an address, a birthday or a photo: check it first.'),
  emptyShown: tx('No name, no number, no e-mail'),
  removed: tx('Removed'),
  toBin: tx('To the bin'),
} as const;

/** The live contacts, in the list's order by first name. */
const live = (contacts: Iterable<Contact>): Contact[] => sortContacts([...contacts].filter(contact => isLive(contact) && contact.mergedInto === null), 'firstName');

// ── numbers ─────────────────────────────────────────────────────────────────

/**
 * How a country writes its national numbers, its trunk prefix included: `0` (dropped once the code
 * is written), none, `keep` (Italy's, kept), or `other` (a trunk prefix that is not a single 0:
 * Hungary's 06, Russia's 8, a carrier's code); `lengths` the digits a number holds as written at home.
 */
interface NationalPlan {
  readonly trunk: '0' | 'none' | 'keep' | 'other';
  readonly lengths?: readonly [number, number];
}

const PLANS: Readonly<Record<string, NationalPlan>> = {
  FR: { trunk: '0', lengths: [10, 10] }, RE: { trunk: '0', lengths: [10, 10] }, GP: { trunk: '0', lengths: [10, 10] }, MQ: { trunk: '0', lengths: [10, 10] }, GF: { trunk: '0', lengths: [10, 10] },
  NC: { trunk: 'none', lengths: [6, 6] }, PF: { trunk: 'none', lengths: [8, 8] },
  BE: { trunk: '0', lengths: [9, 10] }, CH: { trunk: '0', lengths: [10, 10] }, LU: { trunk: 'none', lengths: [6, 11] }, MC: { trunk: 'none', lengths: [8, 9] },
  DE: { trunk: '0', lengths: [6, 13] }, AT: { trunk: '0', lengths: [7, 14] }, NL: { trunk: '0', lengths: [10, 10] }, GB: { trunk: '0', lengths: [10, 11] }, IE: { trunk: '0', lengths: [8, 11] },
  ES: { trunk: 'none', lengths: [9, 9] }, PT: { trunk: 'none', lengths: [9, 9] }, IT: { trunk: 'keep', lengths: [6, 11] },
  DK: { trunk: 'none', lengths: [8, 8] }, SE: { trunk: '0', lengths: [8, 10] }, NO: { trunk: 'none', lengths: [8, 8] }, FI: { trunk: '0', lengths: [6, 11] }, IS: { trunk: 'none', lengths: [7, 7] },
  PL: { trunk: 'none', lengths: [9, 9] }, CZ: { trunk: 'none', lengths: [9, 9] }, SK: { trunk: '0', lengths: [10, 10] }, HU: { trunk: 'other' }, RO: { trunk: '0', lengths: [10, 10] },
  BG: { trunk: '0', lengths: [8, 10] }, GR: { trunk: 'none', lengths: [10, 10] }, HR: { trunk: '0', lengths: [8, 10] }, SI: { trunk: '0', lengths: [9, 9] }, RS: { trunk: '0', lengths: [8, 10] },
  TR: { trunk: '0', lengths: [11, 11] }, UA: { trunk: '0', lengths: [10, 10] }, RU: { trunk: 'other' }, IL: { trunk: '0', lengths: [9, 10] },
  MA: { trunk: '0', lengths: [10, 10] }, DZ: { trunk: '0', lengths: [9, 10] }, TN: { trunk: 'none', lengths: [8, 8] }, SN: { trunk: 'none', lengths: [9, 9] }, CI: { trunk: 'none', lengths: [10, 10] }, CM: { trunk: 'none', lengths: [9, 9] },
  MX: { trunk: 'none', lengths: [10, 10] }, BR: { trunk: 'other' }, AR: { trunk: 'other' }, CL: { trunk: 'none', lengths: [9, 9] }, CO: { trunk: 'none', lengths: [10, 10] }, PE: { trunk: 'none', lengths: [9, 9] },
  AU: { trunk: '0', lengths: [10, 10] }, NZ: { trunk: '0', lengths: [9, 11] }, JP: { trunk: '0', lengths: [10, 11] }, KR: { trunk: '0', lengths: [9, 11] }, CN: { trunk: '0', lengths: [11, 12] },
  IN: { trunk: '0', lengths: [11, 11] }, SG: { trunk: 'none', lengths: [8, 8] }, HK: { trunk: 'none', lengths: [8, 8] }, TW: { trunk: '0', lengths: [9, 10] }, TH: { trunk: '0', lengths: [9, 10] },
  VN: { trunk: '0', lengths: [10, 11] }, PH: { trunk: '0', lengths: [11, 11] }, ZA: { trunk: '0', lengths: [10, 10] }, NG: { trunk: '0', lengths: [11, 11] }, EG: { trunk: '0', lengths: [10, 11] },
  AE: { trunk: '0', lengths: [9, 10] }, SA: { trunk: '0', lengths: [10, 10] },
};

/** Regions whose national numbers start with 1 for the trunk (the North American plan): `internationalDigits` decides. */
const NORTH_AMERICA = new Set(['US', 'CA']);

/** Whether a national number (digits as typed) reads as one of `region`'s. */
export function fitsRegion(digits: string, region: string): boolean {
  const upper = region.toUpperCase();
  if (NORTH_AMERICA.has(upper)) return internationalDigits(digits, upper) !== null;
  const plan = PLANS[upper];
  if (!plan?.lengths) return false;
  const [min, max] = plan.lengths;
  if (digits.length < min || digits.length > max) return false;
  switch (plan.trunk) {
    case '0':
      return /^0[1-9]/.test(digits);
    case 'none':
      return /^[1-9]/.test(digits);
    case 'keep':
      return /^[03]/.test(digits);
    default:
      return false;
  }
}

/** Digits in groups of `sizes`, the last group taking what is left. */
function groups(digits: string, sizes: readonly number[]): string {
  const parts: string[] = [];
  let at = 0;
  for (const size of sizes) {
    if (at >= digits.length) break;
    parts.push(digits.slice(at, at + size));
    at += size;
  }
  if (at < digits.length) parts.push(digits.slice(at));
  return parts.join(' ');
}

/**
 * A country's national significant number (no code, no trunk prefix) in its usual groups: France's
 * `6 12 34 56 78`, Switzerland's `79 123 45 67`, the United States' `415 555 0123`; null where its
 * grouping is not known here (the number keeps its own, its separators made spaces).
 */
function groupedNational(region: string, digits: string): string | null {
  switch (region) {
    case 'FR':
    case 'RE':
    case 'GP':
    case 'MQ':
    case 'GF':
      return digits.length === 9 ? groups(digits, [1, 2, 2, 2, 2]) : null;
    case 'MC':
      return digits.length === 8 ? groups(digits, [2, 2, 2, 2]) : null;
    case 'CH':
      return digits.length === 9 ? groups(digits, [2, 3, 2, 2]) : null;
    case 'BE':
      return digits.length === 9 && digits.startsWith('4') ? groups(digits, [3, 2, 2, 2]) : null;
    case 'ES':
      return digits.length === 9 ? groups(digits, [3, 2, 2, 2]) : null;
    case 'PT':
      return digits.length === 9 ? groups(digits, [3, 3, 3]) : null;
    case 'GB':
      return digits.length === 10 && digits.startsWith('7') ? groups(digits, [4, 6]) : null;
    case 'US':
    case 'CA':
      return digits.length === 10 ? groups(digits, [3, 3, 4]) : null;
    default:
      return null;
  }
}

/** Separators made single spaces: dots, dashes, slashes, brackets. */
const spaced = (text: string): string =>
  text
    .replace(/[.\-/()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * A number in the one written form, its country unchanged: an international one `+<code> <groups>`
 * (`0033…` and `+33 (0)6…` written `+33 6…`), a national one of `region` in its groups (`06 12 34 56
 * 78`), else its separators made spaces. A number with letters, `*` or `#` stays as typed.
 */
export function tidyNumber(number: string, region: string | null): string {
  const typed = number.trim().replace(/\s+/g, ' ');
  if (!/[0-9]/.test(typed) || /[a-zA-Z*#,;]/.test(typed)) return typed;
  const international = typed.startsWith('+') || /^00[1-9]/.test(typed);
  if (international) {
    const digits = internationalDigits(typed, null);
    if (!digits) return typed;
    const parts = numberParts(`+${digits}`, region);
    // A code this list does not know: its own groups, the `+` written.
    if (!parts.region) return `+${spaced(typed.replace(/\(\s*0\s*\)/g, '').replace(/^(\+|00)\s*/, ''))}`;
    const code = CALLING_CODES[parts.region]!;
    const national = digits.slice(code.length);
    const grouped = groupedNational(parts.region, national);
    if (grouped) return `+${code} ${grouped}`;
    // Its own groups after the code, the code apart.
    const rest = spaced(typed.replace(/\(\s*0\s*\)/g, '').replace(/^(\+|00)\s*/, '')).replace(new RegExp(`^${code}\\s*`), '');
    return rest ? `+${code} ${rest}` : `+${code}`;
  }
  const digits = typed.replace(/[^0-9]/g, '');
  const upper = region?.toUpperCase() ?? null;
  if (upper && fitsRegion(digits, upper)) {
    const plan = PLANS[upper];
    if (plan?.trunk === '0') {
      const grouped = groupedNational(upper, digits.slice(1));
      if (grouped) return `0${grouped}`;
    } else if (NORTH_AMERICA.has(upper) && digits.length === 10) {
      return groups(digits, [3, 3, 4]);
    } else {
      const grouped = groupedNational(upper, digits);
      if (grouped) return grouped;
    }
  }
  return spaced(typed);
}

/** The digits a number reaches, to make sure a tidy form calls the same one. */
const reach = (number: string, region: string | null): string => internationalDigits(number, region) ?? dialable(number);

/** A number to call: digits, no letters, no service code. */
const callable = (number: string): boolean => /[0-9]/.test(number) && !/[a-zA-Z*#]/.test(number);

/** A number written with its code (`+`, `00`). */
const hasCode = (number: string): boolean => /^\s*(\+|00[1-9])/.test(number);

/** The later entries of a contact that repeat an earlier one's number. */
function repeatedPhones(phones: readonly PhoneEntry[], region: string | null): Set<string> {
  const repeated = new Set<string>();
  phones.forEach((entry, index) => {
    if (phones.slice(0, index).some(earlier => !repeated.has(earlier.id) && samePhone(earlier.number, entry.number, region))) repeated.add(entry.id);
  });
  return repeated;
}

function findCountryCodes(contacts: readonly Contact[], region: string | null): CleanupFinding[] {
  if (!region) return [];
  const upper = region.toUpperCase();
  const code = CALLING_CODES[upper];
  if (!code) return [];
  const found: CleanupFinding[] = [];
  for (const contact of contacts) {
    for (const entry of contact.phones) {
      const typed = entry.number.trim();
      if (!callable(typed) || hasCode(typed)) continue;
      const digits = typed.replace(/[^0-9]/g, '');
      // A short number (a service's, a voicemail's) is the same from anywhere: never a country's.
      if (digits.length < 6) continue;
      const key = `countryCodes:${contact.id}:${entry.id}`;
      const plan = PLANS[upper];
      if (plan?.trunk === 'other') {
        found.push({ key, tool: 'countryCodes', contactId: contact.id, before: typed, after: null, why: words(WHY.otherPlan), ticked: false, edit: null });
        continue;
      }
      const composed = composeNumber(upper, typed);
      if (composed === typed || !hasCode(composed)) {
        found.push({ key, tool: 'countryCodes', contactId: contact.id, before: typed, after: null, why: words(WHY.noFit, { code }), ticked: false, edit: null });
        continue;
      }
      const after = tidyNumber(composed, upper);
      const fits = fitsRegion(digits, upper);
      found.push({ key, tool: 'countryCodes', contactId: contact.id, before: typed, after, why: fits ? null : words(WHY.checkLength, { code }), ticked: fits, edit: { kind: 'phone', entryId: entry.id, number: after } });
    }
  }
  return found;
}

function findNumbers(contacts: readonly Contact[], region: string | null): CleanupFinding[] {
  const found: CleanupFinding[] = [];
  for (const contact of contacts) {
    const repeated = repeatedPhones(contact.phones, region);
    for (const entry of contact.phones) {
      const typed = entry.number.trim();
      const key = `numbers:${contact.id}:${entry.id}`;
      if (repeated.has(entry.id)) {
        found.push({ key, tool: 'numbers', contactId: contact.id, before: typed, after: words(WHY.removed), why: words(WHY.sameNumber), ticked: true, edit: { kind: 'dropPhone', entryId: entry.id } });
        continue;
      }
      if (!/[0-9]/.test(typed)) {
        if (typed) found.push({ key, tool: 'numbers', contactId: contact.id, before: typed, after: words(WHY.removed), why: words(WHY.noDigit), ticked: false, edit: { kind: 'dropPhone', entryId: entry.id } });
        continue;
      }
      const after = tidyNumber(typed, region);
      if (after === entry.number) continue;
      // Only a form that calls the very same number.
      if (reach(after, region) !== reach(typed, region)) continue;
      found.push({ key, tool: 'numbers', contactId: contact.id, before: entry.number, after, why: null, ticked: true, edit: { kind: 'phone', entryId: entry.id, number: after } });
    }
  }
  return found;
}

// ── names ───────────────────────────────────────────────────────────────────

/** Words that stay in lower case inside a name: « Charles de Gaulle », « Ludwig van Beethoven ». */
const PARTICLES = new Set(['de', 'du', 'des', 'van', 'von', 'der', 'den', 'ten', 'ter', 'da', 'das', 'dos', 'di', 'del', 'della', 'y', 'zu', 'af']);
/** After « de »: « de la Fontaine », « de l’Isle »; « Le Pen » keeps its capital. */
const AFTER_DE = new Set(['la', 'le', 'les']);

const isLetter = (char: string): boolean => char.toLowerCase() !== char.toUpperCase();
const letters = (text: string): string[] => [...text].filter(isLetter);
const VOWELS = /[aeiouyàâäéèêëîïôöûüùÿæœáíóúãõåø]/i;

const capital = (word: string): string => {
  const chars = [...word];
  return chars.length === 0 ? '' : chars[0]!.toUpperCase() + chars.slice(1).join('');
};

/** One part of a word between hyphens: « o’brien » -> « O’Brien », « d’artagnan » -> « d’Artagnan », « mcdonald » -> « McDonald ». */
function casedPart(part: string, lowerParticle: boolean): string {
  const lower = part.toLowerCase();
  const apostrophe = /^([a-z])(['’])(.+)$/.exec(lower);
  if (apostrophe) {
    const [, prefix, mark, rest] = apostrophe;
    const head = prefix === 'd' && lowerParticle ? prefix : prefix!.toUpperCase();
    return `${head}${mark}${capital(rest!)}`;
  }
  const mc = /^mc(.+)$/.exec(lower);
  if (mc && mc[1]!.length > 1) return `Mc${capital(mc[1]!)}`;
  return capital(lower);
}

/**
 * A name written in capitals or in lower case, in its usual case: each word capitalized, the parts
 * of a hyphenated one too (« Jean-Pierre »), particles in lower case inside a name (« de la
 * Fontaine », « van Gogh »); `leading`: the field opens the whole name, so its first word keeps its
 * capital. A word in capitals with no vowel (initials: « JB ») stays so.
 */
export function casedName(name: string, leading: boolean): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      const first = leading && index === 0;
      if (word === word.toUpperCase() && letters(word).length > 1 && !VOWELS.test(word)) return word;
      if (!first && PARTICLES.has(lower)) return lower;
      if (!first && AFTER_DE.has(lower) && index > 0 && words[index - 1]!.toLowerCase() === 'de') return lower;
      return word
        .split('-')
        .map(part => casedPart(part, !first))
        .join('-');
    })
    .join(' ');
}

/** How a field's letters are written: all in capitals, all in lower case, or mixed (as typed: left alone). */
function caseOf(text: string): 'upper' | 'lower' | 'mixed' | 'none' {
  const all = letters(text);
  if (all.length < 2) return 'none';
  if (all.every(char => char === char.toUpperCase())) return 'upper';
  if (all.every(char => char === char.toLowerCase())) return 'lower';
  return 'mixed';
}

const collapsed = (text: string): string => text.trim().replace(/\s+/g, ' ');

/** A name that is a phone number: digits and separators, six digits or more. */
const isNumberName = (text: string): boolean => /^\+?[0-9][0-9\s.\-()/]*$/.test(text) && text.replace(/[^0-9]/g, '').length >= 6;
/** A name that is an e-mail address, with a domain that has its dot. */
const isEmailName = (text: string): boolean => isEmailAddress(text) && /@[^@]+\.[^@]+$/.test(text);

/** The name as the row shows it: the fields as typed, joined. */
const typedName = (first: string, last: string): string => [first, last].filter(part => part.trim()).join(' ');

function findNames(contacts: readonly Contact[], region: string | null): CleanupFinding[] {
  const found: CleanupFinding[] = [];
  for (const contact of contacts) {
    let first = collapsed(contact.firstName);
    let last = collapsed(contact.lastName);
    const company = collapsed(contact.company);
    const before = typedName(contact.firstName, contact.lastName) || contact.company;
    let why: Words | null = null;
    let ticked = true;
    let addEmail: string | undefined;
    let addPhone: string | undefined;
    const whole = typedName(first, last);
    if (whole && isEmailName(whole)) {
      const address = whole.toLowerCase();
      if (!contact.emails.some(entry => entry.address.trim().toLowerCase() === address)) addEmail = address;
      first = '';
      last = '';
      why = words(WHY.emailName);
    } else if (whole && isNumberName(whole)) {
      if (!contact.phones.some(entry => samePhone(entry.number, whole, region) || dialable(entry.number) === dialable(whole))) addPhone = whole;
      first = '';
      last = '';
      why = words(WHY.numberName);
    } else {
      const firstCase = caseOf(first);
      const lastCase = caseOf(last);
      if (firstCase === 'upper' || firstCase === 'lower') first = casedName(first, true);
      if (lastCase === 'upper' || lastCase === 'lower') last = casedName(last, !first);
      if (firstCase === 'upper' || lastCase === 'upper') {
        why = words(WHY.inCapitals);
        // One short word in capitals alone may be an acronym (« EDF », « IKEA »): offered, not ticked.
        if (!whole.includes(' ') && letters(whole).length <= 4) ticked = false;
      }
      else if (firstCase === 'lower' || lastCase === 'lower') why = words(WHY.inLowerCase);
      // A whole name in the first name: offered, never ticked (« Marie Claire » is one first name).
      const parts = first.split(' ');
      if (!last && parts.length >= 2 && parts.length <= 3 && parts.every(part => /^[\p{L}'’-]+$/u.test(part)) && !PARTICLES.has(parts[parts.length - 1]!.toLowerCase())) {
        const split = splitName(first);
        first = split.firstName;
        last = split.lastName;
        why = words(WHY.split, { first, last });
        ticked = false;
      }
    }
    const changed = first !== contact.firstName || last !== contact.lastName || company !== contact.company;
    if (!changed) continue;
    if (!why) why = words(WHY.spaces);
    const after = typedName(first, last) || company;
    found.push({
      key: `names:${contact.id}`,
      tool: 'names',
      contactId: contact.id,
      before,
      after: after || words(UNNAMED),
      why,
      ticked,
      edit: { kind: 'name', firstName: first, lastName: last, company, ...(addEmail ? { addEmail } : {}), ...(addPhone ? { addPhone } : {}) },
    });
  }
  return found;
}

// ── e-mails ─────────────────────────────────────────────────────────────────

/** Domains people often mistype, and the one they meant. */
const DOMAIN_TYPOS: Readonly<Record<string, string>> = {
  'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.fr': 'gmail.com', 'gmaill.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmial.fr': 'hotmail.fr', 'hotmal.fr': 'hotmail.fr',
  'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yahooo.fr': 'yahoo.fr', 'yaho.fr': 'yahoo.fr',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'outloo.com': 'outlook.com', 'outlok.fr': 'outlook.fr',
  'icloud.con': 'icloud.com', 'iclod.com': 'icloud.com', 'wanadoo.fe': 'wanadoo.fr', 'wanadou.fr': 'wanadoo.fr', 'orange.fe': 'orange.fr', 'oragne.fr': 'orange.fr', 'free.fe': 'free.fr', 'laposte.fe': 'laposte.net', 'sfr.fe': 'sfr.fr',
};

/** An address as typed, its wrapping and spaces taken off and in lower case: « Léa <LEA@Example.org> » -> « lea@example.org ». */
export function tidyEmail(address: string): string {
  let tidy = address.trim();
  const angled = /<([^<>]+@[^<>]+)>/.exec(tidy);
  if (angled) tidy = angled[1]!;
  return tidy
    .replace(/^mailto:/i, '')
    .replace(/\s+/g, '')
    .replace(/^[.,;:'"]+|[.,;:'"]+$/g, '')
    .toLowerCase();
}

function findEmails(contacts: readonly Contact[]): CleanupFinding[] {
  const found: CleanupFinding[] = [];
  for (const contact of contacts) {
    const seen = new Set<string>();
    for (const entry of contact.emails as readonly EmailEntry[]) {
      const key = `emails:${contact.id}:${entry.id}`;
      const typed = entry.address;
      const tidy = tidyEmail(typed);
      if (!tidy) continue;
      if (seen.has(tidy)) {
        found.push({ key, tool: 'emails', contactId: contact.id, before: typed.trim(), after: words(WHY.removed), why: words(WHY.sameAddress), ticked: true, edit: { kind: 'dropEmail', entryId: entry.id } });
        continue;
      }
      seen.add(tidy);
      if (!isEmailName(tidy)) {
        found.push({ key, tool: 'emails', contactId: contact.id, before: typed.trim(), after: null, why: words(WHY.notAddress), ticked: false, edit: null });
        continue;
      }
      const domain = tidy.slice(tidy.lastIndexOf('@') + 1);
      const meant = DOMAIN_TYPOS[domain];
      if (meant) {
        const after = `${tidy.slice(0, tidy.lastIndexOf('@'))}@${meant}`;
        seen.add(after);
        found.push({ key, tool: 'emails', contactId: contact.id, before: typed.trim(), after, why: words(WHY.typo, { domain }), ticked: false, edit: { kind: 'email', entryId: entry.id, address: after } });
        continue;
      }
      if (tidy !== typed) found.push({ key, tool: 'emails', contactId: contact.id, before: typed, after: tidy, why: null, ticked: true, edit: { kind: 'email', entryId: entry.id, address: tidy } });
    }
  }
  return found;
}

// ── empty contacts ──────────────────────────────────────────────────────────

function findEmpty(contacts: readonly Contact[]): CleanupFinding[] {
  const found: CleanupFinding[] = [];
  for (const contact of contacts) {
    const named = [contact.firstName, contact.lastName, contact.company, contact.jobTitle].some(part => part.trim());
    const reached = contact.phones.some(entry => /[0-9]/.test(entry.number)) || contact.emails.some(entry => entry.address.includes('@'));
    if (named || reached) continue;
    const holds = Boolean(contact.note.trim() || contact.addresses.length > 0 || contact.birthday || contact.photoId);
    found.push({
      key: `empty:${contact.id}`,
      tool: 'empty',
      contactId: contact.id,
      before: words(WHY.emptyShown),
      after: words(WHY.toBin),
      why: holds ? words(WHY.holdsMore) : null,
      ticked: !holds,
      edit: { kind: 'trash' },
    });
  }
  return found;
}

// ── finding and fixing ──────────────────────────────────────────────────────

/**
 * What a tool finds among `contacts` (live ones alone, in the list's order by name), `region` the
 * country national numbers belong to: the « Indicatif par défaut », or the one picked on the
 * country codes' page.
 */
export function findCleanups(tool: FixingTool, contacts: Iterable<Contact>, region: string | null): CleanupFinding[] {
  const all = live(contacts);
  switch (tool) {
    case 'countryCodes':
      return findCountryCodes(all, region);
    case 'numbers':
      return findNumbers(all, region);
    case 'names':
      return findNames(all, region);
    case 'emails':
      return findEmails(all);
    case 'empty':
      return findEmpty(all);
  }
}

/** How many findings each tool has: the place's list, Réglages' row. */
export function cleanupCounts(contacts: Iterable<Contact>, region: string | null, aside: ReadonlySet<string> = new Set()): Readonly<Record<FixingTool, number>> {
  const all = [...contacts];
  return Object.fromEntries(FIXING_TOOLS.map(tool => [tool, shownCleanups(tool, all, region, aside).length])) as Record<FixingTool, number>;
}

/** A finding set aside on this device (« Ignorer »): it stays so while what it found reads the same. */
export const asideKey = (finding: Pick<CleanupFinding, 'key' | 'before'>): string => `${finding.key}=${typeof finding.before === 'string' ? finding.before : finding.before.key}`;

/** A tool's findings but those set aside. */
export function shownCleanups(tool: FixingTool, contacts: Iterable<Contact>, region: string | null, aside: ReadonlySet<string>): CleanupFinding[] {
  const found = findCleanups(tool, contacts, region);
  return aside.size === 0 ? found : found.filter(finding => !aside.has(asideKey(finding)));
}

export interface CleanupWrite {
  readonly id: string;
  readonly patch: Fields;
}

/**
 * The ticked findings as writes, one per contact, every edit on it composed: what differs from the
 * contact now, its list fields whole. A contact gone from the list since (in the bin, merged, deleted)
 * is left out. `newId` mints an entry's id (a name that was an e-mail joins the e-mails); `now` the
 * bin's date.
 */
export function cleanupWrites(contacts: Readonly<Record<string, Contact>>, findings: readonly CleanupFinding[], options: { readonly now: number; readonly newId: () => string }): CleanupWrite[] {
  const byContact = new Map<string, CleanupEdit[]>();
  for (const finding of findings) {
    if (!finding.edit) continue;
    byContact.set(finding.contactId, [...(byContact.get(finding.contactId) ?? []), finding.edit]);
  }
  const writes: CleanupWrite[] = [];
  for (const [id, edits] of byContact) {
    const contact = contacts[id];
    if (!contact || !isLive(contact) || contact.mergedInto !== null) continue;
    let { firstName, lastName, company } = contact;
    let phones: PhoneEntry[] = [...contact.phones];
    let emails: EmailEntry[] = [...contact.emails];
    let trash = false;
    for (const edit of edits) {
      switch (edit.kind) {
        case 'phone':
          phones = phones.map(entry => (entry.id === edit.entryId ? { ...entry, number: edit.number.slice(0, CONTACT_LIMITS.number) } : entry));
          break;
        case 'dropPhone':
          phones = phones.filter(entry => entry.id !== edit.entryId);
          break;
        case 'email':
          emails = emails.map(entry => (entry.id === edit.entryId ? { ...entry, address: edit.address.slice(0, CONTACT_LIMITS.email) } : entry));
          break;
        case 'dropEmail':
          emails = emails.filter(entry => entry.id !== edit.entryId);
          break;
        case 'name':
          firstName = edit.firstName.slice(0, CONTACT_LIMITS.name);
          lastName = edit.lastName.slice(0, CONTACT_LIMITS.name);
          company = edit.company.slice(0, CONTACT_LIMITS.company);
          if (edit.addEmail && emails.length < CONTACT_LIMITS.emails) emails = [...emails, { id: options.newId(), address: edit.addEmail.slice(0, CONTACT_LIMITS.email), kind: 'other', label: '' }];
          if (edit.addPhone && phones.length < CONTACT_LIMITS.phones) phones = [...phones, { id: options.newId(), number: edit.addPhone.slice(0, CONTACT_LIMITS.number), kind: 'mobile', label: '' }];
          break;
        case 'trash':
          trash = true;
          break;
      }
    }
    const patch: Fields = {};
    if (firstName !== contact.firstName) patch.firstName = firstName;
    if (lastName !== contact.lastName) patch.lastName = lastName;
    if (company !== contact.company) patch.company = company;
    if (JSON.stringify(phones) !== JSON.stringify(contact.phones)) patch.phones = phones;
    if (JSON.stringify(emails) !== JSON.stringify(contact.emails)) patch.emails = emails;
    if (trash) patch.trashedAt = options.now;
    if (Object.keys(patch).length > 0) writes.push({ id, patch });
  }
  return writes;
}
