import type { BetaMessage, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BudgetSpentError, ClaudeClient, ModelError, webFetchTool, webSearchTool, worstCostUsd } from '../src/claude/client';
import { costUsd } from '../src/claude/pricing';
import { UsageStore } from '../src/claude/usage';
import { AUTH, claudeMessage, createTestServer, rec, T0, type TestServer } from './helpers';

const DAY = 86_400_000;
const OLD = T0 - 8 * DAY;

/** A plain request: a short message, `maxTokens` to write. */
const params = (maxTokens = 4000, extra: Partial<MessageCreateParamsNonStreaming> = {}): MessageCreateParamsNonStreaming => ({
  model: 'claude-haiku-5-5',
  max_tokens: maxTokens,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Bonjour' }] }],
  ...extra,
});

/** What `claudeMessage` costs on Opus 5.5: 3,000 tokens in, 500 out, 1,500 read from the cache. */
const ONE_CALL = costUsd('claude-opus-5-5', { inputTokens: 3000, outputTokens: 500, cacheReadTokens: 1500, cacheWriteTokens: 0 });

let server: TestServer;
beforeEach(() => {
  server = createTestServer();
});
afterEach(() => server.close());

describe('the worst a request may cost', () => {
  it('counts what it writes at most, at the model’s rates', () => {
    const worst = worstCostUsd(params(4000));
    // 4,000 tokens out on Haiku 5.5 at $0.50 a million, and a little in.
    expect(worst).toBeGreaterThan(0.002);
    expect(worst).toBeLessThan(0.0025);
    expect(worstCostUsd(params(8000))).toBeGreaterThan(worst);
  });

  it('counts pictures at their largest, searches with their results, fetched pages whole', () => {
    const plain = worstCostUsd(params(1000));
    const picture = worstCostUsd(params(1000, { messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'A'.repeat(300_000) } }] }] }));
    // A picture is 5,000 tokens however long its base64.
    expect(picture - plain).toBeGreaterThan(0);
    expect(picture - plain).toBeLessThan((5_100 * 0.125) / 1_000_000);
    const searching = worstCostUsd(params(1000, { tools: [webSearchTool('claude-haiku-5-5', 5), webFetchTool('claude-haiku-5-5', 2)] }));
    // Five searches billed on their own, $0.01 each, on top of what they bring back.
    expect(searching - plain).toBeGreaterThan(0.05);
  });

  it('doubles where a refusal may fall back on another model, at the dearer rates', () => {
    const opus = { ...params(4000), model: 'claude-opus-5-5' };
    const alone = worstCostUsd(opus);
    const withFallback = worstCostUsd({ ...opus, fallbacks: 'default' } as MessageCreateParamsNonStreaming);
    expect(withFallback).toBeGreaterThan(alone * 2);
  });

  it('is never below what a call costs', () => {
    expect(worstCostUsd({ ...params(4000), model: 'claude-opus-5-5' })).toBeGreaterThan(ONE_CALL);
  });
});

describe('holds on the budget', () => {
  const store = () => new UsageStore(server.db, server.now);

  it('counts what calls in flight hold, and lets it go once they are recorded', () => {
    const usage = store();
    const hold = usage.hold(1)!;
    expect(hold.cover(0.4)).toBe(true);
    expect(usage.committed()).toBeCloseTo(0.4);
    hold.settle(0.05);
    expect(usage.committed()).toBeCloseTo(0.05);
    usage.record('ask', { usage: { model: 'claude-opus-5-5', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.05 }, ok: true, error: null, durationMs: 1 });
    hold.release();
    hold.release();
    expect(usage.committed()).toBeCloseTo(0.05);
    expect(usage.held()).toBe(0);
  });

  it('refuses a call’s first request when the others hold the rest of the budget, never the requests after it', () => {
    const usage = store();
    const first = usage.hold(0.5)!;
    const second = usage.hold(0.5)!;
    expect(first.cover(0.6)).toBe(true);
    // The budget is held whole by the first: the second sends nothing, and no third opens.
    expect(second.cover(0.1)).toBe(false);
    expect(usage.hold(0.5)).toBeNull();
    expect(usage.spent(0.5)).toBe(true);
    // A paused tool loop goes on: a call alone was never cut off midway.
    first.settle(0.2);
    expect(first.cover(0.6)).toBe(true);
    first.release();
    second.release();
    expect(usage.hold(0.5)).not.toBeNull();
  });

  it('forgets a hold a crash left behind, after a quarter of an hour', () => {
    const usage = store();
    usage.hold(1)!.cover(5);
    expect(usage.spent(1)).toBe(true);
    server.time.value += 16 * 60_000;
    expect(usage.spent(1)).toBe(false);
  });
});

