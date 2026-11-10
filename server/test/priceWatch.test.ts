import { afterEach, describe, expect, it } from 'vitest';
import type { Fields } from '@unlease/core/sync/record';
import { linkFromRecord } from '@unlease/notes/sync/entities';
import { ClaudeProvider } from '../src/claude/provider';
import { CLAUDE_PER_DAY, isDue, lastSlot, MIN_GAP_MS, PriceWatch, PRICE_TASK, ROUND_LINKS, slotOf } from '../src/apps/notes/priceWatch';
import { PRICE_PROMPT } from '../src/apps/notes/analysis/price';
import { AUTH, claudeMessage, createTestServer, FakeFetcher, listNote, rec, T0, type FakeRoute, type TestServer } from './helpers';

const DAY = 86_400_000;
const LINE = 'line-mode';

let server: TestServer;
let open: TestServer | null = null;
afterEach(() => {
  open?.close();
  open = null;
});

const html = (body: string): FakeRoute => ({ headers: { 'content-type': 'text/html; charset=utf-8' }, body });

/** A shop's product page: its price in JSON-LD, or only in its words (`hidden`). */
function productPage(price: number, { hidden = false, currency = 'EUR' } = {}): FakeRoute {
  const data = { '@context': 'https://schema.org', '@type': 'Product', name: 'Veste en laine', offers: { '@type': 'Offer', price: String(price), priceCurrency: currency, availability: 'https://schema.org/InStock' } };
  return html(
    `<!doctype html><html><head><title>Veste en laine | Atelier</title><meta property="og:title" content="Veste en laine">${hidden ? '' : `<script type="application/ld+json">${JSON.stringify(data)}</script>`}</head><body><h1>Veste en laine</h1><p>Laine bouillie, doublure en coton.</p><p>Prix : ${price} €</p></body></html>`,
  );
}

const url = (shop: string, item = 'veste') => `https://www.${shop}.example/${item}`;

/** A product saved in « Mode » a month ago, read by Claude then, its price checked yesterday. */
function product(id: string, address: string, fields: Fields = {}) {
  return rec('link', id, { noteId: LINE, url: address, status: 'ready', autoFile: false, title: 'Veste en laine', kind: 'product', price: 89, currency: 'EUR', analyzedAt: T0 - 30 * DAY, priceCheckedAt: T0 - DAY, done: false, createdAt: T0 - 30 * DAY, deletedAt: null, ...fields }, T0 - 30 * DAY);
}

/** A server whose « Mode » watches prices (or not), the pages answered from `routes`, and a watch of its own over them. */
function setUp(routes: Record<string, FakeRoute | (() => FakeRoute)>, modules: readonly string[] = ['pricewatch']) {
  const fetcher = new FakeFetcher(routes);
  open = server = createTestServer({ fetcher });
  server.sync.push([listNote(LINE, 'Mode', T0 - 40 * DAY, { modules: [...modules], archived: false })]);
  const claude = new ClaudeProvider(server.settings, { effort: 'low', createApi: () => server.claude, sleep: async () => {} });
  const watch = new PriceWatch({ db: server.db, records: server.records, sync: server.sync, usage: server.usage, fetcher, claude: () => claude.current(), now: server.now, sleep: async () => {} });
  return { fetcher, watch };
}

const linkOf = (id: string) => linkFromRecord(server.records.get('link', id)!);
const priceRows = () => server.db.prepare(`SELECT link_id AS linkId, ok, error FROM analyses WHERE task = '${PRICE_TASK}' ORDER BY id`).all();

async function check(linkId: unknown) {
  const response = await server.app.request('/api/notes/price-check', { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ linkId }) });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('when a link is due', () => {
  it('spreads the links over the day, and reads one again at its minute, six hours on at least', () => {
    const slots = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => slotOf(`0190a1b2-c3d4-7e5f-8a9b-${id.repeat(12)}`));
    expect(new Set(slots).size).toBeGreaterThan(4);
    for (const slot of slots) expect(slot).toBeGreaterThanOrEqual(0);
    const id = 'link-1';
    const minute = lastSlot(id, T0);
    expect(minute).toBeLessThanOrEqual(T0);
    expect(T0 - minute).toBeLessThan(DAY);
    expect(isDue(id, null, T0)).toBe(true);
    expect(isDue(id, minute - 1, T0)).toBe(T0 - (minute - 1) >= MIN_GAP_MS);
    expect(isDue(id, minute + 1, T0)).toBe(false);
    expect(isDue(id, minute - DAY + 1, minute + 1)).toBe(true);
  });
});

