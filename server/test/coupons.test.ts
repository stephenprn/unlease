import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LinkBrief } from '@unlease/notes/sync/brief';
import { parseCouponRequest } from '@unlease/notes/sync/coupons';
import { LinkSearches } from '../src/apps/notes/analysis/searches';
import type { MessagesApi } from '../src/apps/notes/analysis/model';
import { LinkModelProvider } from '../src/apps/notes/analysis/provider';
import { AUTH, claudeMessage, createTestServer, FakeClaude, T0, type TestServer } from './helpers';

const item: LinkBrief = {
  id: 'l1',
  url: 'https://komono.com/fr/products/winston-black?utm_source=newsletter',
  title: 'Montre Winston Black',
  site: 'Komono',
  kind: 'product',
  price: 79,
  currency: 'EUR',
  facts: ['Couleur : Noir'],
  summary: '',
};
const PAGE = 'https://komono.com/fr/products/winston-black';
const ask = (extra: Record<string, unknown> = {}) => ({ link: item, lang: 'fr', fresh: false, ...extra });

const found = {
  coupons: [
    { code: 'BIENVENUE15', benefit: '15 % sur la première commande', conditions: 'Nouveaux clients', kind: 'percent', value: 15, minimum: null, expires: '2026-11-30', confirmed: true, source: 'Dealabs', sourceUrl: 'https://www.dealabs.com/codes-promo/komono' },
    { code: 'LIVRAISON', benefit: 'Livraison offerte', conditions: '', kind: 'shipping', value: null, minimum: 50, expires: null, confirmed: false, source: 'Komono', sourceUrl: null },
  ],
  tips: [{ text: '10 % en s’inscrivant à la lettre d’information.', url: 'https://komono.com/fr/pages/newsletter' }],
};

/** An answer as web search gives it: a preamble, a search and its results, then the JSON split by a citation. */
function searchMessage(answer: unknown, overrides: Record<string, unknown> = {}, searches = 2): BetaMessage {
  const json = typeof answer === 'string' ? answer : JSON.stringify(answer);
  const cut = Math.floor(json.length / 2);
  const base = claudeMessage('');
  return claudeMessage('', {
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: 'Je cherche les codes en cours pour Komono.', citations: null },
      { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'code promo Komono' } },
      { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url: 'https://www.dealabs.com/codes-promo/komono', title: 'Codes promo Komono', encrypted_content: 'enc', page_age: null }] },
      { type: 'text', text: json.slice(0, cut), citations: null },
      { type: 'text', text: json.slice(cut), citations: [{ type: 'web_search_result_location', url: 'https://www.dealabs.com/codes-promo/komono', title: 'Codes promo Komono', encrypted_index: 'idx', cited_text: 'BIENVENUE15' }] },
    ],
    usage: { ...base.usage, server_tool_use: { web_search_requests: searches, web_fetch_requests: 0 } },
    ...overrides,
  });
}

let server: TestServer;

beforeEach(() => {
  server = createTestServer();
});
afterEach(() => server.close());

