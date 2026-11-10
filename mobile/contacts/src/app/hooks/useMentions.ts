/**
 * « Mentionné dans »: the pages and the notes that mention a contact (or one merged into it), and the
 * events it is with (« Vus ensemble »), asked of
 * each app the server runs (`GET /api/<app>/mentions`); nothing without a server. Asked again when the
 * contact's screen opens.
 */
import { useEffect, useMemo, useState } from 'react';

import type { AppId } from '@unlease/core/apps';
import type { MentionPlace } from '@unlease/core/sync/mentions';
import { MENTION_IDS_MAX } from '@unlease/core/sync/mentions';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settingsStore';

import { useLibraryStore } from '../store/libraryStore';
import { fetchMentions } from '../sync/transport';

/** The apps whose records mention people (Agenda's events: as a guest too, « Vus ensemble »). */
const MENTIONING: readonly AppId[] = ['pages', 'notes', 'calendar'];

/** The contact and every one merged into it (through several merges), the contact first. */
export function mentionIds(contacts: ReturnType<typeof useLibraryStore.getState>['contacts'], id: string): string[] {
  const merged = Object.values(contacts)
    .filter(contact => contact.id !== id && contact.mergedInto !== null && resolveContact(contacts, contact.id)?.id === id)
    .map(contact => contact.id);
  return [id, ...merged].slice(0, MENTION_IDS_MAX);
}

export function useMentions(id: string): readonly MentionPlace[] {
  const server = useSettingsStore(selectServer);
  const apps = useSettingsStore(selectServerApps);
  const contacts = useLibraryStore(s => s.contacts);
  const ids = useMemo(() => mentionIds(contacts, id).join(','), [contacts, id]);
  const [places, setPlaces] = useState<readonly MentionPlace[]>([]);
  useEffect(() => {
    if (!server) {
      setPlaces([]);
      return undefined;
    }
    const abort = new AbortController();
    const asked = MENTIONING.filter(app => apps === null || apps.includes(app));
    Promise.all(asked.map(app => fetchMentions(server, app, 'contact', ids.split(','), abort.signal).catch(() => [] as MentionPlace[])))
      .then(found => {
        if (!abort.signal.aborted) setPlaces(found.flat().sort((a, b) => b.editedAt - a.editedAt));
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, [server, apps, ids]);
  return places;
}
