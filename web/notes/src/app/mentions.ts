/**
 * What Carnet's formatted notes mention: people (`{@contact=<id>}`), named from Contacts' records this
 * web app holds beside its own (`contactsData`): a contact merged into another names the one kept,
 * one deleted for good reads as gone; and events (`{@event=<id>}`), named from Agenda's
 * (`eventsData`). Installed once (`setMentionNamer`); a change to the contacts or the events tells the
 * caches of what a note reads as to start over (`mentionsChanged`).
 */
import { useMemo } from 'react';

import type { Ref } from '@unlease/core/refs';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { contactName } from '@unlease/contacts/services/names';
import { mentionsChanged, setMentionNamer } from '@unlease/notes/services/noteMentions';

import { useContactsStore } from '@contacts/app/store/library';
import { pathOfRef } from '@shared/modules';
import { useEventsStore } from './events/store';

/** A mention's subject by its name now; null when it is gone, or of a type Carnet's notes do not hold. */
export function nameOfMention(target: Ref): string | null {
  if (target.type === 'event') {
    const event = useEventsStore.getState().events[target.id];
    return event && event.deletedAt === null ? event.title.trim() || '…' : null;
  }
  if (target.type !== 'contact') return null;
  const contact = resolveContact(useContactsStore.getState().contacts, target.id);
  return contact ? contactName(contact) : null;
}

/** Where a mention opens: the contact (the one kept, after a merge) in Contacts' web app, an event in Agenda's. */
export function mentionPath(target: Ref): string | null {
  if (target.type !== 'contact') return pathOfRef(target.type, target.id);
  const kept = resolveContact(useContactsStore.getState().contacts, target.id);
  return pathOfRef('contact', kept?.id ?? target.id);
}

let installed = false;

/** Names mentions from now on, and says so whenever the contacts or the events change. */
export function installMentionNamer(): void {
  setMentionNamer(nameOfMention);
  if (installed) return;
  installed = true;
  useContactsStore.subscribe((state, before) => {
    if (state.contacts !== before.contacts) mentionsChanged();
  });
  useEventsStore.subscribe((state, before) => {
    if (state.events !== before.events) mentionsChanged();
  });
}

/** What the names of the mentions follow, re-rendering when it changes: Contacts' records and Agenda's events. */
export function useMentionedPeople(): unknown {
  const contacts = useContactsStore(s => s.contacts);
  const events = useEventsStore(s => s.events);
  return useMemo(() => [contacts, events], [contacts, events]);
}
