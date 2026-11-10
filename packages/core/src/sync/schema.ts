/**
 * What may travel, per record type: both ends run every incoming field through its type's checks.
 * A failing field is dropped with its clock, never coerced: a coerced value would win forever.
 * Each app declares its own types with `defineRecordTypes` (Carnet's: `@unlease/notes/sync/types`),
 * and a program knows the types of every app package it loads. A record of a type no loaded app
 * declares is refused whole. Adding a field is safe; renaming or removing one is a migration on
 * every device.
 */
import type { AppId } from '../apps';
import { hashHex } from '../services/hash';

export type Check = (value: unknown) => boolean;

/**
 * A field merged instead of overwritten when two devices change it at once (`textMerge`): a long
 * text the person types (word by word), or a list of strings merged as a set (`set`).
 */
export interface MergedField {
  /**
   * The longest it may hold (characters; entries for a set): a local write of text is cut to it,
   * and a merge that would pass it keeps the newer version whole.
   */
  readonly limit: number;
  /** How two edits combine when not word by word (a drawing, stroke by stroke); words by default. */
  readonly merge?: (base: string, ours: string, theirs: string, oursFirst: boolean) => string;
  /**
   * A list of strings rather than a text (an event's days taken out): what either side added stays,
   * what either side removed goes. A client or server that does not merge it keeps the later list.
   */
  readonly set?: true;
}

export interface RecordTypeSpec {
  /** The app whose records these are. */
  readonly app: AppId;
  readonly fields: Readonly<Record<string, Check>>;
  readonly merged?: Readonly<Record<string, MergedField>>;
  /** What a field reads as before it is first written (one written only once it is used): a rollback writes it back where a backup never had it. */
  readonly defaults?: Readonly<Record<string, unknown>>;
  /** Fixed ids every device creates itself (Carnet's « Non classé »): a server holding nothing else holds nothing. */
  readonly seeded?: readonly string[];
}

const TYPES = new Map<string, RecordTypeSpec>();

/**
 * Declares an app's record types, once its package loads. Type names are shared by the whole suite
 * (they key every store), so two apps may not take the same one.
 */
export function defineRecordTypes<const T extends Readonly<Record<string, RecordTypeSpec>>>(types: T): T {
  for (const [name, spec] of Object.entries(types)) {
    const known = TYPES.get(name);
    if (known && known.app !== spec.app) throw new Error(`record type "${name}" is declared by both ${known.app} and ${spec.app}`);
    TYPES.set(name, spec);
  }
  return types;
}

export function recordTypeSpec(type: string): RecordTypeSpec | undefined {
  return TYPES.get(type);
}

export function isRecordType(value: unknown): value is string {
  return typeof value === 'string' && TYPES.has(value);
}

/** The record types the loaded packages declare for these apps: what a client showing them syncs (`SyncRequest.types`). */
export function typesOfApps(apps: readonly AppId[]): string[] {
  return [...TYPES].filter(([, spec]) => apps.includes(spec.app)).map(([type]) => type).sort();
}

/** The app a record type belongs to, once its package loaded. */
export function appOfType(type: string): AppId | undefined {
  return TYPES.get(type)?.app;
}

/** The records every device seeds, of every type the loaded apps declare. */
export function seededRecords(): readonly { readonly type: string; readonly id: string }[] {
  return [...TYPES].flatMap(([type, spec]) => (spec.seeded ?? []).map(id => ({ type, id })));
}

/** A check with what it accepts in words (`sig`), so a schema's fingerprint changes when a newer build widens it. */
export type SignedCheck = Check & { readonly sig?: string };

/** `check`, carrying its description for `schemaFingerprint`. */
export function signed(check: Check, sig: string): SignedCheck {
  return Object.assign(check, { sig });
}

