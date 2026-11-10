/**
 * What an event's description mentions, named and placed: a contact (the one kept after a merge),
 * a note or a collection and a link of Carnet's, a page of Pages', another event; each from the
 * records this web app holds (`main.tsx`'s reads). A mention nobody names reads as gone.
 */
import { t } from '@unlease/core/i18n';
import type { Ref } from '@unlease/core/refs';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { contactName } from '@unlease/contacts/services/names';
import { shownTitle } from '@unlease/notes/models/entities';

import { useContactsStore } from '@contacts/app/store/library';
import { useLibraryStore } from '@notes/app/store/library';
import { pathOfRef } from '@shared/modules';
import { useCalendarStore } from './store/library';
import { pageTitle, usePageBlocksStore } from './store/pageBlocks';

/** A mention's subject by its name now; null when it is gone or unknown here. */
export function nameOf(target: Ref): string | null {
  switch (target.type) {
    case 'contact': {
      const contact = resolveContact(useContactsStore.getState().contacts, target.id);
      return contact ? contactName(contact) : null;
    }
    case 'note': {
      const note = useLibraryStore.getState().notes[target.id];
      return note && note.deletedAt === null ? shownTitle(note).trim() || t('Note sans titre') : null;
    }
    case 'link': {
      const link = useLibraryStore.getState().links[target.id];
      return link && link.deletedAt === null ? link.title.trim() || link.url : null;
    }
    case 'page': {
      const title = pageTitle(target.id);
      return title === null ? null : title || t('Sans titre');
    }
    case 'event': {
      const event = useCalendarStore.getState().events[target.id];
      return event && event.deletedAt === null ? event.title.trim() || t('Sans titre') : null;
    }
    default:
      return null;
  }
}

/** A mention as words: its name, or what it was once gone. */
export function mentionWords(target: Ref): string {
  return nameOf(target) ?? (target.type === 'contact' ? t('Contact supprimé') : t('Indisponible ici'));
}

/** Where a mention opens: a contact merged into another opens the one kept. */
export function mentionPath(target: Ref): string | null {
  if (target.type === 'contact') {
    const kept = resolveContact(useContactsStore.getState().contacts, target.id);
    return pathOfRef('contact', kept?.id ?? target.id);
  }
  if (target.type === 'line') return `/notes/line/${encodeURIComponent(target.id)}`;
  return pathOfRef(target.type, target.id);
}

/** Re-renders when any of the names may have changed. */
export function useNamesRevision(): string {
  const contacts = useContactsStore(s => s.revision);
  const notes = useLibraryStore(s => s.revision);
  const pages = usePageBlocksStore(s => s.revision);
  const events = useCalendarStore(s => s.revision);
  return `${contacts}:${notes}:${pages}:${events}`;
}