describe('the daily round', () => {
  it('reads the price from the page’s data, free, and writes the change under the server’s clock', async () => {
    const { watch, fetcher } = setUp({ [url('atelier')]: productPage(79) });
    server.sync.push([product('l1', url('atelier'))]);
    const before = server.records.get('link', 'l1')!;

    expect(await watch.runRound()).toBe(1);
    const after = server.records.get('link', 'l1')!;
    expect(linkOf('l1')).toMatchObject({ price: 79, currency: 'EUR', priceBefore: 89, priceChangedAt: T0, priceCheckedAt: T0 });
    // The server's own clock, after the device's.
    expect(after.clocks.priceBefore! > before.clocks.price!).toBe(true);
    expect(after.clocks.priceBefore!.endsWith('srvtest01')).toBe(true);
    expect(fetcher.calls[0]!.userAgent).toContain('Mozilla/5.0');
    expect(server.claude.requests).toHaveLength(0);

    // Read again at once: not due, nothing fetched.
    expect(await watch.runRound()).toBe(0);
    // The next day at its minute: the same price stamps only the check.
    server.time.value = lastSlot('l1', T0 + 2 * DAY);
    const at = server.time.value;
    expect(await watch.runRound()).toBe(1);
    expect(linkOf('l1')).toMatchObject({ price: 79, priceBefore: 89, priceChangedAt: T0, priceCheckedAt: at });
  });

  it('takes the first reading as it is: Claude may have read another size’s price', async () => {
    const { watch } = setUp({ [url('atelier')]: productPage(79) });
    server.sync.push([product('l1', url('atelier'), { priceCheckedAt: null })]);
    await watch.runRound();
    expect(linkOf('l1')).toMatchObject({ price: 79, priceBefore: null, priceChangedAt: null, priceCheckedAt: T0 });
  });

  it('reads only the products of collections watching, not bought, one page of a shop at a time', async () => {
    const { watch, fetcher } = setUp({
      [url('atelier')]: productPage(79),
      [url('atelier', 'echarpe')]: productPage(45),
      [url('maille')]: productPage(59),
      [url('autre')]: productPage(10),
    });
    server.sync.push([
      listNote('line-maison', 'Maison', T0 - 40 * DAY),
      product('l1', url('atelier')),
      product('l2', url('atelier', 'echarpe')),
      product('l3', url('maille')),
      product('done', url('autre'), { done: true, doneAt: T0 - DAY }),
      product('film', url('autre', 'film'), { kind: 'film', price: null }),
      product('elsewhere', url('autre', 'lampe'), { noteId: 'line-maison' }),
      product('reading', url('autre', 'neuf'), { status: 'pending' }),
    ]);
    expect(await watch.runRound()).toBe(2);
    expect(fetcher.urls().filter(address => !address.includes('oembed'))).toEqual([url('atelier'), url('maille')]);
    // The other page of the same shop waits five minutes.
    server.time.value = T0 + 6 * 60_000;
    expect(await watch.runRound()).toBe(1);
    expect(linkOf('l2').price).toBe(45);
    expect(linkOf('done').priceCheckedAt).toBe(T0 - DAY);
  });

  it('reads at most a dozen links a round', async () => {
    const routes: Record<string, FakeRoute> = {};
    const links = Array.from({ length: ROUND_LINKS + 3 }, (_, index) => {
      routes[url(`shop${index}`)] = productPage(50 + index);
      return product(`l${index}`, url(`shop${index}`));
    });
    const { watch } = setUp(routes);
    server.sync.push(links);
    expect(await watch.runRound()).toBe(ROUND_LINKS);
    expect(await watch.runRound()).toBe(3);
  });

  it('keeps the last price when the page is gone or out of reach', async () => {
    const { watch } = setUp({ [url('atelier', 'ailleurs')]: { error: new Error('down') } });
    server.sync.push([product('gone', url('atelier', 'disparu')), product('down', url('atelier', 'ailleurs'))]);
    server.time.value = T0;
    await watch.runRound();
    server.time.value = T0 + 6 * 60_000;
    await watch.runRound();
    expect(linkOf('gone')).toMatchObject({ price: 89, priceBefore: null, priceCheckedAt: T0 - DAY });
    expect(linkOf('down')).toMatchObject({ price: 89, priceCheckedAt: T0 - DAY });
    // A page gone for good: Claude would find nothing either.
    expect(server.claude.requests).toHaveLength(0);
  });
});

