import { afterEach, describe, expect, it } from 'vitest';
import type { SyncRecord } from '@unlease/core/sync/record';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import { Housekeeping } from '../src/jobs/housekeeping';
import { AUTH, createTestServer, FakeFetcher, jpeg, postSync, rec, T0, type TestServer } from './helpers';
import { putSettings } from './seed';

let server: TestServer;
afterEach(() => server.close());

async function post(path: string, body: unknown) {
  const response = await server.app.request(path, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

const html = (body: string) => ({ headers: { 'content-type': 'text/html; charset=utf-8' }, body });

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

const LINK = 'a1';
const ask = (extra: Record<string, unknown> = {}) => post('/api/pages/copies', { link: { id: LINK, url: ARTICLE }, lang: 'fr', ...extra });

/** A server reading the article, holding the link (in Non classé) and a page already at the top level. */
async function withLink(page = articlePage): Promise<FakeFetcher> {
  const fetcher = new FakeFetcher({ [ARTICLE]: html(page), [PICTURE]: { headers: { 'content-type': 'image/jpeg' }, body: await jpeg(1200, 800) } });
  server = createTestServer({ fetcher });
  server.sync.push([
    rec('link', LINK, { noteId: 'inbox', url: ARTICLE, status: 'ready', title: 'Les villes lentes', kind: 'article', createdAt: T0, deletedAt: null }, T0),
    rec('block', 'other', { kind: 'page', parentId: null, text: 'Autre page', position: 'a5', trashedAt: null, createdAt: T0, deletedAt: null }, T0),
  ]);
  return fetcher;
}

/** The live blocks under `parent`, in their order. */
function childrenOf(parent: string | null): SyncRecord[] {
  return server.records
    .ofType('block')
    .filter(block => (block.fields.parentId ?? null) === parent && block.fields.deletedAt === null)
    .sort((a, b) => (String(a.fields.position) < String(b.fields.position) ? -1 : 1));
}

describe('POST /api/pages/copies', () => {
  it('writes the article as a page after the others: the link’s card, who wrote it and when, then its blocks, the picture kept as a file', async () => {
    await withLink();
    const { status, body } = await ask();
    expect(status).toBe(200);
    const pageId = body.pageId as string;

    const top = childrenOf(null);
    expect(top.map(block => block.id)).toEqual(['other', pageId]);
    expect(top[1]!.fields).toMatchObject({ kind: 'page', text: 'Pourquoi les villes ralentissent', trashedAt: null, deletedAt: null });

    const blocks = childrenOf(pageId);
    expect(blocks.map(block => block.fields.kind)).toEqual(['bookmark', 'text', 'text', 'image', 'text', 'h2', 'text', 'bullet', 'bullet', 'callout', 'code']);
    expect(blocks[0]!.fields).toMatchObject({ targetType: 'link', targetId: LINK });
    // The day as a date: each device writes it in its own language.
    expect(blocks[1]!.fields.text).toBe('{i:Claire Martin · }{@date=2026-10-14}');
    expect(blocks[2]!.fields.text).toContain('{i:lubie}');
    expect(blocks[4]!.fields.text).toBe('{i:Une rue scolaire à Lyon.}');
    expect(blocks[6]!.fields.text).toContain('{b:les enfants vont seuls}');
    expect(blocks[6]!.fields.text).toContain('revue.example/etude');
    expect(childrenOf(blocks[8]!.id).map(block => [block.fields.kind, block.fields.text])).toEqual([['bullet', 'aux heures d’entrée']]);
    expect(blocks[10]!.fields).toMatchObject({ kind: 'code', text: 'print("ok")', language: 'python' });
    const picture = blocks[3]!.fields;
    expect(picture).toMatchObject({ mime: 'image/webp', uploaded: true });
    expect(server.blobs.get(picture.fileId as string)).toMatchObject({ source: 'link' });
    const words = JSON.stringify(blocks.map(block => block.fields.text));
    for (const chrome of ['Accueil', 'Partager', 'À lire aussi', 'mentions légales']) expect(words).not.toContain(chrome);

    // The link points at it, under the server's clock, and a device hears of everything in one pull.
    const link = server.records.get('link', LINK)!;
    expect(link.fields.copy).toBe(pageId);
    expect(link.clocks.copy).toMatch(/srvtest01$/);
    const pulled = await postSync(server, { node: 'web001', since: 0, types: ['note', 'check', 'link', 'label', 'attachment'] });
    expect(pulled.body.records.find((record: SyncRecord) => record.id === LINK).fields.copy).toBe(pageId);
    expect(pulled.body.records.some((record: SyncRecord) => record.type === 'block')).toBe(false);
  });

  it('takes the link’s own title when the app gives one', async () => {
    await withLink();
    const { body } = await ask({ title: 'Les villes lentes' });
    expect(server.records.get('block', body.pageId)!.fields.text).toBe('Les villes lentes');
  });

  it('joins a copy being made, and gives back the copy a link already has', async () => {
    const fetcher = await withLink();
    const [first, second] = await Promise.all([ask(), ask()]);
    expect(second.body.pageId).toBe(first.body.pageId);
    const reads = fetcher.urls().filter(url => url === ARTICLE).length;
    expect(reads).toBe(1);
    expect((await ask()).body.pageId).toBe(first.body.pageId);
    expect(fetcher.urls().filter(url => url === ARTICLE)).toHaveLength(1);
    expect(childrenOf(null)).toHaveLength(2);
  });

  it('makes a new copy once the one before went to the bin', async () => {
    await withLink();
    const first = (await ask()).body.pageId as string;
    server.sync.push([rec('block', first, { trashedAt: T0 + 1000 }, T0 + 1000)]);
    const second = (await ask()).body.pageId as string;
    expect(second).not.toBe(first);
    expect(server.records.get('link', LINK)!.fields.copy).toBe(second);
  });

  it('forgets the copy once the bin purges its page', async () => {
    await withLink();
    const pageId = (await ask()).body.pageId as string;
    const day = 86_400_000;
    server.sync.push([rec('block', pageId, { trashedAt: T0 + 1 }, T0 + 1)]);
    server.time.value = T0 + (TRASH_RETENTION_DAYS + 1) * day;
    await new Housekeeping({ db: server.db, sync: server.sync, records: server.records, blobs: server.blobs, apps: server.apps, now: server.now }).run();
    expect(server.records.get('block', pageId)!.fields.deletedAt).toBe(server.time.value);
    expect(server.records.get('link', LINK)!.fields.copy).toBeNull();
  });

  it('says so when the page cannot be read or holds no text, or the link has not reached the server', async () => {
    await withLink('<!doctype html><html><head><title>Vide</title></head><body><nav>Menu</nav></body></html>');
    expect(await ask()).toEqual({ status: 502, body: { error: 'No text to keep on this page' } });
    expect((await post('/api/pages/copies', { link: { id: LINK, url: 'https://ailleurs.example/' }, lang: 'fr' })).status).toBe(502);
    expect((await post('/api/pages/copies', { link: { id: LINK, url: 'pas une adresse' }, lang: 'fr' })).status).toBe(400);
    expect(await post('/api/pages/copies', { link: { id: 'not-here', url: ARTICLE }, lang: 'fr' })).toEqual({ status: 409, body: { error: 'This link has not reached the server yet: try again in a moment' } });
    expect(childrenOf(null)).toHaveLength(1);
  });

  it('keeps an article whatever the page’s own classes say of its layout, never its footer', async () => {
    const paragraph = (n: number) => `<p>Paragraphe ${n} de l’article, assez long pour compter comme du texte, avec des virgules, et encore un peu.</p>`;
    const page = `<!doctype html><html><head><title>Villes</title></head><body class="single right-sidebar"><form id="aspnetForm"><div class="content-sidebar-wrap"><main><article>${[1, 2, 3, 4].map(paragraph).join('')}</article></main><aside class="sidebar">${paragraph(9)}</aside></div></form><footer><div>${[7, 8, 9, 10, 11].map(paragraph).join('')}</div></footer></body></html>`;
    await withLink(page);
    const { status, body } = await ask();
    expect(status).toBe(200);
    // No byline nor date on the page: the card, then the article alone.
    expect(childrenOf(body.pageId).map(block => String(block.fields.text).slice(0, 12))).toEqual(['', 'Paragraphe 1', 'Paragraphe 2', 'Paragraphe 3', 'Paragraphe 4']);
  });

  it('answers 404 while Pages is off', async () => {
    await withLink();
    expect((await putSettings(server, { apps: ['notes'] })).status).toBe(200);
    expect(await ask()).toEqual({ status: 404, body: { error: 'Pages n’est pas activé sur ce serveur' } });
    expect(server.records.get('link', LINK)!.fields.copy).toBeUndefined();
  });
});

