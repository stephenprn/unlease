/** Pages' routes on the server (`server/src/apps/pages`): questions about the pages. */
import { parsePagesAskResponse, type PagesAskRequest, type PagesAskResponse } from '@unlease/pages/sync/pagesAsk';

import type { ServerConfig } from '@shared/app/store/settings';
import { postJson } from '@shared/app/sync/transport';

/** `POST /api/pages/ask`: a question about pages, answered from them, each claim with the blocks it rests on. */
export function askAboutPages(config: ServerConfig, body: PagesAskRequest, signal?: AbortSignal): Promise<PagesAskResponse> {
  return postJson(config, '/api/pages/ask', body, parsePagesAskResponse, signal);
}
