/**
 * « Vérifier le prix » (`POST /api/notes/price-check` a PriceCheckRequest -> PriceCheckResponse, or
 * 4xx/5xx { error } in French): the server reads one watched link's price now, as its daily watch
 * does (`notes/services/priceWatch`), writes what changed under its clock, and says what it found.
 * The link's fields come back through the sync; the answer is for the slip.
 */
import { isValidId } from '@unlease/core/sync/schema';

export const PRICE_CHECK_PATH = '/api/notes/price-check';

export interface PriceCheckRequest {
  readonly linkId: string;
}

/**
 * What the check found: the price as before (`same`), another one (`changed`, `before` holding the
 * one it replaced), a price to start from (`found`: the first, one in another currency, or the first
 * since Claude read the page), or none on the page (`hidden`, `note` saying why Claude did not read it).
 */
export const PRICE_CHECK_OUTCOMES = ['same', 'changed', 'found', 'hidden'] as const;
export type PriceCheckOutcome = (typeof PRICE_CHECK_OUTCOMES)[number];

export interface PriceCheckResponse {
  readonly outcome: PriceCheckOutcome;
  /** The link's price after the check, in the currency's main unit, and its currency. */
  readonly price: number | null;
  readonly currency: string | null;
  /** The price before its last change (`priceBefore`), after the check. */
  readonly before: number | null;
  /** Who read it: the page's own data, or Claude when the page hid it; null when nothing was read. */
  readonly by: 'page' | 'claude' | null;
  /** `hidden`: why nothing was read, in French (translated where it is shown); '' otherwise. */
  readonly note: string;
}

export function parsePriceCheckRequest(body: unknown): PriceCheckRequest | null {
  const raw = body as { linkId?: unknown } | null;
  return raw && typeof raw === 'object' && isValidId(raw.linkId) ? { linkId: raw.linkId } : null;
}

const amount = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

export function parsePriceCheckResponse(body: unknown): PriceCheckResponse | null {
  const raw = body as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object' || !(PRICE_CHECK_OUTCOMES as readonly unknown[]).includes(raw.outcome)) return null;
  const by = raw.by === 'page' || raw.by === 'claude' ? raw.by : null;
  return {
    outcome: raw.outcome as PriceCheckOutcome,
    price: amount(raw.price),
    currency: typeof raw.currency === 'string' && /^[A-Z]{3}$/.test(raw.currency) ? raw.currency : null,
    before: amount(raw.before),
    by,
    note: typeof raw.note === 'string' ? raw.note.slice(0, 300) : '',
  };
}
