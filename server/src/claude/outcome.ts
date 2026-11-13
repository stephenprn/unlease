/** How a call to Claude an app makes on a person's request ends, as its route answers it. */
import { CLAUDE_COST_PER_LINK, CLAUDE_COST_PER_WEB_SEARCH, isClaudeModel } from '@unlease/core/sync/settings';
import type { CallUsage } from './usage';

export type ModuleOutcome<T> = { readonly ok: true; readonly answer: T } | { readonly ok: false; readonly status: 409 | 502; readonly error: string };

/** No key set: words for every app. */
export const NO_KEY = 'Claude has no key: add one in the Administration.';
export const BUDGET_SPENT = 'Monthly budget reached';

/**
 * A call cut off by its deadline has run searches nobody reported: counted at a whole search's
 * estimate, so the budget errs high; a call that only read a page (`reading`), at a reading's.
 */
export function withCutOffCall(spent: CallUsage | null, model: string, reading = false): CallUsage {
  const costs = reading ? CLAUDE_COST_PER_LINK : CLAUDE_COST_PER_WEB_SEARCH;
  const estimate = isClaudeModel(model) ? costs[model] : Math.max(...Object.values(costs));
  const base = spent ?? { model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 };
  return { ...base, costUsd: base.costUsd + estimate };
}
