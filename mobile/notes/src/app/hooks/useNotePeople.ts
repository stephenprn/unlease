/**
 * The people of Contacts a note or a link names (`contactIds`), from Contacts' records this phone
 * holds beside Carnet's (`people`): a contact merged into another is the one kept, one deleted for
 * good is left out (its id stays on the note: nothing is dropped that cannot be read here). And those
 * a picker offers: the live ones that answer a search, by first name.
 */
import { useMemo } from 'react';

import type { Contact } from '@unlease/contacts/models/contacts';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { sortContacts } from '@unlease/contacts/services/names';
import { searchContacts } from '@unlease/contacts/services/search';

import { useLibraryStore } from '../store/libraryStore';

/** A person as a note shows them: the contact now, and the id the note holds (the merged one's, maybe). */
export interface NotePerson {
  readonly id: string;
  readonly contact: Contact;
}

/** The people `ids` name now, each once, in the note's order. */
export function useNotePeople(ids: readonly string[]): readonly NotePerson[] {
  const contacts = useLibraryStore(s => s.people.contacts);
  return useMemo(() => {
    const seen = new Set<string>();
    const people: NotePerson[] = [];
    for (const id of ids) {
      const contact = resolveContact(contacts, id);
      if (!contact || seen.has(contact.id)) continue;
      seen.add(contact.id);
      people.push({ id, contact });
    }
    return people;
  }, [contacts, ids]);
}

/** Whether this phone holds anyone to pick (Contacts' records, synced as Carnet reads them). */
export function useHasPeople(): boolean {
  return useLibraryStore(s => s.people.liveContacts.length > 0);
}

/** The live people that answer `query` (everyone, by first name, when nothing is typed). */
export function usePeopleFound(query: string): readonly Contact[] {
  const people = useLibraryStore(s => s.people);
  return useMemo(() => {
    const live = people.liveContacts.map(id => people.contacts[id]).filter((contact): contact is Contact => contact !== undefined);
    return searchContacts(sortContacts(live, 'firstName'), people.labels, query);
  }, [people, query]);
}
