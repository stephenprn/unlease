/**
 * Pages' routes on the server (the questions to Claude about pages), over the suite's transport
 * (`@shared/app/sync/transport`), which this file hands on whole.
 */
import { parsePagesAskResponse, type PagesAskRequest, type PagesAskResponse } from '@unlease/pages/sync/pagesAsk';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { askServer } from '@shared/app/sync/transport';

export * from '@shared/app/sync/transport';

/** `POST /api/pages/ask`: a question about pages, answered from them, each claim with the blocks it rests on. */
export function askAboutPages(config: ServerConfig, body: PagesAskRequest, signal?: AbortSignal): Promise<PagesAskResponse> {
  return askServer(config, '/api/pages/ask', body, parsePagesAskResponse, signal);
}
