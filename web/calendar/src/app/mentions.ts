/**
 * « Mentionné dans »: the pages (Pages) and the notes (Carnet) that mention an event, asked of the
 * apps the server runs (`GET /api/<app>/mentions?type=event`). Asked again each time the event opens;
 * quiet when it cannot (no server, offline, an app turned off): the list shows only what it holds.
 */
import { useEffect, useState } from 'react';

import type { AppId } from '@unlease/core/apps';
import type { MentionPlace } from '@unlease/core/sync/mentions';

import { selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settings';
import { fetchMentions } from './api';

/** The apps whose places can mention an event. */
const MENTIONING: readonly AppId[] = ['pages', 'notes'];

/** The places that mention the event, the last changed first; null while asked. */
export function useMentionedIn(id: string): readonly MentionPlace[] | null {
  const server = useSettingsStore(selectServer);
  const apps = useSettingsStore(selectServerApps);
  const asked = (apps ?? MENTIONING).filter(app => MENTIONING.includes(app)).join(',');
  const want = `${id}|${asked}|${server?.url ?? ''}`;
  const [found, setFound] = useState<{ readonly key: string; readonly places: readonly MentionPlace[] } | null>(null);
  useEffect(() => {
    if (!server || !asked) return;
    const controller = new AbortController();
    void Promise.all(
      asked.split(',').map(app =>
        fetchMentions(server, app as AppId, 'event', [id], controller.signal).then(
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
          const key = `${place.app}:${place.type}:${place.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => b.editedAt - a.editedAt);
      setFound({ key: want, places });
    });
    return () => controller.abort();
  }, [server, asked, id, want]);
  if (!server || !asked) return [];
  return found?.key === want ? found.places : null;
}
