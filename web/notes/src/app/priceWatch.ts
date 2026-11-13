/**
 * « Vérifier le prix » (`notes/services/priceWatch`): the server reads one watched link's price now
 * and writes what changed under its clock; the change comes back with the next pull, asked for at
 * once. A check under way is joined (the link closed and opened again shows it busy), and its answer
 * is the slip to show, its tone said: a drop is good news, a refusal (read a moment ago, too many
 * asks) a warning, a page out of reach an error. A port of the phone's `mobile/notes/src/app/priceWatch.ts`.
 */
import { t } from '@unlease/core/i18n';
import { priceCheckSlip } from '@unlease/notes/services/priceWatch';
import { parsePriceCheckResponse, PRICE_CHECK_PATH, type PriceCheckResponse } from '@unlease/notes/sync/priceWatch';

import { useSettingsStore, type ServerConfig } from '@shared/app/store/settings';
import type { SnackTone } from '@shared/app/store/ui';
import { requestSync } from '@shared/app/sync/loop';
import { postJson, SyncError } from '@shared/app/sync/transport';

/** `POST /api/notes/price-check`: the link's price read now. */
export function checkPrice(config: ServerConfig, linkId: string, signal?: AbortSignal): Promise<PriceCheckResponse> {
  return postJson(config, PRICE_CHECK_PATH, { linkId }, parsePriceCheckResponse, signal, 100_000);
}

export interface PriceSlip {
  readonly text: string;
  readonly tone: SnackTone;
}

const checking = new Map<string, Promise<PriceSlip>>();

/** The check of this link under way, if one is. */
export const runningPriceCheck = (linkId: string): Promise<PriceSlip> | null => checking.get(linkId) ?? null;

/** « Vérifier le prix »: never fails, its answer or its refusal is the slip to show. */
export function checkPriceNow(linkId: string): Promise<PriceSlip> {
  const running = checking.get(linkId);
  if (running) return running;
  const job = askServer(linkId).finally(() => checking.delete(linkId));
  checking.set(linkId, job);
  return job;
}

async function askServer(linkId: string): Promise<PriceSlip> {
  const config = useSettingsStore.getState().server;
  if (!config) return { text: t('No server is connected'), tone: 'error' };
  try {
    const answer = await checkPrice(config, linkId);
    requestSync();
    return priceCheckSlip(answer);
  } catch (error) {
    // Refused for now (read a moment ago, too many asks): a word of caution, not a failure.
    if (error instanceof SyncError && error.status === 409) return { text: error.message, tone: 'warning' };
    return { text: error instanceof Error ? error.message : t('unknown error'), tone: 'error' };
  }
}
