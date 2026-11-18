/**
 * What a mention in an event's description reads as (`{@contact=…}`, `{@page=…}`, `{@note=…}`,
 * `{@link=…}`, `{@event=…}`): the name now of what it points at, from the records this phone holds
 * (Agenda syncs Carnet's, Contacts' and Pages' to show them); null once gone. One behind Carnet's lock
 * (its protected section, or a link in a collection there) reads as « Note protégée ».
 */
import { t } from '@unlease/core/i18n';
import type { Ref } from '@unlease/core/refs';
import { shownTitle } from '@unlease/notes/models/entities';
import { isLockedNote } from '@unlease/notes/services/lock';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { contactName } from '@unlease/contacts/services/names';

import type { LibraryState } from './store/libraryStore';

export function nameOf(state: LibraryState, target: Ref): string | null {
  switch (target.type) {
    case 'contact': {
      const contact = resolveContact(state.people.contacts, target.id);
      return contact ? contactName(contact) : null;
    }
    case 'note': {
      const note = state.carnet.notes[target.id];
      if (!note || note.deletedAt !== null) return null;
      return isLockedNote(note) ? t('Protected note') : shownTitle(note).trim() || note.body.split('\n')[0]?.trim() || '…';
    }
    case 'link': {
      const link = state.carnet.links[target.id];
      if (!link || link.deletedAt !== null) return null;
      return isLockedNote(state.carnet.notes[link.noteId]) ? t('Protected note') : link.title.trim() || link.url;
    }
    case 'page': {
      const page = state.blocks[target.id];
      return page && page.deletedAt === null ? page.text.trim() || '…' : null;
    }
    case 'event': {
      const event = state.events[target.id];
      return event && event.deletedAt === null ? event.title.trim() || '…' : null;
    }
    default:
      return null;
  }
}
