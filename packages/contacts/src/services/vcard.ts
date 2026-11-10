/**
 * vCard (RFC 6350, and the 3.0 and 2.1 that phones and Google still write): read into contacts to
 * import, written from contacts to export. Google Contacts' « Exporter » > vCard and Takeout write
 * 3.0, with `itemN.X-ABLabel` for a label of the person's own and `CATEGORIES` for its labels
 * (`myContacts`, `starred` for its favourites). Reading never throws: what it cannot read is left out.
 */
import { CONTACT_LIMITS, type Contact, type ContactLabel } from '../models/contacts';
import { readBirthday, writeBirthday } from './birthdays';
import type { ImportedAddress, ImportedContact, ImportedEntry, ImportedPhoto } from './importing';

interface Property {
  readonly group: string | null;
  readonly name: string;
  /** Upper-cased names; a bare 2.1 parameter (`CELL`) is a TYPE. */
  readonly params: ReadonlyMap<string, readonly string[]>;
  readonly value: string;
}

/** Lines unfolded: a line starting with a space or a tab continues the one before; a quoted-printable soft break too. */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of raw) {
    const last = lines.length - 1;
    if ((line.startsWith(' ') || line.startsWith('\t')) && last >= 0) {
      lines[last] += line.slice(1);
    } else if (last >= 0 && /QUOTED-PRINTABLE/i.test(lines[last]!.split(':')[0] ?? '') && lines[last]!.endsWith('=')) {
      lines[last] = lines[last]!.slice(0, -1) + line;
    } else if (last >= 0 && /^[A-Za-z0-9+/=]+$/.test(line) && /ENCODING=(B|BASE64)|;BASE64/i.test(lines[last]!.split(':')[0] ?? '')) {
      // vCard 2.1's base64 photo runs on lines without a leading space.
      lines[last] += line;
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/** Splits at `sep` outside backslash escapes (`;` between N's parts, `,` between CATEGORIES). */
function splitEscaped(value: string, sep: string): string[] {
  const out: string[] = [];
  let current = '';
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;
    if (char === '\\' && i + 1 < value.length) {
      current += char + value[i + 1];
      i += 1;
    } else if (char === sep) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

const unescape = (value: string): string => value.replace(/\\([nN,;:\\])/g, (_, char: string) => (char === 'n' || char === 'N' ? '\n' : char));

function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;
    if (char === '=' && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...utf8(char));
    }
  }
  return fromUtf8(bytes);
}

function utf8(char: string): number[] {
  const code = char.codePointAt(0)!;
  if (code < 0x80) return [code];
  if (code < 0x800) return [0xc0 | (code >> 6), 0x80 | (code & 63)];
  if (code < 0x10000) return [0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63)];
  return [0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63)];
}

/** UTF-8 bytes to text, a stray byte read as Latin-1 (old exports mix them). No TextDecoder: Hermes has none everywhere. */
function fromUtf8(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]!;
    const need = b >= 0xf0 ? 3 : b >= 0xe0 ? 2 : b >= 0xc0 ? 1 : 0;
    const tail = bytes.slice(i + 1, i + 1 + need);
    if (need > 0 && tail.length === need && tail.every(byte => (byte & 0xc0) === 0x80)) {
      let code = b & (need === 1 ? 0x1f : need === 2 ? 0x0f : 0x07);
      for (const byte of tail) code = (code << 6) | (byte & 63);
      out += String.fromCodePoint(code);
      i += need + 1;
    } else {
      out += String.fromCharCode(b);
      i += 1;
    }
  }
  return out;
}

