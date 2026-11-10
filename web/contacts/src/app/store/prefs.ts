/**
 * What this browser keeps of Contacts' own, in localStorage beside the shell's settings and never
 * synced: the list's order (by first name, as Google does, or by last name), and the country of the
 * numbers kept without their `+` (« Indicatif par défaut »: a national number takes its calling code
 * for WhatsApp, as the phone's dialer does), and the groups of duplicates set aside (« Ignorer »). Every access is guarded: blocked storage only means
 * nothing is remembered.
 */
import { create } from 'zustand';

import { getLocale } from '@unlease/core/i18n';
import { SORT_ORDERS, type SortOrder } from '@unlease/contacts/services/names';
import { CALLING_CODES, regionOf } from '@unlease/contacts/services/phones';

import { getStorageName } from '@shared/app/env';

export interface ContactsPrefs {
  readonly sortOrder: SortOrder;
  /** The country chosen in Réglages (`FR`), `none` for none; null: not chosen, the browser's is taken (`defaultRegion`). */
  readonly region: string | null;
  /** Groups of duplicates set aside, each by its sorted ids (`dismissalKey`). */
  readonly dismissed: readonly string[];
}

const DEFAULTS: ContactsPrefs = { sortOrder: 'firstName', region: null, dismissed: [] };

/** A group set aside stays so while it holds the same people. */
export const dismissalKey = (ids: readonly string[]): string => [...ids].sort().join(',');

/** At most this many groups are remembered as set aside (the oldest go). */
const DISMISSED_MAX = 500;

export const usePrefsStore = create<ContactsPrefs>(() => DEFAULTS);

const storageKey = (): string => `${getStorageName()}.contacts`;

/** A region whose calling code is known. */
export const isCallingRegion = (value: unknown): value is string => typeof value === 'string' && Object.hasOwn(CALLING_CODES, value);

/** The browser's: the first of its languages that names a country with a known calling code, else France in French, else none. */
export function defaultRegion(): string | null {
  const languages = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]);
  for (const tag of languages) {
    const region = regionOf(tag);
    if (isCallingRegion(region)) return region;
  }
  return getLocale() === 'fr' ? 'FR' : null;
}

/** The country national numbers belong to, on this device; null for none. */
export function callingRegion(prefs: ContactsPrefs = usePrefsStore.getState()): string | null {
  if (prefs.region === 'none') return null;
  return prefs.region ?? defaultRegion();
}

export function loadPrefs(): void {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey()) ?? '{}');
    if (typeof parsed === 'object' && parsed !== null) stored = parsed as Record<string, unknown>;
  } catch {
    // Unreadable or blocked: the defaults.
  }
  const order = (SORT_ORDERS as readonly unknown[]).includes(stored.sortOrder) ? (stored.sortOrder as SortOrder) : DEFAULTS.sortOrder;
  const region = stored.region === 'none' || isCallingRegion(stored.region) ? stored.region : null;
  const dismissed = Array.isArray(stored.dismissed) ? stored.dismissed.filter((key): key is string => typeof key === 'string').slice(-DISMISSED_MAX) : [];
  usePrefsStore.setState({ sortOrder: order, region, dismissed }, true);
}

function save(patch: Partial<ContactsPrefs>): void {
  usePrefsStore.setState(patch);
  try {
    localStorage.setItem(storageKey(), JSON.stringify(usePrefsStore.getState()));
  } catch {
    // Blocked storage: the choice holds for this visit only.
  }
}

export const setSortOrder = (sortOrder: SortOrder): void => save({ sortOrder });

/** A country (`FR`), `none`, or null to follow the browser again. */
export const setRegion = (region: string | null): void => save({ region });

/** « Ignorer »: this group is no longer offered on this device. */
export function dismissDuplicates(ids: readonly string[]): void {
  const key = dismissalKey(ids);
  const { dismissed } = usePrefsStore.getState();
  if (!dismissed.includes(key)) save({ dismissed: [...dismissed, key].slice(-DISMISSED_MAX) });
}

export const useSortOrder = (): SortOrder => usePrefsStore(s => s.sortOrder);

/** The country national numbers belong to, re-rendering when it is chosen again. */
export const useCallingRegion = (): string | null => usePrefsStore(s => callingRegion(s));

/** Test seam. */
export function resetPrefs(): void {
  usePrefsStore.setState(DEFAULTS, true);
}
