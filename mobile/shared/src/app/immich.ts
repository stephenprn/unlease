/**
 * Immich, as the server passes it on (`/api/immich/…`, `@unlease/core/sync/immich`): its albums, its
 * photos, its people, a face kept as a contact's photo, and the address of a picture with the token
 * (React Native's image cache keeps it on disk, so a page shows its photos again offline). The web's
 * `@shared/app/immich`.
 */
import { useMemo } from 'react';

import {
  IMMICH_PATH,
  immichPicturePath,
  parseImmichAlbumResponse,
  parseImmichAlbums,
  parseImmichAssets,
  parseImmichPeople,
  parseImmichPhoto,
  type ImmichAlbum,
  type ImmichAlbumResponse,
  type ImmichAssetsResponse,
  type ImmichPerson,
  type ImmichPhotoResponse,
  type ImmichSize,
} from '@unlease/core/sync/immich';
import { authHeader } from '@unlease/core/sync/protocol';

import { selectServer, useSettingsStore, type ServerConfig } from './store/settingsStore';
import { askServer, getFromServer } from './sync/transport';

const TIMEOUT_MS = 20_000;

export function fetchImmichAlbums(config: ServerConfig, signal?: AbortSignal): Promise<readonly ImmichAlbum[]> {
  return getFromServer(config, `${IMMICH_PATH}/albums`, body => parseImmichAlbums(body).albums, signal, TIMEOUT_MS);
}

export function fetchImmichAlbum(config: ServerConfig, id: string, signal?: AbortSignal): Promise<ImmichAlbumResponse> {
  return getFromServer(config, `${IMMICH_PATH}/albums/${encodeURIComponent(id)}`, parseImmichAlbumResponse, signal, TIMEOUT_MS);
}

/** The latest photos, a page at a time, or those that show what `query` says. */
export function fetchImmichAssets(config: ServerConfig, options: { readonly page?: number; readonly query?: string }, signal?: AbortSignal): Promise<ImmichAssetsResponse> {
  const query = options.query?.trim() ? `&q=${encodeURIComponent(options.query.trim())}` : '';
  return getFromServer(config, `${IMMICH_PATH}/assets?page=${options.page ?? 1}${query}`, parseImmichAssets, signal, TIMEOUT_MS);
}

export function fetchImmichPeople(config: ServerConfig, signal?: AbortSignal): Promise<readonly ImmichPerson[]> {
  return getFromServer(config, `${IMMICH_PATH}/people`, body => parseImmichPeople(body).people, signal, TIMEOUT_MS);
}

/** A person's face, kept by the server as a blob: a contact's `photoId` (already uploaded). */
export function takeImmichFace(config: ServerConfig, personId: string, signal?: AbortSignal): Promise<ImmichPhotoResponse> {
  return askServer(config, `${IMMICH_PATH}/people/${encodeURIComponent(personId)}/photo`, {}, parseImmichPhoto, signal, TIMEOUT_MS);
}

/** A picture's source for `Image`: the server's address with the token; null without a server. */
export function useImmichSource(kind: 'asset' | 'person', id: string | null, size: ImmichSize = 'thumbnail'): { readonly uri: string; readonly headers: Record<string, string> } | null {
  const server = useSettingsStore(selectServer);
  return useMemo(() => (server && id ? { uri: `${server.url}${immichPicturePath(kind, id, size)}`, headers: authHeader(server.token) } : null), [server, id, kind, size]);
}
