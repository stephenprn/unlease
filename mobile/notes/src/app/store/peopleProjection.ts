/**
 * Contacts' records as Carnet holds them, to name the people its notes mention: Contacts' own
 * projection (borrowed, a leaf: `@contacts-app/app/store/contactsProjection`) kept under one key,
 * `people`, since its keys (`labels`) would meet Carnet's own in one state.
 */
import type { LibraryBase, LibraryProjection } from '@shared/app/store/library';
import { contactsProjection, type ContactsState } from '@contacts-app/app/store/contactsProjection';

export interface PeopleState extends LibraryBase {
  readonly people: ContactsState;
}

export function peopleProjection(): LibraryProjection<PeopleState> {
  const inner = contactsProjection();
  return {
    empty: { people: inner.empty, revision: 0 },
    decode: (base, changed) => {
      const people = inner.decode(base.people, changed);
      // Untouched contacts keep their entries, so a mention re-renders only for its own person.
      return people.contacts === base.people.contacts && people.labels === base.people.labels ? base : { ...base, people };
    },
    clear: () => inner.clear(),
  };
}
