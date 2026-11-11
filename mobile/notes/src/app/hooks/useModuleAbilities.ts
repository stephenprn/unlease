/** What the link modules can count on here (`ModuleAbilities`): a server, Claude and Seerr once the server said they are set up, and Pages and Agenda on the server (« Garder une copie », « Ajouter à l’agenda »). */
import { useMemo } from 'react';

import type { ModuleAbilities } from '@unlease/notes/services/modules';
import { selectSeerr, selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settingsStore';
import { useServerFeature } from '@shared/app/hooks/useServerFeature';

export function useModuleAbilities(): ModuleAbilities {
  const server = useSettingsStore(selectServer) !== null;
  // Not before the server has said: a module asking Claude would only meet a refusal.
  const reading = useServerFeature('claude');
  // Seerr's address, as the server last gave it: '' until it has (already strict).
  const seerr = useSettingsStore(selectSeerr);
  // Only once the server has said it runs Pages: a copy needs its route.
  const pages = useSettingsStore(s => selectServerApps(s)?.includes('pages') === true);
  // Likewise Agenda: « Ajouter à l’agenda » needs its route.
  const agenda = useSettingsStore(s => selectServerApps(s)?.includes('calendar') === true);
  return useMemo(() => ({ server, reading, seerr, pages, agenda }), [server, reading, seerr, pages, agenda]);
}
