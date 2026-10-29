/**
 * List prices in US dollars per million tokens, for the monthly budget. Cache
 * writes are the five-minute rate (1.25x input), the only TTL this server uses.
 */
export interface Rates {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

const OPUS_5_5: Rates = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
const SONNET_5_5: Rates = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };
const HAIKU_5_5: Rates = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };
/** What a server-side refusal fallback may answer on. */
const EARLIER_OPUS: Rates = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 };

/** Longest prefix first: `claude-opus-5-5` must win over `claude-opus-5`. */
const BY_PREFIX: readonly (readonly [string, Rates])[] = [
  ['claude-opus-5-5', OPUS_5_5],
  ['claude-sonnet-5-5', SONNET_5_5],
  ['claude-haiku-5-5', HAIKU_5_5],
  ['claude-opus-5', EARLIER_OPUS],
  ['claude-opus-4', EARLIER_OPUS],
  ['claude-opus', OPUS_5_5],
  ['claude-sonnet', SONNET_5_5],
  ['claude-haiku', HAIKU_5_5],
];

/** An unknown model is priced as Opus 5.5 so the budget errs on the side of stopping. */
export function ratesFor(model: string): Rates {
  return BY_PREFIX.find(([prefix]) => model.startsWith(prefix))?.[1] ?? OPUS_5_5;
}

export interface TokenCounts {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

export function costUsd(model: string, tokens: TokenCounts): number {
  const rates = ratesFor(model);
  return (
    (tokens.inputTokens * rates.input +
      tokens.outputTokens * rates.output +
      tokens.cacheReadTokens * rates.cacheRead +
      tokens.cacheWriteTokens * rates.cacheWrite) /
    1_000_000
  );
}

/** Each web search is billed on top of the tokens its results add ($10 per 1,000); a web fetch costs only its tokens. */
export const WEB_SEARCH_USD = 0.01;