/** The checks app packages declare their fields with. */
export const str = (max: number): Check => signed(value => typeof value === 'string' && value.length <= max, `str:${max}`);
export const nullableStr = (max: number): Check => signed(value => value === null || (typeof value === 'string' && value.length <= max), `str?:${max}`);
export const bool: Check = signed(value => typeof value === 'boolean', 'bool');
export const time: Check = signed(value => typeof value === 'number' && Number.isFinite(value) && value >= 0, 'time');
export const nullableTime: Check = signed(value => value === null || time(value), 'time?');
export const nullableNumber: Check = signed(value => value === null || (typeof value === 'number' && Number.isFinite(value)), 'number?');
export const oneOf = (values: readonly string[]): Check => signed(value => typeof value === 'string' && values.includes(value), `oneOf:${[...values].sort().join('|')}`);
export const nullableOneOf = (values: readonly string[]): Check => signed(value => value === null || oneOf(values)(value), `oneOf?:${[...values].sort().join('|')}`);
/** A record's id: a UUID (`services/ids`), or one of the fixed ids seeded records share on every device. */
export const id: Check = signed(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value), 'id');
export const nullableId: Check = signed(value => value === null || id(value), 'id?');
export const ids = (max: number): Check => signed(value => Array.isArray(value) && value.length <= max && value.every(id), `ids:${max}`);
export const int = (min: number, max: number): Check => signed(value => Number.isInteger(value) && (value as number) >= min && (value as number) <= max, `int:${min}:${max}`);
/** Any key a newer client may add, so a peer passes it on; unknown keys draw as a default. */
export const styleKey: Check = signed(value => value === null || (typeof value === 'string' && /^[a-z]{1,20}$/.test(value)), 'styleKey');
/** A fractional index (`services/fractionalIndex`). */
export const position: Check = signed(value => typeof value === 'string' && /^[0-9A-Za-z]{1,200}$/.test(value), 'position:200');

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keys a newer client may add inside a field's JSON are passed on; only the known ones are checked, and the whole is bounded. */
export const smallJson = (max: number): Check =>
  signed(value => {
    try {
      return JSON.stringify(value).length <= max;
    } catch {
      return false;
    }
  }, `json:${max}`);

export function isValidId(value: unknown): value is string {
  return id(value);
}

/** Own properties only: `constructor` or `__proto__` must never pass as a field. */
export function isValidField(type: string, field: string, value: unknown): boolean {
  const fields = TYPES.get(type)?.fields;
  if (!fields || !Object.hasOwn(fields, field)) return false;
  const check = fields[field];
  return check !== undefined && check(value);
}

/** The longest a merged text field may hold, or undefined for any other field (a merged set's limit counts entries). */
export function textLimit(type: string, field: string): number | undefined {
  const merged = TYPES.get(type)?.merged;
  return merged && Object.hasOwn(merged, field) && !merged[field]?.set ? merged[field]?.limit : undefined;
}

/**
 * A local write's value as the schema will let it travel: typed text cut to its limit, any other
 * invalid value left out (undefined), so a device never holds what the others will not receive.
 */
export function fitField(type: string, field: string, value: unknown): unknown {
  if (isValidField(type, field, value)) return value;
  const limit = textLimit(type, field);
  if (limit !== undefined && typeof value === 'string') return value.slice(0, limit);
  return undefined;
}

/**
 * What a build knows of these record types, as one short value: each type's fields with what their
 * checks accept (`sig`; an app's own check counts by name only) and how they merge. A device keeps
 * it beside its cursor: a newer build that knows a field, or a value, the older one dropped from what
 * it pulled (`sanitizeRecord`) pulls everything again, so nothing it dropped stays missing.
 */
export function schemaFingerprint(types: readonly string[]): string {
  const parts: string[] = [];
  for (const type of [...new Set(types)].sort()) {
    const spec = TYPES.get(type);
    if (!spec) continue;
    const fields = Object.keys(spec.fields)
      .sort()
      .map(field => {
        const merged = spec.merged && Object.hasOwn(spec.merged, field) ? spec.merged[field] : undefined;
        const how = merged ? `~${merged.set ? 'set' : 'text'}:${merged.limit}` : '';
        return `${field}=${(spec.fields[field] as SignedCheck).sig ?? '?'}${how}`;
      });
    parts.push(`${type}{${fields.join(',')}}`);
  }
  return hashHex(parts.join(';')).slice(0, 16);
}
