/**
 * The address book as screens read it: the list in its order (all, the favourites, a label's), the
 * bin, the birthdays to come, a label's count. Lists are read as joined ids, so a component
 * re-renders when its list changes, not on every edit elsewhere.
 */
import { useMemo } from 'react';

import type { Contact } from '@unlease/contacts/models/contacts';
import { upcomingBirthdays } from '@unlease/contacts/services/birthdays';
import { findDuplicates, resolveContact, type DuplicateGroup } from '@unlease/contacts/services/duplicates';
import { searchContacts } from '@unlease/contacts/services/search';
import { sortContacts, type SortOrder } from '@unlease/contacts/services/names';

import { deviceRegion, regionFor } from '../reach';
import { duplicateKey, selectRegion, selectSortOrder, useContactsUiStore } from '../store/contactsUi';
import { useLibraryStore, type LibraryState } from '../store/libraryStore';

const split = (joined: string): string[] => (joined ? joined.split(',') : []);

/** What a list shows: every contact, the favourites, or one label's. */
export type ContactsFilter = 'all' | 'favorites' | `label:${string}`;

export function liveContacts(s: LibraryState): Contact[] {
  return s.liveContacts.map(id => s.contacts[id]).filter((contact): contact is Contact => contact !== undefined);
}

export function filterContacts(contacts: readonly Contact[], filter: ContactsFilter): Contact[] {
  if (filter === 'all') return [...contacts];
  if (filter === 'favorites') return contacts.filter(contact => contact.favorite);
  const label = filter.slice('label:'.length);
  return contacts.filter(contact => contact.labelIds.includes(label));
}

/** The ids a list shows, in the list's order; with a query, those it finds, the best first. */
export function listIds(s: LibraryState, filter: ContactsFilter, order: SortOrder, query = ''): string[] {
  const sorted = sortContacts(filterContacts(liveContacts(s), filter), order);
  return (query.trim() ? searchContacts(sorted, s.labels, query, deviceRegion()) : sorted).map(contact => contact.id);
}

export function useContactIds(filter: ContactsFilter, query = ''): string[] {
  const order = useContactsUiStore(selectSortOrder);
  const contacts = useLibraryStore(s => s.contacts);
  const liveIds = useLibraryStore(s => s.liveContacts);
  const labels = useLibraryStore(s => s.labels);
  const joined = useMemo(
    () => listIds({ contacts, liveContacts: liveIds, labels } as LibraryState, filter, order, query).join(','),
    [contacts, liveIds, labels, filter, order, query],
  );
  return useMemo(() => split(joined), [joined]);
}

export function useContact(id: string | null | undefined): Contact | undefined {
  return useLibraryStore(s => (id ? s.contacts[id] : undefined));
}

/** How many live contacts wear each label. */
export function useLabelCounts(): Readonly<Record<string, number>> {
  const contacts = useLibraryStore(s => s.contacts);
  const liveIds = useLibraryStore(s => s.liveContacts);
  return useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of liveIds) for (const label of contacts[id]?.labelIds ?? []) counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, [contacts, liveIds]);
}

/** The contacts in the bin, the last thrown first. */
export function useTrashedContacts(): string[] {
  const joined = useLibraryStore(s =>
    Object.values(s.contacts)
      .filter(contact => contact.deletedAt === null && contact.trashedAt !== null)
      .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0))
      .map(contact => contact.id)
      .join(','),
  );
  return useMemo(() => split(joined), [joined]);
}

/** The live contacts' birthdays within `days` days (today included), the nearest first. */
export function useUpcomingBirthdays(now: number, days: number) {
  const contacts = useLibraryStore(s => s.contacts);
  const liveIds = useLibraryStore(s => s.liveContacts);
  // A day is enough: the minute's clock would sort again every minute.
  const day = Math.floor(now / 86_400_000);
  return useMemo(
    () => upcomingBirthdays(liveIds.map(id => contacts[id]).filter((contact): contact is Contact => contact !== undefined), now, days),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contacts, liveIds, day, days],
  );
}

/** The groups of contacts that are surely one person, those set aside on this phone left out. */
export function useDuplicates(): DuplicateGroup[] {
  const contacts = useLibraryStore(s => s.contacts);
  const liveIds = useLibraryStore(s => s.liveContacts);
  const ignored = useContactsUiStore(s => s.ignoredDuplicates);
  const chosenRegion = useContactsUiStore(selectRegion);
  return useMemo(() => {
    const aside = new Set(ignored);
    return findDuplicates(liveIds.map(id => contacts[id]).filter((contact): contact is Contact => contact !== undefined), regionFor(chosenRegion)).filter(group => !aside.has(duplicateKey(group.ids)));
  }, [contacts, liveIds, ignored, chosenRegion]);
}

/** The contact an id names now: itself, or the one it was merged into (a link from outside, a mention). */
export function useResolvedContact(id: string): Contact | null {
  return useLibraryStore(s => resolveContact(s.contacts, id));
}
