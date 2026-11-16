/** The lists the screens draw, derived from the library and kept while it does not change. */
import { useMemo } from 'react';

import { isLive, type Contact, type ContactLabel } from '@unlease/contacts/models/contacts';
import { cleanupCounts, shownCleanups, type CleanupFinding, type FixingTool } from '@unlease/contacts/services/cleanup';
import { findDuplicates, type DuplicateGroup } from '@unlease/contacts/services/duplicates';
import { sortContacts, sortLabels } from '@unlease/contacts/services/names';

import { useContactsStore } from '../store/library';
import { callingRegion, cleanupRegion, dismissalKey, usePrefsStore, useSortOrder } from '../store/prefs';

/** Every live contact, in the list's order. */
export function useLiveContacts(): readonly Contact[] {
  const contacts = useContactsStore(s => s.contacts);
  const order = useSortOrder();
  return useMemo(() => sortContacts(Object.values(contacts).filter(isLive), order), [contacts, order]);
}

/** The contacts in the bin, the last binned first. */
export function useTrashedContacts(): readonly Contact[] {
  const contacts = useContactsStore(s => s.contacts);
  return useMemo(
    () =>
      Object.values(contacts)
        .filter(contact => contact.deletedAt === null && contact.trashedAt !== null)
        .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)),
    [contacts],
  );
}

/** The live labels, by name. */
export function useLiveLabels(): readonly ContactLabel[] {
  const labels = useContactsStore(s => s.labels);
  return useMemo(() => sortLabels(Object.values(labels).filter(label => label.deletedAt === null)), [labels]);
}

/** How many live contacts wear each label. */
export function useLabelCounts(): ReadonlyMap<string, number> {
  const contacts = useContactsStore(s => s.contacts);
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const contact of Object.values(contacts)) {
      if (!isLive(contact)) continue;
      for (const id of contact.labelIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [contacts]);
}

/** The groups of duplicates (`findDuplicates`), but those set aside on this device. */
export function useDuplicates(): readonly DuplicateGroup[] {
  const contacts = useContactsStore(s => s.contacts);
  const dismissed = usePrefsStore(s => s.dismissed);
  const region = usePrefsStore(callingRegion);
  const groups = useMemo(() => findDuplicates(Object.values(contacts), region), [contacts, region]);
  return useMemo(() => {
    const aside = new Set(dismissed);
    return groups.filter(group => !aside.has(dismissalKey(group.ids)));
  }, [groups, dismissed]);
}

/** The findings of « Nettoyer les contacts » set aside on this device. */
function useCleanupAside(): ReadonlySet<string> {
  const aside = usePrefsStore(s => s.cleanupAside);
  return useMemo(() => new Set(aside), [aside]);
}

/** A tool's findings (`findCleanups`), but those set aside; `region` the country national numbers belong to. */
export function useCleanups(tool: FixingTool, region: string | null): readonly CleanupFinding[] {
  const contacts = useContactsStore(s => s.contacts);
  const aside = useCleanupAside();
  return useMemo(() => shownCleanups(tool, Object.values(contacts), region, aside), [tool, contacts, region, aside]);
}

/** How many findings each tool has, the numbers read in the « Indicatif par défaut »'s country. */
export function useCleanupCounts(): Readonly<Record<FixingTool, number>> {
  const contacts = useContactsStore(s => s.contacts);
  const region = usePrefsStore(cleanupRegion);
  const aside = useCleanupAside();
  return useMemo(() => cleanupCounts(Object.values(contacts), region, aside), [contacts, region, aside]);
}
