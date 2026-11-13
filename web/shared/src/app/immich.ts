/**
 * Immich, as the server passes it on (`/api/immich/…`, `@unlease/core/sync/immich`): its albums, its
 * photos, its people, and their pictures. The server wants its token on every request, so a picture
 * is fetched as bytes and shown through an object URL, kept for every component that shows it (a
 * few hundred at most, the oldest let go), loaded at most four at a time.
 */
import { useEffect, useState } from 'react';

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

import { useSettingsStore, type ServerConfig } from './store/settings';
import { getJson, postJson } from './sync/transport';

export function fetchImmichAlbums(config: ServerConfig, signal?: AbortSignal): Promise<readonly ImmichAlbum[]> {
  return getJson(config, `${IMMICH_PATH}/albums`, body => parseImmichAlbums(body).albums, signal);
}

export function fetchImmichAlbum(config: ServerConfig, id: string, signal?: AbortSignal): Promise<ImmichAlbumResponse> {
  return getJson(config, `${IMMICH_PATH}/albums/${encodeURIComponent(id)}`, parseImmichAlbumResponse, signal);
}

/** The latest photos, a page at a time, or those that show what `query` says. */
export function fetchImmichAssets(config: ServerConfig, options: { readonly page?: number; readonly query?: string }, signal?: AbortSignal): Promise<ImmichAssetsResponse> {
  const params = new URLSearchParams({ page: String(options.page ?? 1) });
  if (options.query?.trim()) params.set('q', options.query.trim());
  return getJson(config, `${IMMICH_PATH}/assets?${params}`, parseImmichAssets, signal);
}

export function fetchImmichPeople(config: ServerConfig, signal?: AbortSignal): Promise<readonly ImmichPerson[]> {
  return getJson(config, `${IMMICH_PATH}/people`, body => parseImmichPeople(body).people, signal);
}

/** A person's face, kept by the server as a blob: a contact's `photoId` (already uploaded). */
export function takeImmichFace(config: ServerConfig, personId: string, signal?: AbortSignal): Promise<ImmichPhotoResponse> {
  return postJson(config, `${IMMICH_PATH}/people/${encodeURIComponent(personId)}/photo`, {}, parseImmichPhoto, signal);
}

const MAX_KEPT = 300;
const MAX_CONCURRENT = 4;

/** Object URLs by path, the latest used last: `null` while loading, `false` when it failed. */
const kept = new Map<string, Promise<string | null>>();
const queue: (() => Promise<void>)[] = [];
let active = 0;

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()!;
    active += 1;
    void job().finally(() => {
      active -= 1;
      pump();
    });
  }
}

function pictureUrl(config: ServerConfig, path: string): Promise<string | null> {
  const key = `${config.url}${path}`;
  const found = kept.get(key);
  if (found) {
    kept.delete(key);
    kept.set(key, found);
    return found;
  }
  const loading = new Promise<string | null>(resolve => {
    queue.push(async () => {
      try {
        const response = await fetch(key, { headers: authHeader(config.token) });
        resolve(response.ok ? URL.createObjectURL(await response.blob()) : null);
      } catch {
        resolve(null);
      }
    });
    pump();
  });
  kept.set(key, loading);
  // A failure is asked again the next time it is shown.
  void loading.then(url => {
    if (url === null && kept.get(key) === loading) kept.delete(key);
  });
  while (kept.size > MAX_KEPT) {
    const [oldest, url] = kept.entries().next().value as [string, Promise<string | null>];
    kept.delete(oldest);
    void url.then(value => value && URL.revokeObjectURL(value));
  }
  return loading;
}

export type PictureState = { readonly status: 'loading' } | { readonly status: 'ready'; readonly url: string } | { readonly status: 'failed' };

/** A photo's or a person's picture from Immich, through the server; `failed` without a server too. */
export function useImmichPicture(kind: 'asset' | 'person', id: string | null, size: ImmichSize = 'thumbnail'): PictureState {
  const server = useSettingsStore(state => state.server);
  const [state, setState] = useState<{ key: string; picture: PictureState } | null>(null);
  const key = server && id ? `${server.url}${immichPicturePath(kind, id, size)}` : null;
  useEffect(() => {
    if (!server || !id || !key) return;
    let live = true;
    void pictureUrl(server, immichPicturePath(kind, id, size)).then(url => {
      if (live) setState({ key, picture: url ? { status: 'ready', url } : { status: 'failed' } });
    });
    return () => {
      live = false;
    };
  }, [server, id, kind, size, key]);
  if (!key) return { status: 'failed' };
  return state?.key === key ? state.picture : { status: 'loading' };
}