describe('Claude, when the page hides its price', () => {
  it('reads it in one short call, once a week a link at most', async () => {
    const { watch } = setUp({ [url('atelier')]: productPage(74.5, { hidden: true }) });
    server.sync.push([product('l1', url('atelier'))]);
    server.claude.reply(claudeMessage({ price: 74.5, currency: 'EUR' }));

    await watch.runRound();
    expect(linkOf('l1')).toMatchObject({ price: 74.5, priceBefore: 89, priceCheckedAt: T0 });
    const request = server.claude.requests[0]!;
    expect(request.system).toEqual([{ type: 'text', text: PRICE_PROMPT, cache_control: { type: 'ephemeral' } }]);
    expect(request.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
    expect(request.tools).toBeUndefined();
    expect(request.max_tokens).toBeLessThanOrEqual(2000);
    const text = server.claude.userText();
    expect(text).toContain('Last price: 89 EUR');
    expect(text).toContain('Prix : 74.5 €');
    expect(text.length).toBeLessThan(6000);
    expect(priceRows()).toEqual([{ linkId: 'l1', ok: 1, error: null }]);

    // Its next minute, two days on: the page still hides it, Claude is not asked again within the week.
    server.time.value = T0 + 2 * DAY;
    await watch.runRound();
    expect(server.claude.requests).toHaveLength(1);
    expect(linkOf('l1').priceCheckedAt).toBe(T0);
    // A week on, it is.
    server.time.value = T0 + 8 * DAY;
    server.claude.reply(claudeMessage({ price: 74.5, currency: 'EUR' }));
    await watch.runRound();
    expect(server.claude.requests).toHaveLength(2);
    expect(linkOf('l1')).toMatchObject({ price: 74.5, priceCheckedAt: T0 + 8 * DAY });
  });

  it('fetches the page itself when the server could not read it', async () => {
    const { watch } = setUp({ [url('atelier')]: { status: 403, headers: { 'content-type': 'text/html' }, body: '<title>Access denied</title>' } });
    server.sync.push([product('l1', url('atelier'))]);
    server.claude.reply(claudeMessage({ price: 92, currency: 'EUR' }));
    await watch.runRound();
    expect(server.claude.requests[0]!.tools).toEqual([expect.objectContaining({ name: 'web_fetch', max_uses: 1 })]);
    expect(server.claude.userText()).toContain(`Fetch ${url('atelier')} once with web_fetch`);
    expect(linkOf('l1')).toMatchObject({ price: 92, priceBefore: 89 });
  });

  it('reads at most five prices a day for the whole server', async () => {
    const routes: Record<string, FakeRoute> = {};
    const links = Array.from({ length: CLAUDE_PER_DAY + 2 }, (_, index) => {
      routes[url(`shop${index}`)] = productPage(60, { hidden: true });
      return product(`l${index}`, url(`shop${index}`));
    });
    const { watch } = setUp(routes);
    server.sync.push(links);
    for (let index = 0; index < CLAUDE_PER_DAY; index += 1) server.claude.reply(claudeMessage({ price: 60, currency: 'EUR' }));
    await watch.runRound();
    expect(server.claude.requests).toHaveLength(CLAUDE_PER_DAY);
    expect(priceRows()).toHaveLength(CLAUDE_PER_DAY);
  });

  it('leaves a fifth of the month’s budget to what the person asks, and never passes it', async () => {
    const { watch } = setUp({ [url('atelier')]: productPage(70, { hidden: true }) });
    server.sync.push([product('l1', url('atelier'))]);
    // 13 $ of the 15 spent: past 80 %.
    server.usage.record('read', { usage: { model: 'claude-opus-5-5', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 13 }, ok: true, error: null, durationMs: 1 });
    await watch.runRound();
    expect(server.claude.requests).toHaveLength(0);
    expect(linkOf('l1').price).toBe(89);

    // The person may still ask, within the budget.
    server.claude.reply(claudeMessage({ price: 70, currency: 'EUR' }));
    server.time.value = T0 + 2 * 60_000;
    const answered = await watch.check('l1');
    expect(answered).toMatchObject({ ok: true, answer: { outcome: 'changed', price: 70, before: 89, by: 'claude' } });
  });

  it('says so when Claude finds no price, and writes nothing', async () => {
    const { watch } = setUp({ [url('atelier')]: productPage(70, { hidden: true }) });
    server.sync.push([product('l1', url('atelier'))]);
    server.claude.reply(claudeMessage({ price: null, currency: null }));
    expect(await watch.check('l1')).toEqual({ ok: true, answer: { outcome: 'hidden', price: 89, currency: 'EUR', before: null, by: null, note: 'Claude n’a pas trouvé de prix sur cette page.' } });
    expect(linkOf('l1').priceCheckedAt).toBe(T0 - DAY);
    expect(priceRows()).toEqual([{ linkId: 'l1', ok: 1, error: null }]);
  });

  it('is never asked without a key', async () => {
    const fetcher = new FakeFetcher({ [url('atelier')]: productPage(70, { hidden: true }) });
    open = server = createTestServer({ fetcher, envApiKey: null });
    server.sync.push([listNote(LINE, 'Mode', T0 - 40 * DAY, { modules: ['pricewatch'] }), product('l1', url('atelier'))]);
    expect(await check('l1')).toEqual({ status: 200, body: { outcome: 'hidden', price: 89, currency: 'EUR', before: null, by: null, note: 'Cette page ne montre pas son prix.' } });
  });
});

describe('POST /api/notes/price-check', () => {
  it('reads one link now and says what it found', async () => {
    const fetcher = new FakeFetcher({ [url('atelier')]: productPage(79) });
    open = server = createTestServer({ fetcher });
    server.sync.push([listNote(LINE, 'Mode', T0 - 40 * DAY, { modules: ['pricewatch'] }), product('l1', url('atelier'))]);
    const { status, body } = await check('l1');
    expect(status).toBe(200);
    expect(body).toEqual({ outcome: 'changed', price: 79, currency: 'EUR', before: 89, by: 'page', note: '' });
    expect(linkOf('l1')).toMatchObject({ price: 79, priceBefore: 89, priceChangedAt: T0 });
  });

  it('refuses a link read a moment ago, too many asks, an unknown link and a bad request', async () => {
    const routes: Record<string, FakeRoute> = {};
    const links = Array.from({ length: 31 }, (_, index) => {
      routes[url(`shop${index}`)] = productPage(89);
      return product(`l${index}`, url(`shop${index}`));
    });
    open = server = createTestServer({ fetcher: new FakeFetcher(routes) });
    server.sync.push([listNote(LINE, 'Mode', T0 - 40 * DAY, { modules: ['pricewatch'] }), ...links]);
    expect((await check('l0')).body.outcome).toBe('same');
    expect(await check('l0')).toEqual({ status: 409, body: { error: 'Prix vérifié à l’instant : réessayez dans une minute.' } });
    for (let index = 1; index < 30; index += 1) expect((await check(`l${index}`)).status).toBe(200);
    expect(await check('l30')).toEqual({ status: 409, body: { error: 'Trop de vérifications de prix : réessayez dans un moment.' } });
    expect((await check('nowhere')).status).toBe(404);
    expect((await check('not an id')).status).toBe(400);
  });

  it('says why when the page cannot be read', async () => {
    open = server = createTestServer({ fetcher: new FakeFetcher({}) });
    server.sync.push([listNote(LINE, 'Mode', T0 - 40 * DAY, { modules: ['pricewatch'] }), product('l1', url('atelier'))]);
    expect(await check('l1')).toEqual({ status: 502, body: { error: 'Page introuvable (404)' } });
    expect(linkOf('l1').price).toBe(89);
  });
});
