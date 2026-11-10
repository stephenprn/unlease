/**
 * « Ce que Claude relève » as Carnet's web app reads it (`notes/services/templates`): a page of facts'
 * address, what a kind's page opens on, the facts' moves and additions, and the preview, facts tried
 * on one page through the server (`POST /api/notes/template-try`), nothing written. The phone's
 * `app/templates.ts`.
 */
import { getLocale, t } from '@unlease/core/i18n';
import { LINK_KINDS, type LinkKind } from '@unlease/notes/models/entities';
import type { TemplateField } from '@unlease/notes/models/templates';
import { TEMPLATE_LIMITS } from '@unlease/notes/models/templates';
import { changedKindTemplate, newFieldId, presetFields, type Templates } from '@unlease/notes/services/templates';
import type { TemplateTryResponse } from '@unlease/notes/sync/templateTry';

import { useSettingsStore } from '@shared/app/store/settings';
import { SyncError, tryTemplate } from './api';

/** A page of facts' address: a kind's usual facts (`kind-recipe`), else an id (a collection's, or an old list's). */
export type TemplateKey = { readonly kind: 'kind'; readonly linkKind: LinkKind } | { readonly kind: 'own'; readonly id: string };

export function templateKey(part: string): TemplateKey {
  const kind = part.startsWith('kind-') ? part.slice('kind-'.length) : '';
  if ((LINK_KINDS as readonly string[]).includes(kind) && kind !== 'other') return { kind: 'kind', linkKind: kind as LinkKind };
  return { kind: 'own', id: part };
}

/** What a kind's editor opens on: the person's changed fields, else the preset's in the interface's language. */
export function kindDraftFields(templates: Templates, kind: LinkKind): readonly TemplateField[] {
  return changedKindTemplate(templates, kind)?.fields ?? presetFields(kind);
}

/** The fields with `id` moved to `index` (kept within the list). */
export function moveField(fields: readonly TemplateField[], id: string, index: number): TemplateField[] {
  const from = fields.findIndex(field => field.id === id);
  if (from < 0) return [...fields];
  const to = Math.max(0, Math.min(fields.length - 1, index));
  const out = fields.filter(field => field.id !== id);
  out.splice(to, 0, fields[from]!);
  return out;
}

/**
 * A field added at the end, eight at most: a « Champs courants » suggestion as it is (its preset id
 * kept unless the template already uses it: a renamed preset field keeps its own), or an empty one.
 */
export function addField(fields: readonly TemplateField[], suggestion?: TemplateField): { readonly fields: TemplateField[]; readonly id: string | null } {
  if (fields.length >= TEMPLATE_LIMITS.fields) return { fields: [...fields], id: null };
  const taken = new Set(fields.map(field => field.id));
  const id = suggestion && !taken.has(suggestion.id) ? suggestion.id : newFieldId(fields);
  const field: TemplateField = suggestion ? { ...suggestion, id } : { id, name: '', type: 'text', hint: '' };
  return { fields: [...fields, field], id };
}

/** « Essayer »: the fields as they stand, read by Claude on `url`, in the interface's language. */
export function tryFields(url: string, fields: readonly TemplateField[], signal?: AbortSignal): Promise<TemplateTryResponse> {
  const server = useSettingsStore.getState().server;
  if (!server) return Promise.reject(new SyncError('network', t('Aucun serveur n’est connecté')));
  return tryTemplate(server, { url: url.trim(), lang: getLocale(), fields }, signal);
}
