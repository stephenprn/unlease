/**
 * « Note du jour »: the day's page in Pages' « Journal », found or made by Pages' module (`POST
 * /api/pages/daily`), then opened in Pages' web app. The day view's bar and « Aujourd'hui » both open
 * it this way.
 */
import { getLocale, t } from '@unlease/core/i18n';

import { selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settings';
import { showError } from '@shared/app/store/ui';
import { suitePlace } from '@shared/app/suitePlaces';
import { navigate } from '@shared/ui/router';
import { makeDailyPage } from '../../app/api';

/** The day's page, made the first time. */
export async function openDailyNote(day: string): Promise<void> {
  const server = useSettingsStore.getState().server;
  if (!server) return;
  try {
    const made = await makeDailyPage(server, { day, lang: getLocale() });
    navigate(suitePlace('page', made.pageId)!);
  } catch (error) {
    showError(error instanceof Error ? error.message : t('Le serveur ne répond pas'));
  }
}

/** Whether « Note du jour » can be offered: a server, running Pages. */
export function useDailyNoteOffered(): boolean {
  const server = useSettingsStore(selectServer);
  const apps = useSettingsStore(selectServerApps);
  return !!server && (!apps || apps.includes('pages'));
}
