/** The contacts a list shows: every one (or those the search finds), the favourites, a label's. */
import type { Contact, ContactLabel } from '@unlease/contacts/models/contacts';
import { searchContacts } from '@unlease/contacts/services/search';

import { callingRegion } from '../../app/store/prefs';
import type { Route } from '@shared/ui/router';

export function visibleContacts(route: Route, all: readonly Contact[], labels: Readonly<Record<string, ContactLabel>>, query: string): readonly Contact[] {
  switch (route.name) {
    case 'contacts':
      return query.trim() ? searchContacts(all, labels, query, callingRegion()) : all;
    case 'contactsFavorites':
      return all.filter(contact => contact.favorite);
    case 'contactsLabel':
      return all.filter(contact => contact.labelIds.includes(route.id));
    default:
      return [];
  }
}
