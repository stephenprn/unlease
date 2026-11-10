/** Carnet's sections of the Administration, in one line each for its home, the same on both clients. */
import { t } from '@unlease/core/i18n';
import type { StatusLine } from '@unlease/core/services/admin';
import type { SeerrSettings } from '@unlease/core/sync/settings';

/** « Seerr »: linked (its address), or not. */
export function seerrLine(seerr: SeerrSettings | null): StatusLine {
  if (!seerr?.url) return { tone: 'off', title: t('Seerr non relié'), meta: t('Le module Seerr n’apparaît qu’une fois relié.') };
  return { tone: 'ok', title: t('Seerr relié'), meta: seerr.url.replace(/^https?:\/\//, '') };
}
