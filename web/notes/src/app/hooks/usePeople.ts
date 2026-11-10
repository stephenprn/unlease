/** The people and the events « @ » offers in a note: Contacts' live contacts that match what is typed after it, those whose name starts with it first; Agenda's events. */
import { useMemo } from 'react';

import { isLive, type Contact } from '@unlease/contacts/models/contacts';
import { sortContacts } from '@unlease/contacts/services/names';
import { searchContacts } from '@unlease/contacts/services/search';

import { useContactsStore } from '@contacts/app/store/library';
import { findEvents, type EventHit } from '../events/find';
import { useEventsStore } from '../events/store';
import { nameOfMention } from '../mentions';

/** At most this many in the picker. */
const SHOWN = 8;

export function usePeopleMatching(query: string): readonly Contact[] {
  const contacts = useContactsStore(s => s.contacts);
  const labels = useContactsStore(s => s.labels);
  return useMemo(() => searchContacts(sortContacts(Object.values(contacts).filter(isLive), 'firstName'), labels, query).slice(0, SHOWN), [contacts, labels, query]);
}

/** The events « @ » offers in a note: Agenda's, found by their words (the next ones first when nothing is typed). */
export function useEventsMatching(query: string): readonly EventHit[] {
  const events = useEventsStore(s => s.events);
  const feeds = useEventsStore(s => s.feeds);
  return useMemo(() => findEvents(events, feeds, query, target => nameOfMention(target) ?? '', 4), [events, feeds, query]);
}
