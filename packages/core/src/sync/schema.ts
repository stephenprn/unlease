/**
 * What may travel, per record type: both ends run every incoming field through its type's checks.
 * A failing field is dropped with its clock, never coerced: a coerced value would win forever.
 * Each app declares its own types with `defineRecordTypes` (Carnet's: `@unlease/notes/sync/types`),
 * and a program knows the types of every app package it loads. A record of a type no loaded app
 * declares is refused whole. Adding a field is safe; renaming or removing one is a migration on
 * every device.
 */
import type { AppId } from '../apps';

export type Check = (value: unknown) => boolean;

/** A long text the person types, merged instead of overwritten when two devices change it at once (`textMerge`). */
export interface MergedField {
  /** The longest it may hold: a local write is cut to it, and a merge that would pass it keeps the newer text whole. */
  readonly limit: number;
  /** How two edits combine when not word by word (a drawing, stroke by stroke); words by default. */
  readonly merge?: (base: string, ours: string, theirs: string, oursFirst: boolean) => string;
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

/** The records every device seeds, of every type the loaded apps declare. */
export function seededRecords(): readonly { readonly type: string; readonly id: string }[] {
  return [...TYPES].flatMap(([type, spec]) => (spec.seeded ?? []).map(id => ({ type, id })));
}

/** The checks app packages declare their fields with. */
export const str =
  (max: number): Check =>
  value =>
    typeof value === 'string' && value.length <= max;
export const nullableStr =
  (max: number): Check =>
  value =>
    value === null || (typeof value === 'string' && value.length <= max);
export const bool: Check = value => typeof value === 'boolean';
export const time: Check = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const nullableTime: Check = value => value === null || time(value);
export const nullableNumber: Check = value =>
  value === null || (typeof value === 'number' && Number.isFinite(value));
export const oneOf =
  (values: readonly string[]): Check =>
  value =>
    typeof value === 'string' && values.includes(value);
export const nullableOneOf =
  (values: readonly string[]): Check =>
  value =>
    value === null || oneOf(values)(value);
/** A record's id: a UUID (`services/ids`), or one of the fixed ids seeded records share on every device. */
export const id: Check = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
export const nullableId: Check = value => value === null || id(value);
export const ids =
  (max: number): Check =>
  value =>
    Array.isArray(value) && value.length <= max && value.every(id);
export const int =
  (min: number, max: number): Check =>
  value =>
    Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
/** Any key a newer client may add, so a peer passes it on; unknown keys draw as a default. */
export const styleKey: Check = value => value === null || (typeof value === 'string' && /^[a-z]{1,20}$/.test(value));
/** A fractional index (`services/fractionalIndex`). */
export const position: Check = value => typeof value === 'string' && /^[0-9A-Za-z]{1,200}$/.test(value);

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keys a newer client may add inside a field's JSON are passed on; only the known ones are checked, and the whole is bounded. */
export const smallJson =
  (max: number): Check =>
  value => {
    try {
      return JSON.stringify(value).length <= max;
    } catch {
      return false;
    }
  };

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

/** The longest a merged text field may hold, or undefined for any other field. */
export function textLimit(type: string, field: string): number | undefined {
  const merged = TYPES.get(type)?.merged;
  return merged && Object.hasOwn(merged, field) ? merged[field]?.limit : undefined;
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
