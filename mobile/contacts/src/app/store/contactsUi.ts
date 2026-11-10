/**
 * What this phone alone remembers of Contacts: the list's order (Google's « Trier par », first or last
 * name), the country of the numbers kept without their `+` (« Indicatif par défaut », as the web's),
 * whether the first call already asked to call directly, the birthday notifications' setting, and the
 * duplicates set aside (« Ignorer »). Kept with the device's preferences, never synced.
 */
import { create } from 'zustand';

import { BIRTHDAY_ALERT_DEFAULTS } from '@unlease/contacts/services/birthdays';
import { SORT_ORDERS, type SortOrder } from '@unlease/contacts/services/names';
import { CALLING_CODES } from '@unlease/contacts/services/phones';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';

/** Birthday notifications: off until turned on (Android 13 asks then), the day itself or the day before too, at an hour. */
export interface BirthdaySettings {
  readonly enabled: boolean;
  readonly dayBefore: boolean;
  /** 0 to 23, local time. */
  readonly hour: number;
}

interface ContactsUiState {
  readonly sortOrder: SortOrder;
  /** The country chosen (`FR`), `none` for none; null: the phone's own (its language's region). */
  readonly region: string | null;
  /** CALL_PHONE was asked once: a refusal is not asked again (the dialer opens instead). */
  readonly callAsked: boolean;
  readonly birthdays: BirthdaySettings;
  /** Groups of duplicates set aside, each as its sorted ids joined (`duplicateKey`). */
  readonly ignoredDuplicates: readonly string[];
}

const DEFAULT_BIRTHDAYS: BirthdaySettings = { enabled: false, dayBefore: false, hour: BIRTHDAY_ALERT_DEFAULTS.hour };

const DEFAULTS: ContactsUiState = { sortOrder: 'firstName', region: null, callAsked: false, birthdays: DEFAULT_BIRTHDAYS, ignoredDuplicates: [] };

export const useContactsUiStore = create<ContactsUiState>(() => DEFAULTS);

export const selectSortOrder = (s: ContactsUiState): SortOrder => s.sortOrder;
export const selectRegion = (s: ContactsUiState): string | null => s.region;

/** A region whose calling code is known. */
export const isCallingRegion = (value: unknown): value is string => typeof value === 'string' && Object.hasOwn(CALLING_CODES, value);
export const selectBirthdays = (s: ContactsUiState): BirthdaySettings => s.birthdays;

function readBirthdays(value: unknown): BirthdaySettings {
  if (typeof value !== 'object' || value === null) return DEFAULT_BIRTHDAYS;
  const v = value as Record<string, unknown>;
  return {
    enabled: v.enabled === true,
    dayBefore: v.dayBefore === true,
    hour: typeof v.hour === 'number' && Number.isInteger(v.hour) && v.hour >= 0 && v.hour <= 23 ? v.hour : DEFAULT_BIRTHDAYS.hour,
  };
}

export function loadContactsUi(): void {
  const stored = readPreferences();
  const sort = stored['contacts.sortOrder'];
  const ignored = stored['contacts.ignoredDuplicates'];
  const region = stored['contacts.region'];
  useContactsUiStore.setState({
    sortOrder: SORT_ORDERS.includes(sort as SortOrder) ? (sort as SortOrder) : DEFAULTS.sortOrder,
    region: region === 'none' || isCallingRegion(region) ? region : null,
    callAsked: stored['contacts.callAsked'] === true,
    birthdays: readBirthdays(stored['contacts.birthdays']),
    ignoredDuplicates: Array.isArray(ignored) ? ignored.filter((key): key is string => typeof key === 'string') : [],
  });
}

export function setSortOrder(sortOrder: SortOrder): void {
  writePreference('contacts.sortOrder', sortOrder);
  useContactsUiStore.setState({ sortOrder });
}

/** « Indicatif par défaut »: a region, `none`, or null to follow the phone. */
export function setRegion(region: string | null): void {
  writePreference('contacts.region', region);
  useContactsUiStore.setState({ region });
}

export function setCallAsked(): void {
  writePreference('contacts.callAsked', true);
  useContactsUiStore.setState({ callAsked: true });
}

export function setBirthdaySettings(patch: Partial<BirthdaySettings>): void {
  const birthdays = { ...useContactsUiStore.getState().birthdays, ...patch };
  writePreference('contacts.birthdays', birthdays);
  useContactsUiStore.setState({ birthdays });
}

/** A group of duplicates by its people, whatever their order. */
export const duplicateKey = (ids: readonly string[]): string => [...ids].sort().join(',');

/** « Ignorer »: this group is not offered again on this phone (a new person joining it makes another group). */
export function ignoreDuplicates(ids: readonly string[]): void {
  const ignoredDuplicates = [...new Set([...useContactsUiStore.getState().ignoredDuplicates, duplicateKey(ids)])];
  writePreference('contacts.ignoredDuplicates', ignoredDuplicates);
  useContactsUiStore.setState({ ignoredDuplicates });
}
