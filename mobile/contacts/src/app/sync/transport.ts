/**
 * Contacts' routes on the server (a photo the server fetches from an address, an import's Google
 * photo), and those of the other apps it asks (where a person is mentioned, a gift idea for Carnet), over the suite's transport (`@shared/app/sync/transport`), which this file hands on whole.
 */
import type { AppId } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { GIFTS_PATH, isGiftLinkResponse, type GiftLinkRequest, type GiftLinkResponse } from '@unlease/core/sync/gifts';
import { mentionsPath, parseMentionsResponse, type MentionPlace } from '@unlease/core/sync/mentions';
import { authHeader } from '@unlease/core/sync/protocol';
import { CONTACT_PHOTO_PATH, type ContactPhotoResponse } from '@unlease/contacts/sync/photos';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { askServer, SyncError } from '@shared/app/sync/transport';

export * from '@shared/app/sync/transport';

function parsePhoto(value: unknown): ContactPhotoResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, mime } = value as { id?: unknown; mime?: unknown };
  return typeof id === 'string' && id && typeof mime === 'string' ? { id, mime } : null;
}

/** `POST /api/contacts/photos`: the server fetches the picture at `url` and keeps it as an uploaded blob. */
export function fetchContactPhoto(config: ServerConfig, url: string, signal?: AbortSignal): Promise<ContactPhotoResponse> {
  return askServer(config, CONTACT_PHOTO_PATH, { url }, parsePhoto, signal);
}

/** `POST /api/notes/gifts`: a product's link kept in Carnet's « Cadeaux » collection, for someone. 404 while Carnet is off. */
export function addGiftLink(config: ServerConfig, request: GiftLinkRequest, signal?: AbortSignal): Promise<GiftLinkResponse> {
  return askServer(config, GIFTS_PATH, request, value => (isGiftLinkResponse(value) ? value : null), signal);
}

const MENTIONS_TIMEOUT_MS = 15_000;

/** `GET /api/<app>/mentions`: that app's places mentioning one of `ids` (a contact, and those merged into it). Empty while the app is off. */
export async function fetchMentions(config: ServerConfig, app: AppId, type: string, ids: readonly string[], signal?: AbortSignal): Promise<readonly MentionPlace[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MENTIONS_TIMEOUT_MS);
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const response = await fetch(`${config.url}${mentionsPath(app, type, ids)}`, { method: 'GET', headers: authHeader(config.token), signal: controller.signal });
    if (response.status === 404) return [];
    if (!response.ok) throw new SyncError('http', t('Le serveur a répondu {status}', { status: response.status }), response.status);
    return parseMentionsResponse(await response.json()).places;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
