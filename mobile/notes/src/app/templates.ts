/**
 * « Ce que Claude relève » on the phone (`notes/models/templates`): the facts worth sending, the links
 * a preview offers, and facts tried on one page while they are shaped (the preview, `POST
 * /api/notes/template-try`: Claude reads the page with the facts as they stand, spending from the
 * budget; nothing is written).
 */
import { getLocale, t } from '@unlease/core/i18n';
import type { LinkItem } from '@unlease/notes/models/entities';
import type { TemplateField } from '@unlease/notes/models/templates';
import type { TemplateTryResponse } from '@unlease/notes/sync/templateTry';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { SyncError, tryTemplate } from '@app/sync/transport';

/** The fields worth sending: those with a name, their words trimmed. */
export function namedFields(fields: readonly TemplateField[]): TemplateField[] {
  return fields.flatMap(field => (field.name.trim() ? [{ ...field, name: field.name.trim(), hint: field.hint.trim() }] : []));
}

/** The links offered to try a template on: the newest first, a few. */
export function linksToTry(links: readonly LinkItem[], limit = 8): LinkItem[] {
  return [...links].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1)).slice(0, limit);
}

/** « Essayer »: what Claude reads on `url` with these fields, in the interface's language. Throws `SyncError` with the server's words when it refuses. */
export function tryFields(url: string, fields: readonly TemplateField[], signal?: AbortSignal): Promise<TemplateTryResponse> {
  const config = useSettingsStore.getState().server;
  if (!config) return Promise.reject(new SyncError('network', t('No server is connected')));
  return tryTemplate(config, { url: url.trim(), lang: getLocale(), fields: namedFields(fields) }, signal);
}
