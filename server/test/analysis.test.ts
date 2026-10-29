import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INBOX_ID, LINK_KINDS } from '@unlease/notes/models/entities';
import { formatHlc, parseHlc } from '@unlease/core/sync/hlc';
import { FetchError } from '../src/apps/notes/analysis/fetcher';
import { buildRequest, ClaudeLinkModel } from '../src/apps/notes/analysis/model';
import { BROWSER_USER_AGENT, PREVIEW_USER_AGENT } from '../src/apps/notes/analysis/reader';
import {
  AUTH,
  analysisOf,
  claudeMessage,
  createTestServer,
  FakeClaude,
  FakeFetcher,
  fixture,
  jpeg,
  linkFields,
  listNote,
  pendingLink,
  postSync,
  rec,
  T0,
  type FakeRoute,
  type TestServer,
} from './helpers';
import { pendingLinkIds } from '../src/apps/notes/analysis/pending';

const SHOP = 'https://www.maison-lucette.fr/fr/femme/vestes/veste-jean-oversize-delavee-p4512.html';
const FACE = 'https://cdn.maison-lucette.fr/products/4512/veste-jean-face.jpg?w=1200';
const BACK = 'https://www.maison-lucette.fr/products/4512/veste-jean-dos.jpg';
const WORN = 'https://cdn.maison-lucette.fr/products/4512/veste-jean-porte.jpg';
const PAGE_IMAGE = 'https://www.maison-lucette.fr/products/4512/veste-jean-face-1600.jpg';
const FILM = 'https://www.cinefiche.fr/film/grande-evasion-1963';
const HTML = { 'content-type': 'text/html; charset=utf-8' };
const JPEG = { 'content-type': 'image/jpeg' };

const shopAnswer = {
  title: 'Veste en jean oversize délavée',
  site: 'Maison Lucette',
  kind: 'product',
  summary: 'Veste en jean coupe oversize en coton biologique, délavage moyen et boutons métal gravés.',
  price: { amount: 49.99, currency: 'EUR' },
  attributes: [
    { label: 'Marque', value: 'Maison Lucette' },
    { label: 'Couleur', value: 'Bleu délavé' },
    { label: 'Matière', value: '100 % coton biologique' },
  ],
  imageIndex: 0,
  listId: null,
  pageRead: true,
};

const filmAnswer = {
  title: 'La Grande Évasion',
  site: 'Cinéfiche',
  kind: 'film',
  summary: 'Film de guerre de John Sturges (1963) sur l’évasion massive d’officiers alliés d’un camp allemand.',
  price: null,
  attributes: [
    { label: 'Réalisateur', value: 'John Sturges' },
    { label: 'Année', value: '1963' },
    { label: 'Durée', value: '2 h 52 min' },
  ],
  imageIndex: 0,
  listId: null,
  pageRead: true,
};

let server: TestServer;
let shopRoutes: Record<string, FakeRoute>;

beforeEach(async () => {
  server = createTestServer();
  shopRoutes = {
    [SHOP]: { headers: HTML, body: fixture('shop-product.html') },
    [FACE]: { headers: JPEG, body: await jpeg(1200, 1500, { r: 40, g: 70, b: 140 }) },
    [BACK]: { headers: JPEG, body: await jpeg(1200, 1500, { r: 60, g: 90, b: 160 }) },
    [WORN]: { headers: JPEG, body: await jpeg(800, 1000, { r: 90, g: 110, b: 170 }) },
    [PAGE_IMAGE]: { headers: JPEG, body: await jpeg(1600, 2000, { r: 30, g: 50, b: 120 }) },
  };
  // The same product in another colour: a different URL, so no cache hit.
  shopRoutes[`${SHOP}?couleur=noir`] = shopRoutes[SHOP]!;
});
afterEach(() => server.close());

/** Lists "Mode" (with one link in it) and "Films", and the inbox. */
function pushLists(): void {
  server.sync.push([
    listNote(INBOX_ID, 'Non classé', T0 - 90_000, { position: 'a0' }),
    listNote('mode', 'Mode', T0 - 90_000, { position: 'a1', hint: 'Vêtements, chaussures et accessoires' }),
    listNote('films', 'Films', T0 - 90_000, { position: 'a2' }),
    rec('link', 'old1', { noteId: 'mode', url: 'https://shop.example/jupe', status: 'ready', title: 'Jupe plissée', createdAt: T0 - 80_000, deletedAt: null }, T0 - 80_000),
  ]);
}