function parseLine(line: string): Property | null {
  // The value starts at the first colon outside a quoted parameter.
  let colon = -1;
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const head = line.slice(0, colon).split(';');
  const fullName = head[0]!;
  const dot = fullName.lastIndexOf('.');
  const group = dot > 0 ? fullName.slice(0, dot).toLowerCase() : null;
  const name = (dot > 0 ? fullName.slice(dot + 1) : fullName).toUpperCase();
  const params = new Map<string, string[]>();
  for (const param of head.slice(1)) {
    const eq = param.indexOf('=');
    const key = eq < 0 ? 'TYPE' : param.slice(0, eq).toUpperCase();
    const raw = eq < 0 ? param : param.slice(eq + 1);
    const values = raw.split(',').map(value => value.replace(/^"|"$/g, '').trim()).filter(Boolean);
    params.set(key, [...(params.get(key) ?? []), ...values]);
  }
  let value = line.slice(colon + 1);
  if ((params.get('ENCODING') ?? []).some(encoding => /^QUOTED-PRINTABLE$/i.test(encoding)) || (params.get('TYPE') ?? []).some(type => /^QUOTED-PRINTABLE$/i.test(type))) value = decodeQuotedPrintable(value);
  return { group, name, params, value };
}

const types = (property: Property): string[] => (property.params.get('TYPE') ?? []).map(type => type.toLowerCase());

function phoneKind(property: Property): string {
  const kinds = types(property);
  if (kinds.includes('cell') || kinds.includes('mobile') || kinds.includes('iphone')) return 'mobile';
  if (kinds.includes('work')) return 'work';
  if (kinds.includes('home')) return 'home';
  if (kinds.includes('main') || kinds.includes('pref')) return 'main';
  return 'other';
}

function placeKind(property: Property): string {
  const kinds = types(property);
  if (kinds.includes('work')) return 'work';
  if (kinds.includes('home')) return 'home';
  return 'other';
}

/** A label of the person's own, from an `itemN.X-ABLabel` (Apple's and Google's), stripped of Apple's `_$!<…>!$_`. */
function customLabel(labels: ReadonlyMap<string, string>, property: Property): string {
  const label = property.group ? labels.get(property.group) : undefined;
  if (!label) return '';
  const apple = /^_\$!<(.+)>!\$_$/.exec(label);
  return (apple ? '' : label).slice(0, CONTACT_LIMITS.entryLabel);
}

function readPhoto(property: Property): ImportedPhoto | null {
  const value = property.value.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return { kind: 'url', url: value };
  const data = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(value);
  if (data) return data[2] ? { kind: 'data', mime: data[1] ?? 'image/jpeg', base64: data[3]!.replace(/\s/g, '') } : null;
  const encoding = (property.params.get('ENCODING') ?? []).map(entry => entry.toLowerCase());
  const typed = types(property);
  if (encoding.includes('b') || encoding.includes('base64') || typed.includes('base64')) {
    const format = typed.find(type => ['jpeg', 'jpg', 'png', 'gif', 'webp'].includes(type)) ?? 'jpeg';
    return { kind: 'data', mime: `image/${format === 'jpg' ? 'jpeg' : format}`, base64: value.replace(/\s/g, '') };
  }
  return null;
}

/** A vCard date (`1990-03-12`, `19900312`, `--0312`, `--03-12`, with a time after) as Contacts stores it. */
export function readVCardDate(value: string): string | null {
  const text = value.trim().split('T')[0]!;
  const full = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(text);
  if (full) {
    // Apple writes 1604 for a birthday without a year.
    const year = full[1] === '1604' ? null : Number(full[1]);
    const birthday = readBirthday(writeBirthday({ year, month: Number(full[2]), day: Number(full[3]) }));
    return birthday ? writeBirthday(birthday) : null;
  }
  const noYear = /^--(\d{2})-?(\d{2})$/.exec(text);
  if (noYear) {
    const birthday = readBirthday(writeBirthday({ year: null, month: Number(noYear[1]), day: Number(noYear[2]) }));
    return birthday ? writeBirthday(birthday) : null;
  }
  return null;
}

/** Google's own categories, which say something else than a label. */
const GOOGLE_STARRED = /^\*?\s*starred$/i;
const GOOGLE_SYSTEM = /^\*?\s*(mycontacts|my contacts|friends_\w*|family_\w*|coworkers_\w*)$/i;

