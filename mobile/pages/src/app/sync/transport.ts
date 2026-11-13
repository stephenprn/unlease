/**
 * Pages' routes on the server (the questions to Claude about pages, a page's past versions), over the suite's transport
 * (`@shared/app/sync/transport`), which this file hands on whole.
 */
import { parsePagesAskResponse, type PagesAskRequest, type PagesAskResponse } from '@unlease/pages/sync/pagesAsk';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { parsePageVersion, parsePageVersionList, versionPath, versionsPath, type PageVersion, type PageVersionList } from '@unlease/pages/sync/versions';
import { askServer, getFromServer } from '@shared/app/sync/transport';

export * from '@shared/app/sync/transport';

/** `POST /api/pages/ask`: a question about pages, answered from them, each claim with the blocks it rests on. */
export function askAboutPages(config: ServerConfig, body: PagesAskRequest, signal?: AbortSignal): Promise<PagesAskResponse> {
  return askServer(config, '/api/pages/ask', body, parsePagesAskResponse, signal);
}

/** `GET /api/pages/<page>/versions`: the page's past versions, newest first. */
export function fetchPageVersions(config: ServerConfig, pageId: string, signal?: AbortSignal): Promise<PageVersionList> {
  return getFromServer(config, versionsPath(pageId), parsePageVersionList, signal);
}

/** `GET /api/pages/<page>/versions/<version>`: one whole. */
export function fetchPageVersion(config: ServerConfig, pageId: string, versionId: number, signal?: AbortSignal): Promise<PageVersion> {
  return getFromServer(config, versionPath(pageId, versionId), parsePageVersion, signal);
}
