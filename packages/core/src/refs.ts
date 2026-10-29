/**
 * What a person can point at, in any app of the suite: a mention in rich text (`{@type=id}`,
 * `services/richText`), a bookmark or an embed (a block's `targetType` and `targetId`). Record ids
 * are UUIDs, unique across every app, so a reference is the type (which app shows it, as what) and
 * the id. Every program knows every type, installed or not; a type it does not know (written by a
 * newer client) travels and is kept as it is, and reads as unavailable.
 */
import type { AppId } from './apps';

export interface RefTypeInfo {
  /** The app that shows it, and opens it at `<slug>://<type>/<id>` on the phone. */
  readonly app: AppId;
  /** The record type it is stored as. */
  readonly record: string;
}

/** Append only: the keys are stored inside other records. */
export const REF_TYPES = {
  /** A note, or a collection (a note of kind `links`). */
  note: { app: 'notes', record: 'note' },
  link: { app: 'notes', record: 'link' },
  /** A page: a `block` of kind `page`. */
  page: { app: 'notes', record: 'block' },
} as const satisfies Readonly<Record<string, RefTypeInfo>>;

export type RefType = keyof typeof REF_TYPES;

export const REF_TYPE_KEYS = Object.keys(REF_TYPES) as readonly RefType[];

export interface Ref {
  /** One of `REF_TYPES`, or one a newer client added (`isRefType` tells them apart). */
  readonly type: string;
  readonly id: string;
}

/** A reference this build knows how to show. */
export interface KnownRef extends Ref {
  readonly type: RefType;
}

/** How a type is written wherever a reference is stored: a newer client's must pass through older ones. */
export const REF_TYPE_PATTERN = /^[a-z][a-zA-Z]{0,31}$/;

export function isRefType(value: unknown): value is RefType {
  return typeof value === 'string' && Object.hasOwn(REF_TYPES, value);
}

export function isKnownRef(ref: Ref): ref is KnownRef {
  return isRefType(ref.type);
}

/** One key per reference (`page:0192…`), to compare or index them. */
export function refKey(ref: Ref): string {
  return `${ref.type}:${ref.id}`;
}
