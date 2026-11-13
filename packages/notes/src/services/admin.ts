/** Carnet's sections of the Administration, in one line each for its home, the same on both clients. */
import { t } from '@unlease/core/i18n';
import type { StatusLine } from '@unlease/core/services/admin';
import type { SeerrSettings } from '@unlease/core/sync/settings';

/** « Seerr »: linked (its address), or not. */
export function seerrLine(seerr: SeerrSettings | null): StatusLine {
  if (!seerr?.url) return { tone: 'off', title: t('Seerr not linked'), meta: t('The Seerr module shows only once it is linked.') };
  return { tone: 'ok', title: t('Seerr linked'), meta: seerr.url.replace(/^https?:\/\//, '') };
}
