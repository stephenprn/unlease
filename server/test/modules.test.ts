import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { afterEach, describe, expect, it } from 'vitest';
import type { LinkBrief } from '@unlease/notes/sync/brief';
import { AUTH, claudeMessage, createTestServer, FakeFetcher, jpeg, T0, type TestServer } from './helpers';

const item: LinkBrief = { id: 'l1', url: 'https://komono.com/fr/products/winston-black', title: 'Montre Winston Black', site: 'Komono', kind: 'product', price: 79, currency: 'EUR', facts: [], summary: '' };

/** An answer as web search gives it: a search and its results, then the JSON. */
function searchMessage(answer: unknown, searches = 1): BetaMessage {
  const base = claudeMessage('');
  return claudeMessage('', {
    content: [
      { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'Winston Black' } },
      { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [] },
      { type: 'text', text: JSON.stringify(answer), citations: null },
    ],
    usage: { ...base.usage, server_tool_use: { web_search_requests: searches, web_fetch_requests: 0 } },
  });
}

let server: TestServer;
afterEach(() => server.close());

async function post(path: string, body: unknown) {
  const response = await server.app.request(path, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

const tasks = () => server.db.prepare('SELECT task, ok FROM analyses ORDER BY id').all();

describe('POST /api/offers', () => {
  it('finds the item new at other shops, the cheapest delivered first, with no second-hand range', async () => {
    server = createTestServer();
    server.claude.reply(
      searchMessage({
        offers: [
          { shop: 'Grand Bazar', title: '', price: 65, currency: 'EUR', shipping: 5, condition: 'new', details: '', url: null },
          { shop: 'Comptoir', title: '', price: 69, currency: 'EUR', shipping: 0, condition: 'new', details: 'En stock', url: 'https://comptoir.example/winston' },
          { shop: '', price: 10 },
        ],
        range: { low: 30, high: 40, currency: 'EUR' },
        note: 'Le prix affiché est déjà parmi les plus bas.',
      }),
    );
    const { status, body } = await post('/api/offers', { link: item, market: 'new', lang: 'fr', fresh: false });

    expect(status).toBe(200);
    expect(body.offers.map((offer: { shop: string }) => offer.shop)).toEqual(['Comptoir', 'Grand Bazar']);
    expect(body).toMatchObject({ range: null, note: 'Le prix affiché est déjà parmi les plus bas.', searchedAt: T0 });
    const request = server.claude.requests[0]!;
    expect(request.output_config).not.toHaveProperty('format');
    expect(request.tools).toEqual([
      { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 2, max_content_tokens: 8000 },
    ]);
    expect(server.claude.userText().split('\n\n').slice(0, 3)).toEqual(['Language: French.', 'Today: 2026-10-18.', 'Market: new.']);
    expect(tasks()).toEqual([{ task: 'cheaper', ok: 1 }]);
  });

  it('keeps second-hand apart, with its usual price, and asks for no price', async () => {
    server = createTestServer();
    const used = { offers: [{ shop: 'Le Grenier', title: 'Taille M', price: 35, currency: 'EUR', shipping: null, condition: 'used', details: 'Très bon état', url: 'https://grenier.example/1' }], range: { low: 30, high: 45, currency: 'EUR' }, note: '' };
    server.claude.reply(searchMessage(used), searchMessage({ offers: [], range: null, note: '' }));
    const unpriced = { ...item, price: null, currency: null };
    const first = await post('/api/offers', { link: unpriced, market: 'used', lang: 'fr', fresh: false });
    expect(first.body.range).toEqual({ low: 30, high: 45, currency: 'EUR' });
    expect(first.body.offers[0]).toMatchObject({ shop: 'Le Grenier', condition: 'used', details: 'Très bon état' });
    expect(server.claude.userText()).not.toContain('"price"');

    // Kept for second-hand only: new offers are another search, which needs a price.
    expect((await post('/api/offers', { link: unpriced, market: 'used', lang: 'fr', fresh: false })).body).toEqual(first.body);
    expect((await post('/api/offers', { link: unpriced, market: 'new', lang: 'fr', fresh: false })).status).toBe(400);
    await post('/api/offers', { link: item, market: 'new', lang: 'fr', fresh: false });
    expect(server.claude.requests).toHaveLength(2);
    expect(tasks()).toEqual([
      { task: 'secondhand', ok: 1 },
      { task: 'cheaper', ok: 1 },
    ]);
  });
});

const RECIPE = 'https://cuisine.example/recettes/tarte-fine';
const ingredients = Array.from({ length: 20 }, (_, index) => `${index + 1} ingrédient numéro ${index + 1}`);
const recipePage = (jsonLd: boolean) => `<!doctype html><html><head><title>Tarte fine aux pommes</title>${
  jsonLd ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Recipe', name: 'Tarte fine', recipeYield: ['6', '6 personnes'], recipeIngredient: ['40&nbsp;g de beurre', ...ingredients] })}</script>` : ''
}</head><body><h1>Tarte fine aux pommes</h1><p>Étaler la pâte, couper les pommes en lamelles fines et enfourner quarante minutes.</p></body></html>`;
const html = (body: string) => ({ headers: { 'content-type': 'text/html; charset=utf-8' }, body });

describe('POST /api/recipe', () => {
  it('reads every ingredient from the page’s structured data, for free, and keeps them a month', async () => {
    server = createTestServer({ fetcher: new FakeFetcher({ [RECIPE]: html(recipePage(true)) }) });
    const { status, body } = await post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'en' });

    expect(status).toBe(200);
    expect(body).toEqual({ ingredients: ['40 g de beurre', ...ingredients], servings: '6 personnes', steps: [] });
    expect(server.claude.requests).toHaveLength(0);
    const calls = (server.fetcher as FakeFetcher).calls.length;
    server.time.value += 20 * 86_400_000;
    expect((await post('/api/recipe', { link: { id: 'r2', url: `${RECIPE}?utm_source=x` }, lang: 'fr' })).body).toEqual(body);
    expect((server.fetcher as FakeFetcher).calls).toHaveLength(calls);
    expect(server.db.prepare('SELECT task, ok, cost_usd AS cost FROM analyses').all()).toEqual([{ task: 'recipe', ok: 1, cost: 0 }]);
  });

  it('asks Claude when the page gives no list, and says why without a key', async () => {
    server = createTestServer({ envApiKey: null, fetcher: new FakeFetcher({ [RECIPE]: html(recipePage(false)) }) });
    const refused = await post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'fr' });
    expect(refused).toEqual({ status: 409, body: { error: 'Cette page ne donne pas ses ingrédients toute seule : ajoutez une clé Claude pour qu’il les lise.' } });
    server.close();

    server = createTestServer({ fetcher: new FakeFetcher({ [RECIPE]: html(recipePage(false)) }) });
    server.claude.reply(claudeMessage({ ingredients: ['1 pâte feuilletée', '4 pommes', '4 pommes'], servings: '6 personnes', steps: [{ section: '', text: 'Étaler la pâte.' }, { section: '', text: ' ' }] }));
    const { status, body } = await post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'fr' });
    expect(status).toBe(200);
    expect(body).toEqual({ ingredients: ['1 pâte feuilletée', '4 pommes'], servings: '6 personnes', steps: [{ section: '', text: 'Étaler la pâte.' }] });
    const request = server.claude.requests[0]!;
    expect(request.output_config).toMatchObject({ format: { type: 'json_schema' } });
    expect(request).not.toHaveProperty('tools');
    expect(server.claude.userText()).toContain('Tarte fine aux pommes');
    expect(tasks()).toEqual([{ task: 'recipe', ok: 1 }]);
  });

  it('reads the method for the cook mode, and asks Claude for it only when the page has none', async () => {
    const crepes = `<!doctype html><html><head><title>Crêpes</title><script type="application/ld+json">${JSON.stringify({
      '@type': 'Recipe',
      name: 'Crêpes',
      recipeYield: '12 crêpes',
      recipeIngredient: ['250 g de farine', '4 œufs'],
      recipeInstructions: [
        { '@type': 'HowToSection', name: 'Pour la pâte', itemListElement: [{ '@type': 'HowToStep', name: 'Mélanger', text: 'Mélanger la farine et les œufs.' }, { '@type': 'HowToStep', text: '2. Laisser reposer 1&nbsp;h.' }] },
        'Cuire 2 min de chaque côté.<br>Servir chaud.',
      ],
    })}</script></head><body><p>Des crêpes.</p></body></html>`;
    server = createTestServer({ fetcher: new FakeFetcher({ [RECIPE]: html(crepes) }) });
    const { body } = await post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'fr', steps: true });
    expect(body.steps).toEqual([
      { section: 'Pour la pâte', text: 'Mélanger la farine et les œufs.' },
      { section: 'Pour la pâte', text: 'Laisser reposer 1 h.' },
      { section: '', text: 'Cuire 2 min de chaque côté.' },
      { section: '', text: 'Servir chaud.' },
    ]);
    expect(server.claude.requests).toHaveLength(0);
    server.close();

    // Ingredients without a method: the list is free, the cook mode asks Claude once for the steps, the page's own list kept.
    server = createTestServer({ fetcher: new FakeFetcher({ [RECIPE]: html(recipePage(true)) }) });
    expect((await post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'fr' })).body.steps).toEqual([]);
    server.claude.reply(claudeMessage({ ingredients: ['du beurre'], servings: '', steps: [{ section: '', text: 'Étaler la pâte.' }] }));
    const cooking = await post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'fr', steps: true });
    expect(cooking.body).toEqual({ ingredients: ['40 g de beurre', ...ingredients], servings: '6 personnes', steps: [{ section: '', text: 'Étaler la pâte.' }] });
    expect((await post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'fr', steps: true })).body).toEqual(cooking.body);
    expect(server.claude.requests).toHaveLength(1);
  });

  it('gives the page’s ingredients without a method when Claude is not there to read it', async () => {
    server = createTestServer({ envApiKey: null, fetcher: new FakeFetcher({ [RECIPE]: html(recipePage(true)) }) });
    const { status, body } = await post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'fr', steps: true });
    expect(status).toBe(200);
    expect(body.ingredients).toHaveLength(21);
    expect(body.steps).toEqual([]);
  });

  it('pays Claude once for a recipe with no method, and reads a page once for the list and the cook mode asked together', async () => {
    server = createTestServer({ fetcher: new FakeFetcher({ [RECIPE]: html(recipePage(true)) }) });
    server.claude.reply(claudeMessage({ ingredients: [], servings: '', steps: [] }));
    const first = await post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'fr', steps: true });
    expect(first.body.steps).toEqual([]);
    expect((await post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'fr', steps: true })).body).toEqual(first.body);
    expect(server.claude.requests).toHaveLength(1);
    server.close();

    server = createTestServer({ fetcher: new FakeFetcher({ [RECIPE]: html(recipePage(false)) }) });
    server.claude.reply(claudeMessage({ ingredients: ['1 pâte feuilletée'], servings: '', steps: [{ section: '', text: 'Étaler la pâte.' }] }));
    const [list, cooking] = await Promise.all([post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'fr' }), post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'fr', steps: true })]);
    expect(list.body.ingredients).toEqual(['1 pâte feuilletée']);
    expect(cooking.body.steps).toEqual([{ section: '', text: 'Étaler la pâte.' }]);
    expect(server.claude.requests).toHaveLength(1);
  });

  it('gives the cook mode the ingredients it kept when the page is gone since', async () => {
    let gone = false;
    server = createTestServer({ fetcher: new FakeFetcher({ [RECIPE]: () => (gone ? { status: 404, headers: { 'content-type': 'text/html' }, body: 'gone' } : html(recipePage(true))) }) });
    expect((await post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'fr' })).body.ingredients).toHaveLength(21);
    gone = true;
    const { status, body } = await post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'fr', steps: true });
    expect(status).toBe(200);
    expect(body.ingredients).toHaveLength(21);
    expect(body.steps).toEqual([]);
    expect(server.claude.requests).toHaveLength(0);
  });

  it('never pays Claude for a page that is gone', async () => {
    server = createTestServer({ fetcher: new FakeFetcher({}) });
    const { status, body } = await post('/api/recipe', { link: { id: 'r1', url: RECIPE }, lang: 'fr' });
    expect(status).toBe(502);
    expect(body.error).toContain('404');
    expect(server.claude.requests).toHaveLength(0);
  });
});

const ARTICLE = 'https://revue.example/villes-lentes';
const PICTURE = 'https://revue.example/images/rue.jpg';
const articlePage = `<!doctype html><html><head><title>Pourquoi les villes ralentissent | La Revue</title>
<meta property="og:title" content="Pourquoi les villes ralentissent"><meta property="og:site_name" content="La Revue urbaine">
<meta name="author" content="Claire Martin"><meta property="article:published_time" content="2026-10-14T08:00:00+02:00"></head><body>
<nav><a href="/">Accueil</a> <a href="/sujets">Sujets</a></nav>
<article>
<h1>Pourquoi les villes ralentissent</h1>
<div class="share-bar"><a href="https://social.example/share">Partager cet article sur les réseaux</a></div>
<p>Il y a dix ans, ralentir une ville passait pour une <em>lubie</em>. Aujourd’hui, des dizaines de communes ont fait le pas.</p>
<figure><img src="/images/rue.jpg" width="1200" height="800" alt=""><figcaption>Une rue scolaire à Lyon.</figcaption></figure>
<h2>Ce qui a changé</h2>
<p>Moins de bruit, moins d’accidents graves, et des rues où <strong>les enfants vont seuls</strong> à l’école. Voir <a href="/etude">l’étude complète</a>.</p>
<ul><li>Zones à 30 km/h</li><li>Rues scolaires<ul><li>aux heures d’entrée</li></ul></li></ul>
<blockquote><p>On a gagné du calme sans perdre de temps.</p></blockquote>
<pre><code class="language-python">print("ok")</code></pre>
<aside class="related"><p>À lire aussi : un autre article, très long, qui ne doit jamais apparaître dans la copie de celui-ci.</p></aside>
</article>
<footer><p>© La Revue urbaine, tous droits réservés, mentions légales et contact de la rédaction.</p></footer>
</body></html>`;

describe('POST /api/copies', () => {
  it('answers the article as blocks, its picture kept as a file, without the page’s chrome', async () => {
    server = createTestServer({ fetcher: new FakeFetcher({ [ARTICLE]: html(articlePage), [PICTURE]: { headers: { 'content-type': 'image/jpeg' }, body: await jpeg(1200, 800) } }) });
    const { status, body } = await post('/api/copies', { link: { id: 'a1', url: ARTICLE }, lang: 'fr' });

    expect(status).toBe(200);
    expect(body).toMatchObject({ title: 'Pourquoi les villes ralentissent', site: 'La Revue urbaine', byline: 'Claire Martin', published: '2026-10-14' });
    const drafts = body.drafts as { kind: string; text: string; language?: string; extra?: Record<string, unknown>; children?: { kind: string; text: string }[] }[];
    expect(drafts.map(draft => draft.kind)).toEqual(['text', 'image', 'text', 'h2', 'text', 'bullet', 'bullet', 'callout', 'code']);
    expect(drafts[0]!.text).toContain('{i:lubie}');
    expect(drafts[2]!.text).toBe('{i:Une rue scolaire à Lyon.}');
    expect(drafts[4]!.text).toContain('{b:les enfants vont seuls}');
    expect(drafts[4]!.text).toContain('revue.example/etude');
    expect(drafts[6]!.children).toEqual([{ kind: 'bullet', text: 'aux heures d’entrée' }]);
    expect(drafts[8]).toMatchObject({ kind: 'code', text: 'print("ok")', language: 'python' });
    const file = drafts[1]!.extra!;
    expect(file).toMatchObject({ mime: 'image/webp', uploaded: true });
    expect(server.blobs.get(file.fileId as string)).toMatchObject({ source: 'link' });
    const words = JSON.stringify(drafts);
    for (const chrome of ['Accueil', 'Partager', 'À lire aussi', 'mentions légales']) expect(words).not.toContain(chrome);
  });

  it('says so when the page cannot be read or holds no text', async () => {
    server = createTestServer({ fetcher: new FakeFetcher({ [ARTICLE]: html('<!doctype html><html><head><title>Vide</title></head><body><nav>Menu</nav></body></html>') }) });
    expect(await post('/api/copies', { link: { id: 'a1', url: ARTICLE }, lang: 'fr' })).toEqual({ status: 502, body: { error: 'Aucun texte à garder sur cette page' } });
    expect((await post('/api/copies', { link: { id: 'a1', url: 'https://ailleurs.example/' }, lang: 'fr' })).status).toBe(502);
    expect((await post('/api/copies', { link: { id: 'a1', url: 'pas une adresse' }, lang: 'fr' })).status).toBe(400);
  });

  it('keeps an article whatever the page’s own classes say of its layout, never its footer', async () => {
    const paragraph = (n: number) => `<p>Paragraphe ${n} de l’article, assez long pour compter comme du texte, avec des virgules, et encore un peu.</p>`;
    const page = `<!doctype html><html><head><title>Villes</title></head><body class="single right-sidebar"><form id="aspnetForm"><div class="content-sidebar-wrap"><main><article>${[1, 2, 3, 4].map(paragraph).join('')}</article></main><aside class="sidebar">${paragraph(9)}</aside></div></form><footer><div>${[7, 8, 9, 10, 11].map(paragraph).join('')}</div></footer></body></html>`;
    server = createTestServer({ fetcher: new FakeFetcher({ [ARTICLE]: html(page) }) });
    const { status, body } = await post('/api/copies', { link: { id: 'a1', url: ARTICLE }, lang: 'fr' });
    expect(status).toBe(200);
    expect(body.drafts.map((draft: { text: string }) => draft.text.slice(0, 12))).toEqual(['Paragraphe 1', 'Paragraphe 2', 'Paragraphe 3', 'Paragraphe 4']);
  });
});