describe('a link analysed end to end', () => {
  it('writes every field of the card in one server write', async () => {
    const claude = new FakeClaude().reply(claudeMessage(shopAnswer));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    const before = server.records.maxSeq();
    await queue.idle();

    const fields = linkFields(server, 'l1');
    expect(fields).toMatchObject({
      status: 'ready',
      error: null,
      title: 'Veste en jean oversize délavée',
      kind: 'product',
      summary: shopAnswer.summary,
      price: 49.99,
      currency: 'EUR',
      attributes: shopAnswer.attributes,
      siteName: 'Maison Lucette',
      imageUrl: FACE,
      analyzedAt: T0,
      noteId: INBOX_ID,
      autoFile: false,
    });
    expect(server.records.maxSeq()).toBe(before + 1);

    // One fresh server clock on every field it wrote, none on the fields it left alone.
    const stored = server.records.get('link', 'l1')!;
    const serverClock = stored.clocks.status!;
    expect(parseHlc(serverClock)?.node).toBe('srvtest01');
    for (const field of ['title', 'summary', 'kind', 'price', 'currency', 'attributes', 'siteName', 'imageIds', 'imageUrl', 'error', 'analyzedAt']) {
      expect(stored.clocks[field], field).toBe(serverClock);
    }
    expect(stored.clocks.url).toBe(formatHlc(T0 - 1000, 0, 'phone1'));

    // The chosen image first, then two more, all kept as WebP of at most 1200 px.
    const imageIds = fields.imageIds as string[];
    expect(imageIds).toHaveLength(3);
    for (const id of imageIds) {
      const blob = server.blobs.get(id)!;
      expect(blob).toMatchObject({ source: 'link', mime: 'image/webp' });
      expect(Math.max(blob.width, blob.height)).toBeLessThanOrEqual(1200);
    }
    expect(server.blobs.get(imageIds[0]!)!.height).toBe(1200);
  });

  it('asks Claude the right way: effort, structured output, cached system prompt, refusal fallback', async () => {
    const claude = new FakeClaude().reply(claudeMessage(shopAnswer));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();

    expect(claude.requests).toHaveLength(1);
    const request = claude.requests[0]!;
    expect(request).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      output_config: { effort: 'low', format: { type: 'json_schema' } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    expect(request).not.toHaveProperty('thinking');
    expect(request).not.toHaveProperty('tools');
    expect(request.system).toEqual([expect.objectContaining({ type: 'text', cache_control: { type: 'ephemeral' } })]);
    const schema = request.output_config!.format!.schema as { properties: Record<string, unknown>; additionalProperties: boolean; required: string[] };
    expect(Object.keys(schema.properties).sort()).toEqual(['attributes', 'imageIndex', 'kind', 'listId', 'pageRead', 'price', 'site', 'summary', 'title']);
    expect(schema.required).toHaveLength(9);
    expect(schema.additionalProperties).toBe(false);
    // The SDK helper turns enums into descriptions; the kind enum is restored so the API enforces it.
    expect(schema.properties.kind).toEqual({ type: 'string', enum: [...LINK_KINDS] });

    const text = claude.userText();
    expect(text).toContain('Filing is not asked for');
    expect(text).toContain('<page>');
    expect(text).toContain('Lowest offer in structured data: 49.99 EUR');
    expect(text).toContain(`[0] ${FACE} (og:image)`);
  });

  it('records what the call cost and reports it in /api/usage', async () => {
    const claude = new FakeClaude().reply(claudeMessage(shopAnswer));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();

    const usage = await (await server.app.request('/api/usage', { headers: AUTH })).json();
    // 3000 input at $4, 500 output at $20, 1500 cache reads at $0.20, per million.
    const cost = (3000 * 4 + 500 * 20 + 1500 * 0.2) / 1e6;
    expect(usage).toEqual({
      monthToDate: { analyses: 1, inputTokens: 4500, outputTokens: 500, costUsd: Number(cost.toFixed(4)) },
      total: { analyses: 1, inputTokens: 4500, outputTokens: 500, costUsd: Number(cost.toFixed(4)) },
      model: 'claude-opus-5-5',
      budgetUsd: 15,
    });
  });
});

describe('filing quick-input links', () => {
  it('moves the link to the list Claude picks, showing it every list with examples', async () => {
    pushLists();
    const claude = new FakeClaude().reply(claudeMessage({ ...shopAnswer, listId: 'mode' }));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000, { autoFile: true })]);
    await queue.idle();

    expect(linkFields(server, 'l1')).toMatchObject({ status: 'ready', noteId: 'mode', autoFile: false, filedBy: 'claude' });
    const text = claude.userText();
    expect(text).toContain('file it');
    expect(text).toContain('{"id":"inbox","title":"Non classé"}');
    expect(text).toContain('{"id":"mode","title":"Mode","description":"Vêtements, chaussures et accessoires","examples":["Jupe plissée"]}');
    expect(text).toContain('{"id":"films","title":"Films"}');
  });

  it('falls back to the inbox when nothing fits or Claude names a list that does not exist', async () => {
    pushLists();
    const claude = new FakeClaude().reply(claudeMessage({ ...shopAnswer, listId: null }), claudeMessage({ ...filmAnswer, listId: 'cinema-imaginaire' }));
    const fetcher = new FakeFetcher({ ...shopRoutes, [FILM]: { headers: HTML, body: fixture('film.html') } });
    const { queue } = analysisOf(server, { fetcher, claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000, { autoFile: true, noteId: 'films' })]);
    await queue.idle();
    server.sync.push([pendingLink('l2', FILM, T0 - 1000, { autoFile: true, noteId: 'mode' })]);
    await queue.idle();

    expect(linkFields(server, 'l1')).toMatchObject({ status: 'ready', noteId: INBOX_ID, autoFile: false });
    expect(linkFields(server, 'l2')).toMatchObject({ status: 'ready', noteId: INBOX_ID, autoFile: false, title: 'La Grande Évasion' });
    // Landing in "Non classé" is no one's choice.
    expect(linkFields(server, 'l1').filedBy).toBeUndefined();
    expect(linkFields(server, 'l2').filedBy).toBeUndefined();
  });

  it('leaves a link where it is when filing was not asked for', async () => {
    pushLists();
    const claude = new FakeClaude().reply(claudeMessage({ ...shopAnswer, listId: 'films' }));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000, { noteId: 'mode' })]);
    await queue.idle();
    expect(linkFields(server, 'l1')).toMatchObject({ status: 'ready', noteId: 'mode' });
  });

  it('keeps the choice of a person who moved the link while it was being read', async () => {
    pushLists();
    const claude = new FakeClaude().reply(() => {
      server.sync.push([rec('link', 'l1', { noteId: 'films' }, T0 - 500, 'web001')]);
      return claudeMessage({ ...shopAnswer, listId: 'mode' });
    });
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000, { autoFile: true })]);
    await queue.idle();
    expect(linkFields(server, 'l1')).toMatchObject({ status: 'ready', noteId: 'films', autoFile: false });
    expect(linkFields(server, 'l1').filedBy).toBeUndefined();
  });
});

