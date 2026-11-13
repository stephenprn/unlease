/** Pages' routes on the server (`server/src/apps/pages`): questions about the pages, and a page's past versions. */
import { parsePagesAskResponse, type PagesAskRequest, type PagesAskResponse } from '@unlease/pages/sync/pagesAsk';
import { parsePageVersion, parsePageVersionList, versionPath, versionsPath, type PageVersion, type PageVersionList } from '@unlease/pages/sync/versions';

import type { ServerConfig } from '@shared/app/store/settings';
import { getJson, postJson } from '@shared/app/sync/transport';

/** `POST /api/pages/ask`: a question about pages, answered from them, each claim with the blocks it rests on. */
export function askAboutPages(config: ServerConfig, body: PagesAskRequest, signal?: AbortSignal): Promise<PagesAskResponse> {
  return postJson(config, '/api/pages/ask', body, parsePagesAskResponse, signal);
}

/** `GET /api/pages/<page>/versions`: the page's past versions, newest first. */
export function fetchPageVersions(config: ServerConfig, pageId: string, signal?: AbortSignal): Promise<PageVersionList> {
  return getJson(config, versionsPath(pageId), parsePageVersionList, signal);
}

/** `GET /api/pages/<page>/versions/<version>`: one whole. */
export function fetchPageVersion(config: ServerConfig, pageId: string, versionId: number, signal?: AbortSignal): Promise<PageVersion> {
  return getJson(config, versionPath(pageId, versionId), parsePageVersion, signal);
}
