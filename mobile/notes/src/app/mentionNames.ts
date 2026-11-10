/**
 * What a mention of a person in a formatted note reads as (`notes/services/noteMentions`): their name
 * from Contacts' records this phone holds (one merged into another named as the one kept), told
 * again whenever those records change, so a card, a widget or a search shows the new name.
 */
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { contactName } from '@unlease/contacts/services/names';
import { mentionsChanged, setMentionNamer } from '@unlease/notes/services/noteMentions';

import { useLibraryStore } from './store/libraryStore';

let started = false;

/** Once, after the library loads (bootstrap). */
export function startMentionNames(): void {
  if (started) return;
  started = true;
  setMentionNamer(target => {
    if (target.type === 'event') {
      const event = useLibraryStore.getState().agenda.events[target.id];
      return event && event.deletedAt === null ? event.title.trim() || '…' : null;
    }
    if (target.type !== 'contact') return null;
    const contact = resolveContact(useLibraryStore.getState().people.contacts, target.id);
    return contact ? contactName(contact) : null;
  });
  useLibraryStore.subscribe((state, previous) => {
    if (state.people !== previous.people || state.agenda.events !== previous.agenda.events) mentionsChanged();
  });
}