async function post(body: unknown) {
  const response = await server.app.request('/api/coupons', {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

describe('POST /api/coupons', () => {
  it('asks Claude to search the web, and answers the codes it found', async () => {
    server.claude.reply(searchMessage(found));
    const { status, body } = await post(ask());

    expect(status).toBe(200);
    expect(body).toEqual({ ...found, searchedAt: T0 });
    const request = server.claude.requests[0]!;
    expect(request).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 16000, output_config: { effort: 'low' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    // Web search always cites, and citations cannot go with a structured format.
    expect(request.output_config).not.toHaveProperty('format');
    expect(request.tools).toEqual([
      { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 2, max_content_tokens: 8000 },
    ]);
    expect(request.system).toEqual([expect.objectContaining({ type: 'text', cache_control: { type: 'ephemeral' } })]);
    const text = server.claude.userText();
    expect(text.split('\n')[0]).toBe('Language: French.');
    expect(text).toContain('Today: 2026-10-18.');
    expect(text).toContain(
      '{"url":"https://komono.com/fr/products/winston-black?utm_source=newsletter","name":"Montre Winston Black","shop":"Komono","kind":"product","price":"79 EUR","facts":["Couleur : Noir"]}',
    );
  });

  it('bills the searches with the tokens, without counting a link read', async () => {
    server.claude.reply(searchMessage(found, {}, 3));
    await post(ask());

    const cost = (3000 * 4 + 500 * 20 + 1500 * 0.2) / 1e6 + 3 * 0.01;
    const usage = (await (await server.app.request('/api/usage', { headers: AUTH })).json()) as { monthToDate: { analyses: number; costUsd: number } };
    expect(usage.monthToDate.analyses).toBe(0);
    expect(usage.monthToDate.costUsd).toBeCloseTo(cost, 4);
    expect(server.db.prepare('SELECT task, link_id, url, ok FROM analyses').all()).toEqual([{ task: 'coupons', link_id: 'l1', url: PAGE, ok: 1 }]);
  });

  it('answers again from what it kept for a few hours, by address and language', async () => {
    server.claude.reply(searchMessage(found), searchMessage({ coupons: [], tips: [] }), searchMessage(found), searchMessage(found));
    const first = await post(ask());

    server.time.value += 3_600_000;
    // The same page without its tracking parameter is the same address.
    const kept = await post(ask({ link: { ...item, url: PAGE } }));
    expect(kept.body).toEqual(first.body);
    expect(server.claude.requests).toHaveLength(1);

    const english = await post(ask({ lang: 'en' }));
    expect(server.claude.requests).toHaveLength(2);
    expect(server.claude.userText(1).split('\n')[0]).toBe('Language: English.');
    expect(english.body.coupons).toEqual([]);

    await post(ask({ fresh: true }));
    expect(server.claude.requests).toHaveLength(3);

    server.time.value += 6 * 3_600_000 + 1;
    const later = await post(ask());
    expect(server.claude.requests).toHaveLength(4);
    expect(later.body.searchedAt).toBe(server.time.value);
  });

  it('joins a search already running for the same address instead of paying twice', async () => {
    const claude = new FakeClaude().reply(searchMessage(found));
    const provider = new LinkModelProvider(server.settings, { effort: 'low', createApi: () => claude, sleep: async () => {} });
    const finder = new LinkSearches({ usage: server.usage, analysis: () => provider.current(), now: server.now });
    const request = parseCouponRequest(ask())!;

    const [a, b] = await Promise.all([finder.coupons(request), finder.coupons({ ...request, fresh: true })]);
    expect(claude.requests).toHaveLength(1);
    expect(b).toEqual(a);
  });

  it('resumes a search that paused, and bills both parts', async () => {
    const paused = searchMessage('', { stop_reason: 'pause_turn' }, 2);
    server.claude.reply({ ...paused, content: paused.content.slice(0, 4) } as BetaMessage, searchMessage(found, {}, 1));
    const { status, body } = await post(ask());

    expect(status).toBe(200);
    expect(body.coupons).toHaveLength(2);
    expect(server.claude.requests).toHaveLength(2);
    expect(server.claude.requests[1]!.messages.at(-1)).toMatchObject({ role: 'assistant' });
    const cost = server.db.prepare('SELECT cost_usd AS cost FROM analyses').get() as { cost: number };
    expect(cost.cost).toBeCloseTo(2 * ((3000 * 4 + 500 * 20 + 1500 * 0.2) / 1e6) + 3 * 0.01, 4);
  });

  it('reads an answer written before one more search', async () => {
    const base = claudeMessage('');
    server.claude.reply(
      claudeMessage('', {
        content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'text', text: JSON.stringify(found), citations: null },
          { type: 'server_tool_use', id: 'srvtoolu_2', name: 'web_search', input: { query: 'Komono soldes' } },
          { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_2', content: [] },
          { type: 'text', text: 'Rien de plus récent.', citations: null },
        ],
        usage: { ...base.usage, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } },
      }),
    );
    const { status, body } = await post(ask());
    expect(status).toBe(200);
    expect(body.coupons).toHaveLength(2);
  });

  it('keeps only well-formed codes, each once, at most six', async () => {
    server.claude.reply(
      searchMessage({
        coupons: [
          { code: 'BIENVENUE15', benefit: '15 %', kind: 'percent', value: 150, minimum: -3, expires: '30/11/2026', confirmed: 'oui', source: 'Dealabs', sourceUrl: 'javascript:alert(1)' },
          { code: 'bienvenue15', benefit: 'Le même code', kind: 'percent', value: 15 },
          { code: '', benefit: 'Sans code' },
          { benefit: 'Sans code non plus' },
          ...Array.from({ length: 8 }, (_, index) => ({ code: `CODE${index}`, benefit: '5 € de remise', kind: 'amount', value: 5 })),
        ],
        tips: [{ text: '' }, { text: 'Soldes dès le 8 janvier.', url: 'ftp://komono.com' }],
      }),
    );
    const { body } = await post(ask());

    expect(body.coupons).toHaveLength(6);
    expect(body.coupons[0]).toEqual({ code: 'BIENVENUE15', benefit: '15 %', conditions: '', kind: 'percent', value: null, minimum: null, expires: null, confirmed: false, source: 'Dealabs', sourceUrl: null });
    expect(body.coupons.map((coupon: { code: string }) => coupon.code)).toEqual(['BIENVENUE15', 'CODE0', 'CODE1', 'CODE2', 'CODE3', 'CODE4']);
    expect(body.tips).toEqual([{ text: 'Soldes dès le 8 janvier.', url: null }]);
  });

  it('gives Haiku the basic web tools, and no fallback', async () => {
    server.settings.update({ model: 'claude-haiku-5-5' });
    server.claude.reply(searchMessage(found));
    await post(ask());

    const request = server.claude.requests[0]!;
    expect(request.tools).toEqual([
      { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
      { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 2, max_content_tokens: 8000 },
    ]);
    expect(request).not.toHaveProperty('fallbacks');
  });

  it('never passes a kept search off as a reading of the page', async () => {
    server.claude.reply(searchMessage(found));
    await post(ask());
    expect(server.usage.cached(PAGE, 0, 'fr')).toBeNull();
    expect(server.usage.analysedBefore('l1')).toBe(false);
  });
});

describe('POST /api/coupons, refusals', () => {
  it('refuses a malformed request without asking Claude', async () => {
    for (const body of ['pas du json', {}, ask({ link: { ...item, price: null } }), ask({ link: { ...item, url: 'javascript:alert(1)' } }), ask({ link: { ...item, id: 'pas un id !' } })]) {
      const { status } = await post(body);
      expect(status).toBe(400);
    }
    expect(server.claude.requests).toHaveLength(0);
  });

  it('says so in French when no key is set', async () => {
    server.close();
    server = createTestServer({ envApiKey: null });
    const { status, body } = await post(ask());
    expect(status).toBe(409);
    expect(body.error).toBe('Claude ne lit pas les liens : ajoutez une clé dans l’administration.');
  });

  it('stops at the monthly budget', async () => {
    server.settings.update({ budgetUsd: 0 });
    const { status, body } = await post(ask());
    expect(status).toBe(409);
    expect(body.error).toBe('Budget mensuel atteint');
    expect(server.claude.requests).toHaveLength(0);
  });

  it('passes an unreadable answer on in French, bills it, and keeps nothing', async () => {
    server.claude.reply(searchMessage('Désolé, rien de récent.'), searchMessage(found));
    const { status, body } = await post(ask());
    expect(status).toBe(502);
    expect(body.error).toBe('Réponse de Claude illisible');
    const row = server.db.prepare('SELECT task, ok, error, cost_usd AS cost FROM analyses').get() as { task: string; ok: number; error: string; cost: number };
    expect(row).toMatchObject({ task: 'coupons', ok: 0, error: 'Réponse de Claude illisible' });
    expect(row.cost).toBeGreaterThan(0);

    // Nothing was kept: asking again searches again.
    const again = await post(ask());
    expect(again.status).toBe(200);
    expect(server.claude.requests).toHaveLength(2);
  });

  it('bills a search cut off by its deadline: the parts that answered, and a whole search for the call cut off', async () => {
    const paused = searchMessage('', { stop_reason: 'pause_turn' }, 2);
    let calls = 0;
    const api: MessagesApi = {
      create: (_params, options) => {
        calls += 1;
        if (calls === 1) return Promise.resolve({ ...paused, content: paused.content.slice(0, 4) } as BetaMessage);
        return new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Anthropic.APIUserAbortError())));
      },
    };
    const provider = new LinkModelProvider(server.settings, { effort: 'low', createApi: () => api, sleep: async () => {} });
    const finder = new LinkSearches({ usage: server.usage, analysis: () => provider.current(), now: server.now, deadlineMs: 50 });

    expect(await finder.coupons(parseCouponRequest(ask())!)).toEqual({ ok: false, status: 502, error: 'Claude a mis trop de temps' });
    const row = server.db.prepare('SELECT ok, error, cost_usd AS cost FROM analyses').get() as { ok: number; error: string; cost: number };
    expect(row).toMatchObject({ ok: 0, error: 'Claude a mis trop de temps' });
    expect(row.cost).toBeCloseTo((3000 * 4 + 500 * 20 + 1500 * 0.2) / 1e6 + 2 * 0.01 + 0.25, 4);
  });

  it('says when Claude refused to search', async () => {
    server.claude.reply(searchMessage(found, { stop_reason: 'refusal' }));
    const { status, body } = await post(ask());
    expect(status).toBe(502);
    expect(body.error).toBe('Recherche refusée par Claude');
  });
});