/** Claude answering only once `open` is called: calls stay in flight together. */
function gated(answer: () => BetaMessage) {
  let open!: () => void;
  const gate = new Promise<void>(resolve => (open = resolve));
  const requests: MessageCreateParamsNonStreaming[] = [];
  return {
    requests,
    open: () => open(),
    api: {
      async create(sent: MessageCreateParamsNonStreaming): Promise<BetaMessage> {
        requests.push(sent);
        await gate;
        return answer();
      },
    },
  };
}

describe('calls started together', () => {
  it('cannot all pass a budget one of them could exhaust', async () => {
    const usage = new UsageStore(server.db, server.now);
    const claude = gated(() => claudeMessage('ok'));
    const client = new ClaudeClient(claude.api, { model: 'claude-opus-5-5', effort: 'low' });
    const budget = worstCostUsd({ ...params(4000), model: 'claude-opus-5-5' }) / 2;
    const call = async () => {
      const hold = usage.hold(budget);
      if (!hold) return 'refused';
      try {
        const { usage: spent } = await client.holding(hold).once({ ...params(4000), model: 'claude-opus-5-5' }, new AbortController().signal);
        usage.record('test', { usage: spent, ok: true, error: null, durationMs: 1 });
        return 'answered';
      } catch (error) {
        if (error instanceof BudgetSpentError) return 'refused';
        throw error;
      } finally {
        hold.release();
      }
    };
    const calls = Promise.all([call(), call(), call(), call()]);
    await Promise.resolve();
    claude.open();
    expect(await calls).toEqual(['answered', 'refused', 'refused', 'refused']);
    expect(claude.requests).toHaveLength(1);
    // What it cost is recorded and the hold let go: the budget has room again for the next call.
    expect(usage.held()).toBe(0);
    expect(usage.costSince(0)).toBeCloseTo(ONE_CALL);
    expect(await call()).toBe('answered');
  });

  it('lets a failed call’s hold go', async () => {
    const usage = new UsageStore(server.db, server.now);
    const client = new ClaudeClient({ create: () => Promise.reject(new Error('boom')) }, { model: 'claude-opus-5-5', effort: 'low' });
    const hold = usage.hold(10)!;
    await expect(client.holding(hold).once({ ...params(4000), model: 'claude-opus-5-5' }, new AbortController().signal)).rejects.toBeInstanceOf(ModelError);
    // Not billed: it holds nothing more once it failed, and nothing once released.
    expect(usage.held()).toBe(0);
    hold.release();
    expect(usage.held()).toBe(0);
  });

  it('through an app’s route: one call holds the rest of the budget, the others are refused with 409', async () => {
    const links = ['billet-1', 'billet-2', 'billet-3'];
    server.sync.push(
      links.map(id =>
        rec('link', id, { noteId: 'inbox', url: `https://tickets.example.org/${id}`, status: 'ready', autoFile: false, title: 'Concert', summary: 'Le 12 décembre à 20h', kind: 'event', analyzedAt: OLD, createdAt: OLD, deletedAt: null }, OLD),
      ),
    );
    // Room for what one call costs, not for what it may cost.
    server.settings.update({ budgetUsd: 0.05 });
    const claude = gated(() => claudeMessage({ event: { title: 'Concert', start: '2026-12-12T20:00', end: '2026-12-12T22:00', timeZone: 'Europe/Paris', place: '', description: '' } }));
    server.claude.create = claude.api.create;
    const ask = (linkId: string) =>
      server.app.request('/api/calendar/from-link', { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ linkId, lang: 'fr', now: '2026-10-18T14:00', timeZone: 'Europe/Paris' }) });
    const answers = Promise.all(links.map(ask));
    await new Promise(resolve => setTimeout(resolve, 20));
    claude.open();
    const statuses = (await answers).map(response => response.status).sort();
    expect(statuses).toEqual([200, 409, 409]);
    expect(claude.requests).toHaveLength(1);
    expect(server.usage.held()).toBe(0);
  });
});
