/**
 * The events that mention a page or a note (`GET /api/calendar/mentions`, Agenda's server module):
 * the other way of « Mentionné dans », for Pages' pages and Carnet's notes. Asked as the place opens,
 * and again when what it asks for changes; quiet when it cannot (no server, offline, Agenda off on
 * the server): the list shows only when it holds something.
 */
import { useEffect, useState } from 'react';

import { mentionsPath, parseMentionsResponse, type MentionPlace } from '@unlease/core/sync/mentions';

import { useServerRuns } from '@shared/app/apps';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { getJson } from '@shared/app/sync/transport';

/** Agenda's events that mention `type`/`id`, the last changed first; null while asked. */
export function useEventsMentioning(type: 'page' | 'note' | 'contact', ids: readonly string[]): readonly MentionPlace[] | null {
  const server = useSettingsStore(selectServer);
  const runs = useServerRuns('calendar');
  const key = ids.join(',');
  const want = `${type}|${key}|${server?.url ?? ''}`;
  const [found, setFound] = useState<{ readonly key: string; readonly places: readonly MentionPlace[] } | null>(null);
  useEffect(() => {
    if (!server || !runs || !key) return;
    const controller = new AbortController();
    getJson(server, mentionsPath('calendar', type, key.split(',')), parseMentionsResponse, controller.signal).then(
      answer => !controller.signal.aborted && setFound({ key: want, places: answer.places.filter(place => place.app === 'calendar') }),
      () => !controller.signal.aborted && setFound({ key: want, places: [] }),
    );
    return () => controller.abort();
  }, [server, runs, type, key, want]);
  if (!server || !runs || !key) return [];
  return found?.key === want ? found.places : null;
}