describe('reading difficult pages', () => {
  it('retries a bot wall as a link-preview bot', async () => {
    const fetcher = new FakeFetcher({
      ...shopRoutes,
      [SHOP]: userAgent =>
        userAgent === PREVIEW_USER_AGENT
          ? { headers: HTML, body: fixture('shop-product.html') }
          : { status: 403, headers: HTML, body: fixture('challenge.html') },
    });
    const claude = new FakeClaude().reply(claudeMessage(shopAnswer));
    const { queue } = analysisOf(server, { fetcher, claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();

    expect(fetcher.calls.filter(call => call.url === SHOP).map(call => call.userAgent)).toEqual([BROWSER_USER_AGENT, PREVIEW_USER_AGENT]);
    expect(claude.requests[0]).not.toHaveProperty('tools');
    expect(claude.userText()).toContain('Veste en jean oversize délavée');
    expect(linkFields(server, 'l1').status).toBe('ready');
    // Images are fetched with the page as referer.
    expect(fetcher.calls.find(call => call.url === FACE)?.referer).toBe(SHOP);
  });

  it('still asks Claude about a thin page, from what little there is', async () => {
    const thin = 'https://app.example.com/item/3';
    const fetcher = new FakeFetcher({ [thin]: { headers: HTML, body: fixture('thin.html') } });
    const claude = new FakeClaude().reply(claudeMessage({ ...shopAnswer, title: 'Article 3', kind: 'other', price: null, imageIndex: null }));
    const { queue } = analysisOf(server, { fetcher, claude });
    server.sync.push([pendingLink('l1', thin, T0 - 1000)]);
    await queue.idle();

    expect(fetcher.calls.map(call => call.userAgent)).toEqual([BROWSER_USER_AGENT, PREVIEW_USER_AGENT]);
    expect(claude.requests[0]).not.toHaveProperty('tools');
    expect(claude.userText()).toContain('Page text: none');
    expect(claude.userText()).toContain('Image candidates: none');
    expect(linkFields(server, 'l1')).toMatchObject({ status: 'ready', title: 'Article 3', imageIds: [], imageUrl: null });
  });

  it('lets Claude fetch the page itself when the server cannot', async () => {
    const fetcher = new FakeFetcher({ [SHOP]: { status: 403, headers: HTML, body: fixture('challenge.html') } });
    const claude = new FakeClaude().reply(
      claudeMessage(null, {
        content: [
          { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_fetch', input: { url: SHOP } },
          {
            type: 'web_fetch_tool_result',
            tool_use_id: 'srvtoolu_1',
            content: {
              type: 'web_fetch_result',
              url: SHOP,
              retrieved_at: '2026-10-18T12:00:00Z',
              content: { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'Veste en jean...' }, title: 'Veste', citations: null },
            },
          },
          { type: 'text', text: JSON.stringify({ ...shopAnswer, imageIndex: null }), citations: null },
        ],
      }),
    );
    const { queue } = analysisOf(server, { fetcher, claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();

    expect(claude.requests[0]!.tools).toEqual([{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 1, max_content_tokens: 8000 }]);
    expect(claude.userText()).toContain('The server could not read this page (Page inaccessible (403))');
    expect(linkFields(server, 'l1')).toMatchObject({ status: 'ready', title: 'Veste en jean oversize délavée', price: 49.99 });
  });

  it('keeps the pictures of a page only Claude could read, from what web_fetch returned', async () => {
    const logo = 'https://www.maison-lucette.fr/static/logo.png';
    const fetcher = new FakeFetcher({
      [SHOP]: { status: 403, headers: HTML, body: fixture('challenge.html') },
      [FACE]: shopRoutes[FACE]!,
      [BACK]: shopRoutes[BACK]!,
      [logo]: { headers: { 'content-type': 'image/png' }, body: await jpeg(400, 400) },
    });
    const document = [
      '---',
      `canonical: ${SHOP}`,
      `meta-og:image: ${FACE}`,
      'title: Veste en jean oversize délavée | Maison Lucette',
      '---',
      '',
      `[![Maison Lucette](${logo})](https://www.maison-lucette.fr/) ![](https://www.maison-lucette.fr/static/loader.svg)`,
      `![Veste en jean - 1](${FACE.replace('w=1200', 'w=650')}) ![Veste en jean - 2](${BACK})`,
      'Veste en jean oversize délavée, 49,99 €',
    ].join('\n');
    const claude = new FakeClaude().reply(
      claudeMessage(null, {
        content: [
          { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_fetch', input: { url: SHOP } },
          {
            type: 'web_fetch_tool_result',
            tool_use_id: 'srvtoolu_1',
            content: {
              type: 'web_fetch_result',
              url: SHOP,
              retrieved_at: '2026-10-18T12:00:00Z',
              content: { type: 'document', source: { type: 'text', media_type: 'text/plain', data: document }, title: 'Veste', citations: null },
            },
          },
          { type: 'text', text: JSON.stringify({ ...shopAnswer, imageIndex: null }), citations: null },
        ],
      }),
    );
    const { queue } = analysisOf(server, { fetcher, claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();

    // og:image first; the same file at another size, the logo and the SVG loader are left out.
    expect(fetcher.urls().filter(url => url !== SHOP)).toEqual([FACE, BACK]);
    const fields = linkFields(server, 'l1');
    expect(fields).toMatchObject({ status: 'ready', imageUrl: FACE });
    expect(fields.imageIds).toHaveLength(2);
  });

  it('uses oEmbed for a video whose page is a consent wall, and keeps its thumbnail', async () => {
    const video = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const thumbnail = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    const consent = '<html><head><title>Avant d’accéder à YouTube</title></head><body>Avant d’accéder à YouTube</body></html>';
    const fetcher = new FakeFetcher({
      [video]: { headers: HTML, body: consent, url: 'https://consent.youtube.com/m?continue=x' },
      [`https://www.youtube.com/oembed?url=${encodeURIComponent(video)}&format=json`]: {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Never Gonna Give You Up', author_name: 'Rick Astley', provider_name: 'YouTube', thumbnail_url: thumbnail, type: 'video' }),
      },
      [thumbnail]: { headers: JPEG, body: await jpeg(480, 360) },
    });
    const claude = new FakeClaude().reply(
      claudeMessage({ ...shopAnswer, title: 'Never Gonna Give You Up', site: 'YouTube', kind: 'music', price: null, attributes: [{ label: 'Artiste', value: 'Rick Astley' }] }),
    );
    const { queue } = analysisOf(server, { fetcher, claude });
    server.sync.push([pendingLink('l1', video, T0 - 1000)]);
    await queue.idle();

    expect(claude.requests[0]).not.toHaveProperty('tools');
    expect(claude.userText()).toContain('oEmbed (YouTube): title "Never Gonna Give You Up", by "Rick Astley"');
    expect(claude.userText()).toContain(`[0] ${thumbnail} (oembed thumbnail)`);
    const fields = linkFields(server, 'l1');
    expect(fields).toMatchObject({ status: 'ready', kind: 'music', siteName: 'YouTube', imageUrl: thumbnail });
    expect(fields.imageIds).toHaveLength(1);
  });

  it('turns a direct image link into a link whose image is that image', async () => {
    const url = 'https://images.example-cdn.com/photos/lampe-champignon.jpg';
    const fetcher = new FakeFetcher({ [url]: { headers: JPEG, body: await jpeg(1000, 800) } });
    const claude = new FakeClaude().reply(
      claudeMessage({ ...shopAnswer, title: 'Lampe champignon en verre', price: null, attributes: [], imageIndex: 0 }),
    );
    const { queue } = analysisOf(server, { fetcher, claude });
    server.sync.push([pendingLink('l1', url, T0 - 1000)]);
    await queue.idle();

    const content = claude.requests[0]!.messages[0]!.content as { type: string; source?: { media_type: string } }[];
    expect(content[0]).toMatchObject({ type: 'image', source: { media_type: 'image/webp' } });
    expect(claude.userText()).toContain('direct link to an image');
    expect(fetcher.urls()).toEqual([url]);
    const fields = linkFields(server, 'l1');
    expect(fields).toMatchObject({ status: 'ready', title: 'Lampe champignon en verre', imageUrl: url });
    expect(fields.imageIds).toHaveLength(1);
  });
});

describe('when no Claude key is set', () => {
  let keyless: TestServer;
  beforeEach(() => {
    keyless = createTestServer({ envApiKey: null });
  });
  afterEach(() => keyless.close());

  it('does not read the link at all: it becomes skipped, in one server write', async () => {
    const fetcher = new FakeFetcher(shopRoutes);
    const claude = new FakeClaude();
    const { queue } = analysisOf(keyless, { fetcher, claude });
    const before = keyless.records.maxSeq();
    // Over HTTP, so the device that pushed the link sees it skipped in its own answer.
    const answer = await postSync(keyless, { node: 'phone1', since: 0, records: [pendingLink('l1', SHOP, T0 - 1000, { autoFile: true })] });
    await queue.idle();
    expect(answer.body.records[0].fields.status).toBe('skipped');

    const stored = keyless.records.get('link', 'l1')!;
    expect(stored.fields).toMatchObject({ status: 'skipped', autoFile: false, error: null, noteId: INBOX_ID, title: '' });
    // The device's write, then the server's one write.
    expect(keyless.records.maxSeq()).toBe(before + 2);
    expect(parseHlc(stored.clocks.status!)?.node).toBe('srvtest01');
    expect(stored.clocks.autoFile).toBe(stored.clocks.status);
    expect(fetcher.calls).toHaveLength(0);
    expect(claude.requests).toHaveLength(0);
    expect(keyless.db.prepare('SELECT count(*) AS n FROM analyses').get()).toEqual({ n: 0 });
  });

  it('keeps a quick-input link in the inbox', async () => {
    const { queue } = analysisOf(keyless, { fetcher: new FakeFetcher(shopRoutes) });
    keyless.sync.push([pendingLink('l1', SHOP, T0 - 1000, { autoFile: true, noteId: 'mode' }), pendingLink('l2', FILM, T0 - 1000, { noteId: 'films' })]);
    await queue.idle();
    expect(linkFields(keyless, 'l1')).toMatchObject({ status: 'skipped', noteId: INBOX_ID, autoFile: false });
    expect(linkFields(keyless, 'l2')).toMatchObject({ status: 'skipped', noteId: 'films', autoFile: false });
  });

  it('turns links left pending at the last stop into skipped links at startup', async () => {
    keyless.sync.push([pendingLink('l1', SHOP, T0 - 2000), pendingLink('l2', FILM, T0 - 1000)]);
    const { queue } = analysisOf(keyless, { fetcher: new FakeFetcher(shopRoutes) });
    queue.enqueue(pendingLinkIds(keyless.db));
    await queue.idle();
    expect(pendingLinkIds(keyless.db)).toEqual([]);
    expect([linkFields(keyless, 'l1').status, linkFields(keyless, 'l2').status]).toEqual(['skipped', 'skipped']);
  });

  it('reads a skipped link once a key is set and a device sends it back to pending', async () => {
    const claude = new FakeClaude().reply(claudeMessage(shopAnswer));
    const { queue } = analysisOf(keyless, { fetcher: new FakeFetcher(shopRoutes), claude });
    keyless.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();
    expect(linkFields(keyless, 'l1').status).toBe('skipped');

    keyless.settings.update({ apiKey: 'sk-ant-app-key-9z9z' });
    expect(((await (await keyless.app.request('/api/health')).json()) as { analysis: boolean }).analysis).toBe(true);
    keyless.sync.push([rec('link', 'l1', { status: 'pending' }, T0 + 1000, 'web001')]);
    await queue.idle();
    expect(linkFields(keyless, 'l1')).toMatchObject({ status: 'ready', title: 'Veste en jean oversize délavée' });
    expect(claude.requests).toHaveLength(1);
  });
});

describe('when the analysis fails', () => {
  it('marks the link failed with a French reason, moves a quick-input link to the inbox and bills the call', async () => {
    pushLists();
    const fetcher = new FakeFetcher({ [SHOP]: { status: 403, headers: HTML, body: fixture('challenge.html') } });
    const claude = new FakeClaude().reply(
      claudeMessage(null, {
        content: [
          { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_fetch', input: { url: SHOP } },
          { type: 'web_fetch_tool_result', tool_use_id: 'srvtoolu_1', content: { type: 'web_fetch_tool_result_error', error_code: 'url_not_accessible' } },
          {
            type: 'text',
            text: JSON.stringify({ ...shopAnswer, title: 'Veste en jean oversize délavée (Maison Lucette)', price: null, pageRead: false, listId: 'mode' }),
            citations: null,
          },
        ],
      }),
    );
    const { queue } = analysisOf(server, { fetcher, claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000, { autoFile: true, noteId: 'films' })]);
    await queue.idle();

    expect(linkFields(server, 'l1')).toMatchObject({
      status: 'failed',
      error: 'Page inaccessible (403)',
      title: 'Veste en jean oversize délavée (Maison Lucette)',
      kind: 'product',
      siteName: 'Maison Lucette',
      noteId: INBOX_ID,
      autoFile: false,
      analyzedAt: T0,
    });
    const row = server.db.prepare('SELECT ok, cost_usd, error FROM analyses').get() as { ok: number; cost_usd: number; error: string };
    expect(row.ok).toBe(0);
    expect(row.cost_usd).toBeGreaterThan(0);
  });

  it('refuses new analyses once the month has spent the budget', async () => {
    const claude = new FakeClaude().reply(claudeMessage(shopAnswer));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude, budget: 1 });
    // Last month's spending does not count against this month.
    server.time.value = Date.UTC(2026, 8, 20);
    server.usage.record({ linkId: 'x', url: 'https://a.fr/', usage: { model: 'claude-opus-5-5', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 5 }, ok: true, cached: false, error: null, durationMs: 1, result: null });
    server.time.value = T0;
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();
    expect(linkFields(server, 'l1').status).toBe('ready');

    server.usage.record({ linkId: 'y', url: 'https://b.fr/', usage: { model: 'claude-opus-5-5', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 1.2 }, ok: true, cached: false, error: null, durationMs: 1, result: null });
    server.sync.push([pendingLink('l2', `${SHOP}?couleur=noir`, T0 - 900)]);
    await queue.idle();
    expect(linkFields(server, 'l2')).toMatchObject({ status: 'failed', error: 'Budget mensuel atteint', title: 'Veste en jean oversize délavée' });
    expect(claude.requests).toHaveLength(1);
  });

  it('treats a refusal as a failure, checked before reading any content', async () => {
    const claude = new FakeClaude().reply(claudeMessage(null, { content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null } }));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();
    expect(linkFields(server, 'l1')).toMatchObject({ status: 'failed', error: 'Analyse refusée par Claude' });
  });

  it('retries once after a rate limit, and gives up after a second overload', async () => {
    const limited = new Anthropic.RateLimitError(429, { type: 'error' }, 'slow down', new Headers({ 'retry-after': '0' }));
    const overloaded = () => new Anthropic.InternalServerError(529, { type: 'error' }, 'overloaded', new Headers());
    const claude = new FakeClaude().reply(limited, claudeMessage(shopAnswer), overloaded(), overloaded());
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();
    expect(linkFields(server, 'l1').status).toBe('ready');
    expect(claude.requests).toHaveLength(2);

    server.sync.push([pendingLink('l2', `${SHOP}?couleur=noir`, T0 - 900)]);
    await queue.idle();
    expect(linkFields(server, 'l2')).toMatchObject({ status: 'failed', error: 'Claude est surchargé' });
    expect(claude.requests).toHaveLength(4);
  });

  it('refuses private addresses without asking Claude', async () => {
    const url = 'http://192.168.1.1/admin';
    const claude = new FakeClaude();
    const fetcher = new FakeFetcher({ [url]: { error: new FetchError('blocked', '192.168.1.1 is not a public address') } });
    const { queue } = analysisOf(server, { fetcher, claude });
    server.sync.push([pendingLink('l1', url, T0 - 1000)]);
    await queue.idle();
    expect(linkFields(server, 'l1')).toMatchObject({ status: 'failed', error: 'Adresse non autorisée' });
    expect(claude.requests).toHaveLength(0);
  });

  it('writes nothing over a link deleted while it was being read', async () => {
    const claude = new FakeClaude().reply(() => {
      server.sync.push([rec('link', 'l1', { deletedAt: T0 - 400 }, T0 - 400, 'web001')]);
      return claudeMessage(shopAnswer);
    });
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();
    expect(linkFields(server, 'l1')).toMatchObject({ status: 'pending', deletedAt: T0 - 400, title: '' });
  });

  it('reads a link again when its URL changed during the analysis', async () => {
    const fetcher = new FakeFetcher({ ...shopRoutes, [FILM]: { headers: HTML, body: fixture('film.html') } });
    const claude = new FakeClaude().reply(() => {
      server.sync.push([rec('link', 'l1', { url: FILM }, T0 - 400, 'web001')]);
      return claudeMessage(shopAnswer);
    }, claudeMessage(filmAnswer));
    const { queue } = analysisOf(server, { fetcher, claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();
    expect(linkFields(server, 'l1')).toMatchObject({ status: 'ready', url: FILM, title: 'La Grande Évasion', kind: 'film' });
    expect(claude.requests).toHaveLength(2);
  });
});

describe('the 30-day cache', () => {
  it('reuses the analysis of the same normalized URL, images and filing included', async () => {
    pushLists();
    const claude = new FakeClaude().reply(claudeMessage({ ...shopAnswer, listId: 'mode' }));
    const fetcher = new FakeFetcher({ ...shopRoutes, [`${SHOP}?utm_source=instagram`]: shopRoutes[SHOP]! });
    const { queue } = analysisOf(server, { fetcher, claude });
    server.sync.push([pendingLink('l1', `${SHOP}?utm_source=instagram&fbclid=abc`, T0 - 2000, { autoFile: true })]);
    await queue.idle();
    const fetchesAfterFirst = fetcher.calls.length;

    server.time.value = T0 + 3 * 86_400_000;
    server.sync.push([pendingLink('l2', `${SHOP}?utm_medium=social`, T0 - 1000, { autoFile: true })]);
    await queue.idle();

    expect(claude.requests).toHaveLength(1);
    expect(fetcher.calls.length).toBe(fetchesAfterFirst);
    const first = linkFields(server, 'l1');
    const second = linkFields(server, 'l2');
    expect(second).toMatchObject({ status: 'ready', title: first.title, summary: first.summary, price: 49.99, noteId: 'mode', autoFile: false });
    expect(second.imageIds).toEqual(first.imageIds);
    const rows = server.db.prepare('SELECT cached, model FROM analyses ORDER BY id').all();
    expect(rows).toEqual([
      { cached: 0, model: 'claude-opus-5-5' },
      { cached: 1, model: null },
    ]);
  });

  it('files a link shared again into the list it went to before, renamed since', async () => {
    pushLists();
    const claude = new FakeClaude().reply(claudeMessage({ ...shopAnswer, listId: 'mode' }));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 2000, { autoFile: true })]);
    await queue.idle();
    server.sync.push([rec('note', 'mode', { title: 'Garde-robe' }, T0 - 1500, 'web001')]);
    server.sync.push([pendingLink('l2', SHOP, T0 - 1000, { autoFile: true })]);
    await queue.idle();

    expect(claude.requests).toHaveLength(1);
    expect(linkFields(server, 'l2')).toMatchObject({ status: 'ready', noteId: 'mode', filedBy: 'claude' });
  });

  it('is skipped for a re-analysis, which the client asks for by syncing status pending again', async () => {
    const claude = new FakeClaude().reply(claudeMessage(shopAnswer), claudeMessage({ ...shopAnswer, price: { amount: 39.99, currency: 'EUR' } }));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();
    expect(linkFields(server, 'l1').price).toBe(49.99);

    server.time.value = T0 + 60_000;
    server.sync.push([rec('link', 'l1', { status: 'pending' }, T0 + 30_000, 'web001')]);
    await queue.idle();
    expect(linkFields(server, 'l1')).toMatchObject({ status: 'ready', price: 39.99, analyzedAt: T0 + 60_000 });
    expect(claude.requests).toHaveLength(2);
  });

  it('still serves a link whose earlier attempt failed', async () => {
    const claude = new FakeClaude().reply(claudeMessage(shopAnswer));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude, budget: 0 });
    server.sync.push([pendingLink('l2', SHOP, T0 - 1000)]);
    await queue.idle();
    expect(linkFields(server, 'l2')).toMatchObject({ status: 'failed', error: 'Budget mensuel atteint' });

    // The owner raises the budget; another device's link to the same page is read; asking again for l2 reuses it for free.
    const second = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude, budget: 15 });
    server.sync.push([pendingLink('l1', SHOP, T0 - 900)]);
    await second.queue.idle();
    // The device asks after it saw the failure, so its clock is past the server's write.
    server.sync.push([rec('link', 'l2', { status: 'pending' }, T0 + 1000, 'web001')]);
    await second.queue.idle();
    expect(linkFields(server, 'l2')).toMatchObject({ status: 'ready', error: null, title: 'Veste en jean oversize délavée' });
    expect(claude.requests).toHaveLength(1);
  });

  it('expires after 30 days', async () => {
    const claude = new FakeClaude().reply(claudeMessage(shopAnswer), claudeMessage(shopAnswer));
    const { queue } = analysisOf(server, { fetcher: new FakeFetcher(shopRoutes), claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();
    server.time.value = T0 + 31 * 86_400_000;
    server.sync.push([pendingLink('l2', SHOP, server.time.value - 1000)]);
    await queue.idle();
    expect(claude.requests).toHaveLength(2);
  });
});

describe('the queue', () => {
  it('picks up links left pending at the last shutdown', async () => {
    server.sync.push([pendingLink('l1', SHOP, T0 - 2000), pendingLink('l2', FILM, T0 - 1000), rec('link', 'gone', { url: SHOP, status: 'pending', deletedAt: T0 }, T0)]);
    expect(pendingLinkIds(server.db)).toEqual(['l1', 'l2']);
    const fetcher = new FakeFetcher({ ...shopRoutes, [FILM]: { headers: HTML, body: fixture('film.html') } });
    const claude = new FakeClaude().reply(
      params => claudeMessage(JSON.stringify(params).includes('cinefiche') ? filmAnswer : shopAnswer),
      params => claudeMessage(JSON.stringify(params).includes('cinefiche') ? filmAnswer : shopAnswer),
    );
    const { queue } = analysisOf(server, { fetcher, claude });
    queue.enqueue(pendingLinkIds(server.db));
    await queue.idle();
    expect(linkFields(server, 'l1').title).toBe('Veste en jean oversize délavée');
    expect(linkFields(server, 'l2').title).toBe('La Grande Évasion');
  });
});

describe('the Claude request', () => {
  const describeRequest = { url: SHOP, digest: 'URL: x', lists: null, lang: 'fr' as const, webFetch: { reason: 'Délai dépassé' }, image: null, imageCount: 0 };

  it('names the language the link asks for on the message\'s first line', () => {
    const text = (request: ReturnType<typeof buildRequest>) => JSON.stringify(request.messages[0]!.content);
    expect(text(buildRequest(describeRequest, 'claude-opus-5-5', 'low'))).toContain('Language: French.');
    expect(text(buildRequest({ ...describeRequest, lang: 'en' }, 'claude-opus-5-5', 'low'))).toContain('Language: English.');
  });

  it('drops the server-side fallback and uses the basic web fetch tool on Haiku', () => {
    const request = buildRequest(describeRequest, 'claude-haiku-5-5', 'low');
    expect(request).not.toHaveProperty('fallbacks');
    expect(request).not.toHaveProperty('betas');
    expect(request.tools).toEqual([{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 1, max_content_tokens: 8000 }]);
  });

  it('bills each attempt of a refusal fallback at the rates of the model that ran it', async () => {
    const claude = new FakeClaude().reply(
      claudeMessage(shopAnswer, {
        model: 'claude-opus-5',
        usage: {
          input_tokens: 2000,
          output_tokens: 300,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          iterations: [
            { type: 'message', model: 'claude-opus-5-5', input_tokens: 2000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
            { type: 'fallback_message', model: 'claude-opus-5', input_tokens: 2000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          ],
        },
      }),
    );
    const model = new ClaudeLinkModel(claude, { model: 'claude-opus-5-5', effort: 'low' });
    const { usage } = await model.describe({ ...describeRequest, webFetch: null }, new AbortController().signal);
    expect(usage.model).toBe('claude-opus-5');
    expect(usage.costUsd).toBeCloseTo((2000 * 4) / 1e6 + (2000 * 5 + 300 * 25) / 1e6, 10);
  });

  it('resumes a paused server-tool turn by sending it back', async () => {
    const paused = claudeMessage(null, {
      stop_reason: 'pause_turn',
      content: [{ type: 'server_tool_use', id: 'srvtoolu_9', name: 'web_fetch', input: { url: SHOP } }],
    });
    const claude = new FakeClaude().reply(paused, claudeMessage(shopAnswer));
    const model = new ClaudeLinkModel(claude, { model: 'claude-opus-5-5', effort: 'low' });
    const { output } = await model.describe({ ...describeRequest, webFetch: null }, new AbortController().signal);
    expect(output.title).toBe('Veste en jean oversize délavée');
    expect(claude.requests[1]!.messages).toHaveLength(2);
    expect(claude.requests[1]!.messages[1]).toMatchObject({ role: 'assistant', content: paused.content });
  });

  it('clips and checks what Claude answers before it becomes link fields', async () => {
    const long = 'Une phrase descriptive assez longue pour dépasser la limite. '.repeat(10);
    const claude = new FakeClaude().reply(
      claudeMessage({
        ...shopAnswer,
        summary: long,
        price: { amount: 49.999, currency: '€' },
        attributes: Array.from({ length: 9 }, (_, i) => ({ label: i === 1 ? 'Marque' : `Détail ${i}`, value: ` valeur ${i} ` })).concat([
          { label: 'Marque', value: 'doublon' },
        ]),
        imageIndex: 7,
      }),
    );
    const model = new ClaudeLinkModel(claude, { model: 'claude-opus-5-5', effort: 'low' });
    const { output } = await model.describe({ ...describeRequest, webFetch: null, imageCount: 2 }, new AbortController().signal);
    expect(output.summary.length).toBeLessThanOrEqual(240);
    expect(output.summary.endsWith('…')).toBe(true);
    expect(output.price).toBe(50);
    expect(output.currency).toBe('EUR');
    expect(output.attributes).toHaveLength(6);
    expect(output.attributes[0]).toEqual({ label: 'Détail 0', value: 'valeur 0' });
    expect(output.imageIndex).toBeNull();
  });

  it('fails cleanly on an answer that is not the schema', async () => {
    const claude = new FakeClaude().reply(claudeMessage('{"title": 3}'));
    const model = new ClaudeLinkModel(claude, { model: 'claude-opus-5-5', effort: 'low' });
    await expect(model.describe({ ...describeRequest, webFetch: null }, new AbortController().signal)).rejects.toThrow('Réponse de Claude illisible');
  });
});

describe('image handling', () => {
  it('skips images that are too small, not images, or the same picture twice', async () => {
    const fetcher = new FakeFetcher({
      ...shopRoutes,
      [FACE]: { headers: JPEG, body: await jpeg(100, 100) },
      [BACK]: { headers: { 'content-type': 'image/svg+xml' }, body: '<svg/>' },
      [WORN]: { headers: JPEG, body: await jpeg(900, 900, { r: 1, g: 2, b: 3 }) },
      [PAGE_IMAGE]: { headers: JPEG, body: await jpeg(900, 900, { r: 1, g: 2, b: 3 }) },
    });
    const claude = new FakeClaude().reply(claudeMessage(shopAnswer));
    const { queue } = analysisOf(server, { fetcher, claude });
    server.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();
    const fields = linkFields(server, 'l1');
    expect(fields.imageIds).toHaveLength(1);
    expect(fields.imageUrl).toBe(FACE);
    const kept = server.blobs.get((fields.imageIds as string[])[0]!)!;
    const stored = await sharp(server.blobs.path(kept.id, 'display')).metadata();
    expect([stored.format, stored.width]).toEqual(['webp', 900]);
  });
});
