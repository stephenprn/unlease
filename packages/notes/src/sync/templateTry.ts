/**
 * « Essayer sur un lien » (`POST /api/notes/template-try` a TemplateTryRequest -> TemplateTryResponse,
 * or 4xx/5xx { error } in French): the server reads one page with the fields a template is being
 * shaped with, as it reads a link (the same digest, the same fixed prompt, the fields in the
 * message), and says what Claude put in each, writing nothing. It spends from Claude's budget like
 * a reading; a page read in the last minutes is not fetched again.
 */
import { isLocale, type Locale } from '@unlease/core/i18n';
import type { LinkAttribute } from '../models/entities';
import { TEMPLATE_LIMITS, type TemplateField } from '../models/templates';
import { parseTemplateFields } from '../services/templates';

export const TEMPLATE_TRY_PATH = '/api/notes/template-try';

export interface TemplateTryRequest {
  /** The page to read: a saved link's address, or one pasted. */
  readonly url: string;
  /** The language Claude writes the values in: the interface's. */
  readonly lang: Locale;
  /** The fields as they stand in the editor, unsaved. */
  readonly fields: readonly TemplateField[];
}

export interface TemplateTryResponse {
  /** The page's title as Claude read it. */
  readonly title: string;
  /** What Claude put in each field, by field id; a field the page says nothing about is absent. */
  readonly values: Readonly<Record<string, string>>;
  /** What the reading cost, in dollars (0 when it came from a reading kept). */
  readonly costUsd: number;
}

const URL_MAX = 4000;
const VALUE_MAX = 300;

export function parseTemplateTryRequest(body: unknown): TemplateTryRequest | null {
  const raw = body as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object' || typeof raw.url !== 'string' || !isLocale(raw.lang)) return null;
  const url = raw.url.trim();
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > URL_MAX) return null;
  const fields = parseTemplateFields(raw.fields);
  if (fields.length === 0 || (Array.isArray(raw.fields) && raw.fields.length > TEMPLATE_LIMITS.fields)) return null;
  return { url, lang: raw.lang, fields };
}

export function parseTemplateTryResponse(body: unknown): TemplateTryResponse | null {
  const raw = body as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string' || typeof raw.values !== 'object' || raw.values === null) return null;
  const values: Record<string, string> = {};
  for (const [id, value] of Object.entries(raw.values as Record<string, unknown>)) {
    if (/^[A-Za-z0-9]{1,24}$/.test(id) && typeof value === 'string' && value.trim()) values[id] = value.trim().slice(0, VALUE_MAX);
  }
  const cost = typeof raw.costUsd === 'number' && Number.isFinite(raw.costUsd) && raw.costUsd >= 0 ? raw.costUsd : 0;
  return { title: raw.title.slice(0, 500), values, costUsd: cost };
}

/** A tried template's values as a link's facts would hold them: in the fields' order, labelled with their names. */
export function triedAttributes(fields: readonly TemplateField[], values: Readonly<Record<string, string>>): LinkAttribute[] {
  return fields.flatMap(field => (values[field.id] ? [{ label: field.name, value: values[field.id]! }] : []));
}
