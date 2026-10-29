/**
 * A page's tables: what a cell shows for its column's type, what typing in it means, and what a
 * column's cells become when its type changes (as Notion converts them).
 */
import { localized, t, tx } from '@unlease/core/i18n';
import { LINE_COLORS } from '@unlease/design/colors';
import type { CellValue, ColumnType, SelectOption, TableColumn } from '../models/blocks';
import { isColumnType, TABLE_LIMITS } from '../models/blocks';
import { formatIsoDay, formatNumber } from '@unlease/core/services/format';

/** U+00A0: between a number and its unit. */
const NBSP = '\u00a0';

/** The type a column is drawn as: one a newer client added shows as text. */
export function columnType(column: TableColumn): ColumnType {
  return isColumnType(column.type) ? column.type : 'text';
}

/** « 1 234,5 », « 12 € », « 3 kg », or « 4/5 » (a unit that starts with a slash sticks to the number). */
export function formatNumberCell(value: number, unit?: string): string {
  const number = formatNumber(value);
  if (!unit) return number;
  return unit.startsWith('/') ? `${number}${unit}` : `${number}${NBSP}${unit}`;
}

/** What a person typed as a number: « 1 234,56 », « 1234.56 », « 12 € », « -3 ». Null when it is none. */
export function parseNumber(input: string): number | null {
  const compact = input.replace(/[\s\u00a0\u202F']/g, '').replace(/^[^\d+\-−.,]+/, '').replace(/[^\d.,]+$/, '').replace('−', '-');
  if (!/^[+-]?[\d.,]*\d[\d.,]*$/.test(compact)) return null;
  const comma = compact.lastIndexOf(',');
  const dot = compact.lastIndexOf('.');
  // The last of the two separators is the decimal one; a lone comma is French's.
  const decimal = comma > dot ? ',' : '.';
  const group = decimal === ',' ? /\./g : /,/g;
  const value = Number(compact.replace(group, '').replace(decimal, '.'));
  return Number.isFinite(value) ? value : null;
}

const pad = (value: number): string => String(value).padStart(2, '0');

export function isoDay(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A day typed by hand: `2026-10-21`, `21/10/2026`, `21.10.26`, `21-10-2026`. Null when it is no real day. */
export function parseDay(input: string): string | null {
  const value = input.trim();
  let year: number;
  let month: number;
  let day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const french = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(value);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (french) [day, month, year] = [Number(french[1]), Number(french[2]), Number(french[3])];
  else return null;
  if (year < 100) year += 2000;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const optionName = (column: TableColumn, id: string): string | null => column.options?.find(option => option.id === id)?.name ?? null;

/** A cell as text: what the table shows (a box aside), what a copy holds, what a search reads. */
export function cellText(value: CellValue | undefined, column: TableColumn): string {
  if (value === undefined || value === null) return '';
  switch (columnType(column)) {
    case 'number':
      return typeof value === 'number' ? formatNumberCell(value, column.unit) : String(value);
    case 'checkbox':
      return value === true ? t('Oui') : '';
    case 'date':
      return typeof value === 'string' ? formatIsoDay(value) : '';
    case 'select':
      return typeof value === 'string' ? (optionName(column, value) ?? '') : '';
    case 'multi':
      return Array.isArray(value) ? value.flatMap(id => optionName(column, id) ?? []).join(', ') : '';
    default:
      return Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? t('Oui') : '') : String(value);
  }
}

/** An empty cell of each type. */
export function emptyCell(type: string): CellValue {
  if (type === 'checkbox') return false;
  if (type === 'multi') return [];
  if (type === 'number' || type === 'select') return null;
  return '';
}

const YES = new Set(['oui', 'yes', 'true', 'vrai', 'x', '✓', '✔', '1']);

/** The texts a column's cells hold, once each, in order: what a column turning into a select offers. */
export function distinctTexts(values: readonly (CellValue | undefined)[], column: TableColumn): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const parts = columnType(column) === 'multi' ? (Array.isArray(value) ? value.flatMap(id => optionName(column, id) ?? []) : []) : cellText(value, column).split(/\s*,\s*/);
    for (const part of parts) {
      const name = part.trim().slice(0, 100);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/** Options for `names` that `existing` lacks, in the pigments' order after the colours in use. */
export function optionsFor(names: readonly string[], existing: readonly SelectOption[], newId: () => string): SelectOption[] {
  const out = [...existing];
  for (const name of names) {
    if (out.some(option => option.name.toLowerCase() === name.toLowerCase())) continue;
    out.push({ id: newId(), name, color: LINE_COLORS[out.length % LINE_COLORS.length]! });
  }
  return out;
}

const findOption = (column: TableColumn, name: string): string | null => column.options?.find(option => option.name.toLowerCase() === name.trim().toLowerCase())?.id ?? null;

/** A cell of `from`'s type as `to`'s (whose options already hold every name it needs). */
export function convertCell(value: CellValue | undefined, from: TableColumn, to: TableColumn): CellValue {
  const source = columnType(from);
  const target = columnType(to);
  if (value === undefined || value === null) return emptyCell(target);
  if (source === target && target !== 'select' && target !== 'multi') return value;
  const asText = cellText(value, from);
  switch (target) {
    case 'number':
      if (typeof value === 'number') return value;
      if (typeof value === 'boolean') return value ? 1 : 0;
      return parseNumber(asText);
    case 'checkbox':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      return YES.has(asText.trim().toLowerCase());
    case 'date':
      return typeof value === 'string' && source === 'date' ? value : (parseDay(asText) ?? '');
    case 'select': {
      const first = source === 'multi' ? asText.split(',')[0] ?? '' : asText;
      return first.trim() ? findOption(to, first) : null;
    }
    case 'multi': {
      const names = source === 'select' ? [asText] : asText.split(',');
      return names.flatMap(name => findOption(to, name) ?? []);
    }
    default:
      return asText;
  }
}

/** A domain's label: letters and digits (any script), inner hyphens, at most 63. */
const LABEL = String.raw`[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?`;
/** A host a person types: a domain with its extension, an IPv4 address, or localhost. */
const HOST = String.raw`(?:(?:${LABEL}\.)+\p{L}{2,}|(?:\d{1,3}\.){3}\d{1,3}|localhost)`;
/** `nom@exemple.fr`: dot-separated words before the @ (no leading, trailing or double dot), a domain with its extension after. */
const EMAIL = new RegExp(String.raw`^[\p{L}\p{N}!#$%&'*+/=?^_\x60{|}~-]+(?:\.[\p{L}\p{N}!#$%&'*+/=?^_\x60{|}~-]+)*@(?:${LABEL}\.)+\p{L}{2,}$`, 'u');
/** `exemple.fr`, `https://exemple.fr/page?x=1`: a web address, its scheme optional, no space anywhere. */
const WEB_ADDRESS = new RegExp(String.raw`^(?:https?://)?${HOST}(?::\d{1,5})?(?:[/?#]\S*)?$`, 'iu');
/** `06 12 34 56 78`, `+33 (0)6.12.34.56.78`: digits with spaces, dots, dashes and brackets, a + only first. */
const PHONE = /^\+?[\d\s().\-\u00a0]+$/;

export function isEmail(text: string): boolean {
  return text.length <= 254 && EMAIL.test(text);
}

export function isWebAddress(text: string): boolean {
  return text.length <= 2048 && WEB_ADDRESS.test(text);
}

export function isPhone(text: string): boolean {
  const digits = text.replace(/\D/g, '').length;
  return PHONE.test(text) && digits >= 2 && digits <= 20;
}

/** What a column of a strict type holds, as a person is told when what they typed does not fit. */
export const CELL_FORMATS: Readonly<Partial<Record<ColumnType, { readonly expected: string; readonly example: string }>>> = {
  number: localized({ expected: tx('un nombre'), example: tx('12,5') }),
  date: localized({ expected: tx('une date'), example: '21/10/2026' }),
  email: localized({ expected: tx('une adresse e-mail'), example: tx('nom@exemple.fr') }),
  url: localized({ expected: tx('un lien'), example: tx('exemple.fr') }),
  phone: localized({ expected: tx('un numéro de téléphone'), example: tx('06 12 34 56 78') }),
};

export type CellInput = { readonly ok: true; readonly value: CellValue } | { readonly ok: false };

/**
 * What a person typed in a cell of `type`, as the cell will hold it, or `ok: false` when it does not
 * fit the type (the cell then keeps what it held). Typing nothing empties any cell; text keeps
 * exactly what was typed, the other types the value without its surrounding spaces.
 */
export function readCellInput(type: ColumnType, input: string): CellInput {
  const text = input.trim();
  const fits = (value: CellValue): CellInput => ({ ok: true, value });
  switch (type) {
    case 'number': {
      if (!text) return fits(null);
      const value = parseNumber(text);
      return value === null ? { ok: false } : fits(value);
    }
    case 'date': {
      if (!text) return fits('');
      const day = parseDay(text);
      return day === null ? { ok: false } : fits(day);
    }
    case 'email':
      return !text || isEmail(text) ? fits(text) : { ok: false };
    case 'url':
      return !text || isWebAddress(text) ? fits(text) : { ok: false };
    case 'phone':
      return !text || isPhone(text) ? fits(text) : { ok: false };
    default:
      return fits(input.slice(0, TABLE_LIMITS.cellText));
  }
}

/** Whether a cell already holds what its column's type expects: a cell typed before the column changed type may not. */
export function cellFits(value: CellValue | undefined, column: TableColumn): boolean {
  const type = columnType(column);
  if (value === undefined || value === null || value === '') return true;
  if (type === 'email' || type === 'url' || type === 'phone') return typeof value === 'string' && readCellInput(type, value).ok;
  return true;
}

/** A link cell's address, made openable: a bare domain gets `https://`. Null when it is no address of its type. */
export function cellHref(type: ColumnType, value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (type === 'email') return isEmail(text) ? `mailto:${text}` : null;
  if (type === 'phone') return isPhone(text) ? `tel:${text.replace(/[^\d+]/g, '')}` : null;
  if (type === 'url') return isWebAddress(text) ? (/^https?:\/\//i.test(text) ? text : `https://${text}`) : null;
  return null;
}