function readCard(lines: readonly string[]): ImportedContact | null {
  const properties = lines.map(parseLine).filter((property): property is Property => property !== null);
  const labels = new Map<string, string>();
  for (const property of properties) if (property.name === 'X-ABLABEL' && property.group) labels.set(property.group, unescape(property.value).trim());

  let firstName = '';
  let lastName = '';
  let formatted = '';
  let company = '';
  let jobTitle = '';
  let note = '';
  let birthday: string | null = null;
  let favorite = false;
  let photo: ImportedPhoto | null = null;
  const phones: ImportedEntry[] = [];
  const emails: ImportedEntry[] = [];
  const addresses: ImportedAddress[] = [];
  const categories: string[] = [];

  for (const property of properties) {
    switch (property.name) {
      case 'N': {
        const [family = '', given = '', additional = ''] = splitEscaped(property.value, ';').map(part => unescape(part).trim());
        lastName = family;
        firstName = [given, additional].filter(Boolean).join(' ');
        break;
      }
      case 'FN':
        formatted = unescape(property.value).trim();
        break;
      case 'ORG':
        company = unescape(splitEscaped(property.value, ';')[0] ?? '').trim();
        break;
      case 'TITLE':
        jobTitle = unescape(property.value).trim();
        break;
      case 'NOTE':
        note = note ? `${note}\n${unescape(property.value).trim()}` : unescape(property.value).trim();
        break;
      case 'BDAY':
        birthday = readVCardDate(property.value) ?? birthday;
        break;
      case 'TEL': {
        const number = unescape(property.value.replace(/^tel:/i, '')).trim();
        if (number) phones.push({ value: number, kind: phoneKind(property), label: customLabel(labels, property) });
        break;
      }
      case 'EMAIL': {
        const address = unescape(property.value.replace(/^mailto:/i, '')).trim();
        if (address) emails.push({ value: address, kind: placeKind(property), label: customLabel(labels, property) });
        break;
      }
      case 'ADR': {
        const [box = '', extended = '', street = '', city = '', region = '', postalCode = '', country = ''] = splitEscaped(property.value, ';').map(part => unescape(part).trim());
        const lines = [street, extended, box].filter(Boolean).join('\n');
        if (lines || city || postalCode || country) addresses.push({ kind: placeKind(property), label: customLabel(labels, property), street: lines, postalCode, city, region, country });
        break;
      }
      case 'CATEGORIES':
        for (const category of splitEscaped(property.value, ',').map(part => unescape(part).trim()).filter(Boolean)) {
          if (GOOGLE_STARRED.test(category)) favorite = true;
          else if (!GOOGLE_SYSTEM.test(category)) categories.push(category);
        }
        break;
      case 'X-STARRED':
        favorite ||= /^(1|true|yes)$/i.test(property.value.trim());
        break;
      case 'PHOTO':
        photo ??= readPhoto(property);
        break;
      default:
        break;
    }
  }
  if (!firstName && !lastName && formatted && formatted !== company) {
    const words = formatted.split(/\s+/);
    firstName = words.length > 1 ? words.slice(0, -1).join(' ') : formatted;
    lastName = words.length > 1 ? words[words.length - 1]! : '';
  }
  const contact: ImportedContact = { firstName, lastName, company, jobTitle, note, birthday, favorite, photo, phones, emails, addresses, labels: categories };
  return firstName || lastName || company || phones.length > 0 || emails.length > 0 ? contact : null;
}

/** Every card of a `.vcf`, in order; what holds no name, number nor email is left out. */
export function parseVCards(text: string): ImportedContact[] {
  const out: ImportedContact[] = [];
  let card: string[] | null = null;
  for (const line of unfold(text.replace(/^\uFEFF/, ''))) {
    const upper = line.trim().toUpperCase();
    if (upper === 'BEGIN:VCARD') card = [];
    else if (upper === 'END:VCARD') {
      if (card) {
        const contact = readCard(card);
        if (contact) out.push(contact);
      }
      card = null;
    } else if (card && line.trim()) card.push(line);
  }
  return out;
}

