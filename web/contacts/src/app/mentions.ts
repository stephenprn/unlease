/**
 * « Mentionné dans »: the pages and the notes that mention a person, and the events it is with or
 * that mention it (« Vus ensemble »), asked of the apps the server runs (Pages', Carnet's, Agenda's:
 * `GET /api/<app>/mentions`), for the contact and those merged into it. Asked
 * again each time the contact's page opens or what it asks for changes; quiet when it cannot (no
 * server, offline, an app turned off): the list is only shown when it holds something.
 */
import { useEffect, useMemo, useState } from 'react';

import type { AppId } from '@unlease/core/apps';
import type { MentionPlace } from '@unlease/core/sync/mentions';
import { resolveContact } from '@unlease/contacts/services/duplicates';

import { selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settings';
import { fetchMentions } from './api';
import { useContactsStore } from './store/library';

/** The apps whose places can mention a person (Agenda's events: as a guest too). */
const MENTIONING: readonly AppId[] = ['pages', 'notes', 'calendar'];

/** The contact and every contact merged into it (through several merges too). */
export function mentionIds(contacts: Parameters<typeof resolveContact>[0], id: string): string[] {
  const merged = Object.values(contacts)
    .filter(contact => contact.id !== id && contact.mergedInto && resolveContact(contacts, contact.id)?.id === id)
    .map(contact => contact.id)
    .sort();
  return [id, ...merged];
}

/** The places that mention `id` (and those merged into it), the last changed first; null while asked. */
export function useMentionedIn(id: string): readonly MentionPlace[] | null {
  const contacts = useContactsStore(s => s.contacts);
  const key = useMemo(() => mentionIds(contacts, id).join(','), [contacts, id]);
  const server = useSettingsStore(selectServer);
  const apps = useSettingsStore(selectServerApps);
  const asked = (apps ?? MENTIONING).filter(app => MENTIONING.includes(app));
  const appsKey = asked.join(',');
  const [found, setFound] = useState<{ readonly key: string; readonly places: readonly MentionPlace[] } | null>(null);
  const want = `${key}|${appsKey}|${server?.url ?? ''}`;
  useEffect(() => {
    if (!server || !appsKey) return;
    const controller = new AbortController();
    const ids = key.split(',');
    void Promise.all(
      appsKey.split(',').map(app =>
        fetchMentions(server, app as AppId, 'contact', ids, controller.signal).then(
          answer => answer.places,
          () => [] as MentionPlace[],
        ),
      ),
    ).then(lists => {
      if (controller.signal.aborted) return;
      const seen = new Set<string>();
      const places = lists
        .flat()
        .filter(place => {
          const at = `${place.app}:${place.type}:${place.id}`;
          if (seen.has(at)) return false;
          seen.add(at);
          return true;
        })
        .sort((a, b) => b.editedAt - a.editedAt);
      setFound({ key: want, places });
    });
    return () => controller.abort();
  }, [server, appsKey, key, want]);
  if (!server || !appsKey) return [];
  return found?.key === want ? found.places : null;
}
