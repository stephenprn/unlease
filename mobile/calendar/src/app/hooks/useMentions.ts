/**
 * « Mentionné dans »: the pages and the notes that mention an event, asked of each app the server
 * runs (`GET /api/<app>/mentions?type=event`); nothing without a server. Asked again when the event's
 * screen opens.
 */
import { useEffect, useState } from 'react';

import type { AppId } from '@unlease/core/apps';
import type { MentionPlace } from '@unlease/core/sync/mentions';
import { selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settingsStore';

import { fetchMentions } from '../sync/transport';

/** The apps whose records mention events. */
const MENTIONING: readonly AppId[] = ['pages', 'notes'];

export function useMentions(type: string, id: string): readonly MentionPlace[] {
  const server = useSettingsStore(selectServer);
  const apps = useSettingsStore(selectServerApps);
  const [places, setPlaces] = useState<readonly MentionPlace[]>([]);
  useEffect(() => {
    if (!server) {
      setPlaces([]);
      return undefined;
    }
    const abort = new AbortController();
    const asked = MENTIONING.filter(app => apps === null || apps.includes(app));
    Promise.all(asked.map(app => fetchMentions(server, app, type, [id], abort.signal).catch(() => [] as MentionPlace[])))
      .then(found => {
        if (!abort.signal.aborted) setPlaces(found.flat().sort((a, b) => b.editedAt - a.editedAt));
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, [server, apps, type, id]);
  return places;
}
