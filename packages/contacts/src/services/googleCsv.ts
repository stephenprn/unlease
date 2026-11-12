/**
 * Google Contacts' CSV (« Exporter » > « CSV Google »): read into contacts to import. Two layouts
 * are in use: today's (`First Name`, `Last Name`, `Labels`, `Phone 1 - Label`) and the older one
 * (`Given Name`, `Family Name`, `Group Membership`, `Phone 1 - Type`). A cell may hold several values
 * apart with ` ::: `; a label written `* Mobile` is the primary one. Outlook's CSV shares enough of
 * the names (`First Name`, `E-mail Address`, `Mobile Phone`) to be read too.
 */
import { readTypedBirthday, writeBirthday } from './birthdays';
import type { ImportedAddress, ImportedContact, ImportedEntry } from './importing';
import { readVCardDate } from './vcard';

/** RFC 4180: quoted cells may hold commas, quotes (doubled) and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === '') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(cells => cells.some(value => value.trim() !== ''));
}

/** Whether a file looks like a contacts CSV (its header names a name column). */
export function isContactsCsv(text: string): boolean {
  const header = parseCsv(text.slice(0, 4000))[0] ?? [];
  return header.some(name => /^(First Name|Given Name|Name|Last Name|Family Name)$/i.test(name.trim()));
}

const split = (value: string | undefined): string[] =>
  (value ?? '')
    .split(':::')
    .map(part => part.trim())
    .filter(Boolean);

function kindOf(label: string, phone: boolean): { readonly kind: string; readonly label: string } {
  const plain = label.replace(/^\*\s*/, '').trim();
  const lower = plain.toLowerCase();
  if (!lower) return { kind: 'other', label: '' };
  if (phone && /^(mobile|cell|portable|mobile phone)$/.test(lower)) return { kind: 'mobile', label: '' };
  if (/^(home|domicile|maison|personal|personnel)$/.test(lower)) return { kind: 'home', label: '' };
  if (/^(work|travail|bureau|business)$/.test(lower)) return { kind: 'work', label: '' };
  if (phone && /^(main|principal)$/.test(lower)) return { kind: 'main', label: '' };
  if (/^(other|autre)$/.test(lower)) return { kind: 'other', label: '' };
  return { kind: 'other', label: plain.slice(0, 40) };
}

/** Google's own labels, which say something else than a label of the person's. */
const STARRED = /^\*?\s*starred$/i;
const SYSTEM = /^\*\s*\S|^(my contacts|mycontacts)$/i;

/** A Google CSV birthday: `1990-03-12`, `--03-12`, or as a person typed it in another export. */
function readBirthdayCell(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  const vcard = readVCardDate(text);
  if (vcard) return vcard;
  const typed = readTypedBirthday(text);
  return typed ? writeBirthday(typed) : null;
}

/**
 * Every row of a Google (or Outlook) contacts CSV, in order; a row holding no name, number nor email
 * is left out, unless `anonymous` asks for those holding something else (an address, a note), so the
 * import's preview can say why they stay out. A row holding nothing at all is never read.
 */
export function parseGoogleCsv(text: string, { anonymous = false }: { readonly anonymous?: boolean } = {}): ImportedContact[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const index = new Map(header.map((name, at) => [name.trim().toLowerCase(), at]));
  const col = (row: readonly string[], ...names: string[]): string => {
    for (const name of names) {
      const at = index.get(name.toLowerCase());
      if (at !== undefined && row[at]?.trim()) return row[at]!.trim();
    }
    return '';
  };
  /** The numbered groups a header holds: `Phone 1 - …`, `Phone 2 - …`. */
  const numbered = (prefix: string): number[] => {
    const seen = new Set<number>();
    for (const name of index.keys()) {
      const match = new RegExp(`^${prefix} (\\d+) - `, 'i').exec(name);
      if (match) seen.add(Number(match[1]));
    }
    return [...seen].sort((a, b) => a - b);
  };

  const out: ImportedContact[] = [];
  for (const row of rows) {
    let firstName = [col(row, 'First Name', 'Given Name'), col(row, 'Middle Name', 'Additional Name')].filter(Boolean).join(' ');
    let lastName = col(row, 'Last Name', 'Family Name');
    const full = col(row, 'Name');
    if (!firstName && !lastName && full) {
      const words = full.split(/\s+/);
      firstName = words.length > 1 ? words.slice(0, -1).join(' ') : full;
      lastName = words.length > 1 ? words[words.length - 1]! : '';
    }

    const phones: ImportedEntry[] = [];
    for (const n of numbered('phone')) {
      const label = col(row, `Phone ${n} - Label`, `Phone ${n} - Type`);
      for (const value of split(col(row, `Phone ${n} - Value`))) phones.push({ value, ...kindOf(label, true) });
    }
    for (const [name, kind] of [['Mobile Phone', 'mobile'], ['Home Phone', 'home'], ['Business Phone', 'work'], ['Primary Phone', 'main'], ['Other Phone', 'other']] as const) {
      const value = col(row, name);
      if (value) phones.push({ value, kind, label: '' });
    }

    const emails: ImportedEntry[] = [];
    for (const n of numbered('e-mail')) {
      const label = col(row, `E-mail ${n} - Label`, `E-mail ${n} - Type`);
      for (const value of split(col(row, `E-mail ${n} - Value`))) emails.push({ value, ...kindOf(label, false) });
    }
    for (const name of ['E-mail Address', 'E-mail 2 Address', 'E-mail 3 Address']) {
      const value = col(row, name);
      if (value && !emails.some(entry => entry.value === value)) emails.push({ value, kind: 'other', label: '' });
    }

    const addresses: ImportedAddress[] = [];
    for (const n of numbered('address')) {
      const street = [col(row, `Address ${n} - Street`), col(row, `Address ${n} - Extended Address`), col(row, `Address ${n} - PO Box`)].filter(Boolean).join('\n');
      const city = col(row, `Address ${n} - City`);
      const postalCode = col(row, `Address ${n} - Postal Code`);
      const region = col(row, `Address ${n} - Region`);
      const country = col(row, `Address ${n} - Country`);
      const formatted = col(row, `Address ${n} - Formatted`);
      const kind = kindOf(col(row, `Address ${n} - Label`, `Address ${n} - Type`), false);
      if (street || city || postalCode || country) addresses.push({ ...kind, street, postalCode, city, region, country });
      else if (formatted) addresses.push({ ...kind, street: formatted, postalCode: '', city: '', region: '', country: '' });
    }

    let favorite = false;
    const labels: string[] = [];
    for (const label of split(col(row, 'Labels', 'Group Membership', 'Categories'))) {
      if (STARRED.test(label)) favorite = true;
      else if (!SYSTEM.test(label)) labels.push(label);
    }

    const photoUrl = col(row, 'Photo');
    const contact: ImportedContact = {
      firstName,
      lastName,
      company: col(row, 'Organization Name', 'Organization 1 - Name', 'Company'),
      jobTitle: col(row, 'Organization Title', 'Organization 1 - Title', 'Job Title'),
      note: col(row, 'Notes'),
      birthday: readBirthdayCell(col(row, 'Birthday')),
      favorite,
      photo: /^https?:\/\//i.test(photoUrl) ? { kind: 'url', url: photoUrl } : null,
      phones,
      emails,
      addresses,
      labels,
    };
    if (contact.firstName || contact.lastName || contact.company || phones.length > 0 || emails.length > 0) out.push(contact);
    else if (anonymous && (contact.note || contact.birthday || contact.photo || addresses.length > 0 || labels.length > 0)) out.push(contact);
  }
  return out;
}