// ── writing ─────────────────────────────────────────────────────────────────

const escapeValue = (value: string): string => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** Lines longer than 75 octets folded, as RFC 6350 asks (counted in characters: close enough for readers). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let at = 75; at < line.length; at += 74) parts.push(` ${line.slice(at, at + 74)}`);
  return parts.join('\r\n');
}

const VCARD_PHONE: Readonly<Record<string, string>> = { mobile: 'CELL', home: 'HOME', work: 'WORK', main: 'MAIN', other: 'VOICE' };
const VCARD_PLACE: Readonly<Record<string, string>> = { home: 'HOME', work: 'WORK', other: 'OTHER' };

/**
 * One contact as a vCard 3.0 (what Google and every phone read), its labels as CATEGORIES, a
 * favourite as Google's `starred`; `photoUrl` adds its photo by address (an archive's file).
 */
export function toVCard(contact: Contact, labels: Readonly<Record<string, ContactLabel>>, photoUrl?: string): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `UID:${contact.id}`];
  const fn = `${contact.firstName} ${contact.lastName}`.trim() || contact.company.trim() || contact.emails[0]?.address || contact.phones[0]?.number || '';
  lines.push(`N:${escapeValue(contact.lastName)};${escapeValue(contact.firstName)};;;`, `FN:${escapeValue(fn)}`);
  if (contact.company) lines.push(`ORG:${escapeValue(contact.company)}`);
  if (contact.jobTitle) lines.push(`TITLE:${escapeValue(contact.jobTitle)}`);
  let item = 0;
  const withLabel = (property: string, label: string): void => {
    if (!label) {
      lines.push(property);
      return;
    }
    item += 1;
    lines.push(`item${item}.${property}`, `item${item}.X-ABLabel:${escapeValue(label)}`);
  };
  for (const phone of contact.phones) if (phone.number.trim()) withLabel(`TEL;TYPE=${VCARD_PHONE[phone.kind] ?? 'VOICE'}:${escapeValue(phone.number.trim())}`, phone.label);
  for (const email of contact.emails) if (email.address.trim()) withLabel(`EMAIL;TYPE=INTERNET,${VCARD_PLACE[email.kind] ?? 'OTHER'}:${escapeValue(email.address.trim())}`, email.label);
  for (const address of contact.addresses) {
    const parts = ['', '', address.street, address.city, address.region, address.postalCode, address.country].map(escapeValue).join(';');
    withLabel(`ADR;TYPE=${VCARD_PLACE[address.kind] ?? 'OTHER'}:${parts}`, address.label);
  }
  const birthday = readBirthday(contact.birthday);
  if (birthday) lines.push(birthday.year === null ? `BDAY:--${writeBirthday(birthday).slice(2).replace('-', '')}` : `BDAY:${writeBirthday(birthday)}`);
  if (contact.note.trim()) lines.push(`NOTE:${escapeValue(contact.note.trim())}`);
  const categories = contact.labelIds.map(id => labels[id]).filter((label): label is ContactLabel => label !== undefined && label.deletedAt === null).map(label => escapeValue(label.name));
  if (contact.favorite) categories.push('starred');
  if (categories.length > 0) lines.push(`CATEGORIES:${categories.join(',')}`);
  if (photoUrl) lines.push(`PHOTO;VALUE=uri:${photoUrl}`);
  lines.push('END:VCARD');
  return lines.map(fold).join('\r\n');
}

/** Several contacts as one `.vcf`. */
export function toVCards(contacts: readonly Contact[], labels: Readonly<Record<string, ContactLabel>>, photoUrl?: (contact: Contact) => string | undefined): string {
  return contacts.map(contact => toVCard(contact, labels, photoUrl?.(contact))).join('\r\n') + (contacts.length > 0 ? '\r\n' : '');
}
