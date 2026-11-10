/**
 * The server's routes Contacts calls: its own (a photo taken from an address, for an import from
 * Google), Carnet's (a gift idea kept in its « Cadeaux » collection) and Pages' and Carnet's « where
 * is this person mentioned ». Each throws `SyncError` with the server's own words when it refuses
 * (an app turned off answers 404 with its name).
 */
import type { AppId } from '@unlease/core/apps';
import { GIFTS_PATH, isGiftLinkResponse, type GiftLinkRequest, type GiftLinkResponse } from '@unlease/core/sync/gifts';
import { mentionsPath, parseMentionsResponse, type MentionsResponse } from '@unlease/core/sync/mentions';
import { CONTACT_PHOTO_PATH, type ContactPhotoRequest, type ContactPhotoResponse } from '@unlease/contacts/sync/photos';

import type { ServerConfig } from '@shared/app/store/settings';
import { getJson, postJson } from '@shared/app/sync/transport';

function parsePhoto(value: unknown): ContactPhotoResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, mime } = value as { id?: unknown; mime?: unknown };
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id) && typeof mime === 'string' ? { id, mime } : null;
}

/** `POST /api/contacts/photos`: the server fetches the photo and keeps it as an uploaded blob. */
export function takeContactPhoto(config: ServerConfig, body: ContactPhotoRequest, signal?: AbortSignal): Promise<ContactPhotoResponse> {
  return postJson(config, CONTACT_PHOTO_PATH, body, parsePhoto, signal);
}

/** `POST /api/notes/gifts`: Carnet keeps the product's link in its « Cadeaux » collection, for this person. */
export function addGiftIdea(config: ServerConfig, body: GiftLinkRequest, signal?: AbortSignal): Promise<GiftLinkResponse> {
  return postJson(config, GIFTS_PATH, body, value => (isGiftLinkResponse(value) ? value : null), signal);
}

/** `GET /api/<app>/mentions`: the places of that app that mention one of `ids`. */
export function fetchMentions(config: ServerConfig, app: AppId, type: string, ids: readonly string[], signal?: AbortSignal): Promise<MentionsResponse> {
  return getJson(config, mentionsPath(app, type, ids), parseMentionsResponse, signal);
}
