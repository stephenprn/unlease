/**
 * An image's source: the local photo until it uploads, then the server's copy with the token
 * (React Native's image cache keeps it on disk, so it stays visible offline).
 */
import { useMemo } from 'react';

import { authHeader } from '@unlease/core/sync/protocol';
import { loadLocalFiles } from '@data/repositories/fileRepository';

import { selectServer, useSettingsStore } from '../store/settingsStore';

export interface ImageSource {
  readonly uri: string;
  readonly headers?: Record<string, string>;
}

let localPaths: Map<string, string> | null = null;

/** Called after a photo is saved locally, so the next lookup sees it. */
export function forgetLocalPaths(): void {
  localPaths = null;
}

function localPath(id: string): string | undefined {
  localPaths ??= new Map(loadLocalFiles().map(file => [file.id, file.path]));
  return localPaths.get(id);
}

export function useBlobSource(id: string | null | undefined, variant: 'display' | 'original' = 'display'): ImageSource | null {
  const server = useSettingsStore(selectServer);
  return useMemo(() => {
    if (!id) return null;
    const local = localPath(id);
    if (local) return { uri: local.startsWith('file://') ? local : `file://${local}` };
    if (!server) return null;
    return { uri: `${server.url}/api/blobs/${id}?variant=${variant}`, headers: authHeader(server.token) };
  }, [id, server, variant]);
}
