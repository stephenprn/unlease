/** What the link modules can count on here (`ModuleAbilities`): a server, Claude, Seerr, and Pages and Agenda on the server (« Garder une copie », « Ajouter à l’agenda »). */
import { useMemo } from 'react';

import type { ModuleAbilities } from '@unlease/notes/services/modules';
import { selectCanRead, selectSeerr, selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settingsStore';

export function useModuleAbilities(): ModuleAbilities {
  const server = useSettingsStore(selectServer) !== null;
  const reading = useSettingsStore(selectCanRead);
  const seerr = useSettingsStore(selectSeerr);
  // Only once the server has said it runs Pages: a copy needs its route.
  const pages = useSettingsStore(s => selectServerApps(s)?.includes('pages') === true);
  // Likewise Agenda: « Ajouter à l’agenda » needs its route.
  const agenda = useSettingsStore(s => selectServerApps(s)?.includes('calendar') === true);
  return useMemo(() => ({ server, reading, seerr, pages, agenda }), [server, reading, seerr, pages, agenda]);
}
