/** Carnet's own section of the Administration (Seerr), in its Administration and its setup. */
import { seerrLine } from '@unlease/notes/services/admin';

import type { AdminSection } from '@shared/modules';
import { SEERR_INFO, SeerrSection } from './ui/features/settings/SeerrSection';

export const NOTES_ADMIN_SECTIONS: readonly AdminSection[] = [
  { id: 'seerr', app: 'notes', title: () => 'Seerr', glyph: 'film', line: settings => seerrLine(settings.seerr), info: SEERR_INFO, task: 'seerr', Body: ({ server, settings }) => <SeerrSection server={server} seerr={settings.seerr} /> },
];
