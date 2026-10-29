import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { afterEach, describe, expect, it } from 'vitest';
import type { LinkBrief } from '@unlease/notes/sync/brief';
import { AUTH, claudeMessage, createTestServer, FakeFetcher, type TestServer } from './helpers';

const film: LinkBrief = { id: 'f1', url: 'https://www.allocine.fr/film/fichefilm_gen_cfilm=246099.html', title: 'Dune', site: 'AlloCiné', kind: 'film', price: null, currency: null, facts: ['Année : 2021', 'Réalisateur : Denis Villeneuve'], summary: '' };
const series: LinkBrief = { id: 's1', url: 'https://www.imdb.com/title/tt0903747/', title: 'Breaking Bad', site: 'IMDb', kind: 'series', price: null, currency: null, facts: ['Années : 2008-2013'], summary: '' };
const ARTICLE = 'https://revue.example/villes-lentes';
const article: LinkBrief = { id: 'a1', url: ARTICLE, title: 'Pourquoi les villes ralentissent', site: 'La Revue urbaine', kind: 'article', price: null, currency: null, facts: [], summary: 'La ville passe à 30 km/h.' };

/** An answer as web search gives it: a search and its results, then the JSON. */
function searchMessage(answer: unknown): BetaMessage {
  const base = claudeMessage('');
  return claudeMessage('', {
    content: [
      { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'x' } },
      { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [] },
      { type: 'text', text: JSON.stringify(answer), citations: null },
    ],
    usage: { ...base.usage, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } },
  });
}

let server: TestServer;
afterEach(() => server.close());

async function send(method: 'POST' | 'PUT', path: string, body: unknown) {
  const response = await server.app.request(path, { method, headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}
const post = (path: string, body: unknown) => send('POST', path, body);

const tasks = () => server.db.prepare('SELECT task, ok FROM analyses ORDER BY id').all();
const toolNames = () => (server.claude.requests[0]!.tools ?? []).map(tool => ('name' in tool ? tool.name : tool.type));
const html = (body: string) => ({ headers: { 'content-type': 'text/html; charset=utf-8' }, body });

describe('POST /api/ratings', () => {
  it('finds a work’s ratings, leaves out those that do not hold, and keeps them a week', async () => {
    server = createTestServer();
    server.claude.reply(
      searchMessage({
        work: 'Dune (2021)',
        ratings: [
          { source: 'IMDb', label: '', value: 8.0, scale: 10, count: '900 000 votes', url: 'https://www.imdb.com/title/tt1160419/' },
          { source: 'Rotten Tomatoes', label: 'Critiques', value: 83, scale: 100, count: '', url: null },
          { source: 'Ailleurs', label: '', value: 12, scale: 10, count: '', url: null },
        ],
      }),
    );
    const first = await post('/api/ratings', { link: film, lang: 'fr', fresh: false });
    expect(first.status).toBe(200);
    expect(first.body.work).toBe('Dune (2021)');
    expect(first.body.ratings.map((rating: { source: string }) => rating.source)).toEqual(['IMDb', 'Rotten Tomatoes']);
    expect(server.claude.userText()).toContain('"kind":"film"');
    expect(server.claude.userText()).toContain('Réalisateur : Denis Villeneuve');

    server.time.value += 6 * 86_400_000;
    expect((await post('/api/ratings', { link: film, lang: 'fr', fresh: false })).body).toEqual(first.body);
    expect(server.claude.requests).toHaveLength(1);
    expect(tasks()).toEqual([{ task: 'ratings', ok: 1 }]);
  });
});

describe('POST /api/recap', () => {
  it('recaps up to the episode asked, each stop its own answer', async () => {
    server = createTestServer();
    server.claude.reply(
      searchMessage({ recap: 'Saison 1.\n\n\nSaison 2,   jusqu’ici.', characters: [{ name: 'Walter', note: 'Il cache tout à sa famille.' }, { name: '', note: 'Personne' }], stop: 'Fin de l’épisode 5 de la saison 2.' }),
      searchMessage({ recap: 'La saison 1 seulement.', characters: [], stop: 'Fin de la saison 1.' }),
    );
    const partWay = await post('/api/recap', { link: series, season: 2, episode: 5, lang: 'fr', fresh: false });
    expect(partWay.body).toMatchObject({ recap: 'Saison 1.\n\nSaison 2, jusqu’ici.', characters: [{ name: 'Walter', note: 'Il cache tout à sa famille.' }], stop: 'Fin de l’épisode 5 de la saison 2.' });
    expect(server.claude.userText()).toContain('Watched up to: season 2, episode 5.');

    const wholeSeason = await post('/api/recap', { link: series, season: 1, episode: null, lang: 'fr', fresh: false });
    expect(wholeSeason.body.recap).toBe('La saison 1 seulement.');
    expect(server.claude.userText(1)).toContain('Watched up to: season 1, the whole season.');

    expect((await post('/api/recap', { link: series, season: 2, episode: 5, lang: 'fr', fresh: false })).body).toEqual(partWay.body);
    expect(server.claude.requests).toHaveLength(2);
    expect((await post('/api/recap', { link: series, season: 0, episode: null, lang: 'fr', fresh: false })).status).toBe(400);
  });

  it('says so when Claude writes no recap', async () => {
    server = createTestServer();
    server.claude.reply(searchMessage({ recap: '', characters: [], stop: '' }));
    const { status, body } = await post('/api/recap', { link: series, season: 1, episode: 2, lang: 'fr', fresh: false });
    expect(status).toBe(502);
    expect(body.error).toBe('Réponse de Claude illisible');
    expect(tasks()).toEqual([{ task: 'recap', ok: 0 }]);
  });
});

describe('POST /api/coverage', () => {
  it('lists other outlets with their angle, never one without, never a bad address or date', async () => {
    server = createTestServer();
    server.claude.reply(
      searchMessage({
        story: 'La ville passe à 30 km/h.',
        outlets: [
          { outlet: 'Le Monde', title: 'Paris ralentit', url: 'https://www.lemonde.fr/a', date: '2026-10-14', angle: 'Sous l’angle de la sécurité', adds: 'Les chiffres des accidents.' },
          { outlet: 'Sans angle', title: 'x', url: 'https://x.example/', date: null, angle: '', adds: '' },
          { outlet: 'BBC News', title: 'Paris slows down', url: 'javascript:alert(1)', date: '2026-02-30', angle: 'Vu de Londres', adds: '' },
        ],
        note: '',
      }),
    );
    const { status, body } = await post('/api/coverage', { link: article, lang: 'fr', fresh: false });
    expect(status).toBe(200);
    expect(body.outlets).toEqual([
      { outlet: 'Le Monde', title: 'Paris ralentit', url: 'https://www.lemonde.fr/a', date: '2026-10-14', angle: 'Sous l’angle de la sécurité', adds: 'Les chiffres des accidents.' },
      { outlet: 'BBC News', title: 'Paris slows down', url: null, date: null, angle: 'Vu de Londres', adds: '' },
    ]);
    expect(server.claude.userText()).toContain('"summary":"La ville passe à 30 km/h."');
  });
});

const articlePage = `<!doctype html><html><head><title>Pourquoi les villes ralentissent</title></head><body>
<article><h1>Pourquoi les villes ralentissent</h1>
<p>La mairie ouvre une nouvelle piste cyclable le long du fleuve, après des années de débats entre riverains.</p>
<p>Les travaux ont duré trois mois, selon les services de la ville, et ont coûté deux millions d’euros.</p>
</article><footer><p>Tous droits réservés, La Revue urbaine, depuis toujours et pour longtemps.</p></footer></body></html>`;
const question = { link: article, question: 'Combien de temps ont duré les travaux ?', web: false, lang: 'fr' };

describe('POST /api/ask', () => {
  it('answers from the page, without the web unless asked, the same question asked twice at once asked once', async () => {
    server = createTestServer({ fetcher: new FakeFetcher({ [ARTICLE]: html(articlePage) }) });
    server.claude.reply(claudeMessage('Trois mois.\n\nSelon les services de la ville.'));
    const [one, two] = await Promise.all([post('/api/ask', question), post('/api/ask', question)]);
    expect(one).toEqual({ status: 200, body: { answer: 'Trois mois.\n\nSelon les services de la ville.', sources: [] } });
    expect(two).toEqual(one);
    expect(server.claude.requests).toHaveLength(1);
    expect(server.claude.requests[0]).not.toHaveProperty('tools');
    const text = server.claude.userText();
    expect(text).toContain('Web: no.');
    expect(text).toContain('<question>\nCombien de temps ont duré les travaux ?\n</question>');
    expect(text).toContain('Les travaux ont duré trois mois');
    expect(text).not.toContain('Tous droits réservés');
    // Asked, answered, and nothing of it kept.
    expect(server.db.prepare('SELECT task, ok, result FROM analyses').all()).toEqual([{ task: 'ask', ok: 1, result: null }]);
  });

  it('searches the web when ticked, and lists the pages it cites', async () => {
    server = createTestServer({ fetcher: new FakeFetcher({ [ARTICLE]: html(articlePage) }) });
    server.claude.reply(
      claudeMessage('', {
        content: [
          { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'piste cyclable' } },
          { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [] },
          { type: 'text', text: 'Oui, ', citations: null },
          {
            type: 'text',
            text: 'depuis 2024.',
            citations: [
              { type: 'web_search_result_location', url: 'https://source.example/a', title: 'Source A', cited_text: '…', encrypted_index: 'x' },
              { type: 'web_search_result_location', url: ARTICLE, title: 'Lui-même', cited_text: '…', encrypted_index: 'y' },
              { type: 'web_search_result_location', url: 'https://source.example/a', title: 'Source A', cited_text: '…', encrypted_index: 'z' },
            ],
          },
        ],
      }),
    );
    const { body } = await post('/api/ask', { ...question, web: true });
    expect(body).toEqual({ answer: 'Oui, depuis 2024.', sources: [{ title: 'Source A', url: 'https://source.example/a' }] });
    expect(toolNames()).toEqual(['web_search']);
    expect(server.claude.userText()).toContain('Web: yes.');
  });

  it('never pays Claude to find a page gone, unless the web may answer', async () => {
    server = createTestServer({ fetcher: new FakeFetcher({}) });
    const refused = await post('/api/ask', question);
    expect(refused.status).toBe(502);
    expect(server.claude.requests).toHaveLength(0);

    server.claude.reply(claudeMessage('D’après le web, trois mois.'));
    expect((await post('/api/ask', { ...question, web: true })).body.answer).toBe('D’après le web, trois mois.');
    expect(toolNames()).toEqual(['web_search']);
    expect(server.claude.userText()).toContain('The page cannot be read any more');
  });

  it('refuses an empty question, and asks nothing without a key', async () => {
    server = createTestServer({ envApiKey: null });
    expect((await post('/api/ask', { ...question, question: '   ' })).status).toBe(400);
    expect((await post('/api/ask', question)).status).toBe(409);
  });
});

/** Seerr as the server reaches it: its status for anyone, the rest for its key. */
function fakeSeerr(results: unknown[], key = 'seerr-key-123456') {
  const calls: { url: string; key: string | null }[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, key: headers.get('x-api-key') });
    const path = new URL(url).pathname;
    if (path === '/api/v1/status') return Response.json({ version: '2.7.3', commitTag: 'v2.7.3' });
    if (headers.get('x-api-key') !== key) return Response.json({ message: 'Unauthorized' }, { status: 403 });
    if (path === '/api/v1/auth/me') return Response.json({ id: 1 });
    if (path === '/api/v1/search') return Response.json({ page: 1, totalPages: 1, totalResults: results.length, results });
    return new Response('Not found', { status: 404 });
  }) as typeof fetch;
  return { fetcher, calls };
}

describe('Seerr', () => {
  it('is linked from the Administration once its address and its key answer, the key never sent back', async () => {
    const seerr = fakeSeerr([]);
    server = createTestServer({ seerrFetch: seerr.fetcher });
    expect(await send('PUT', '/api/settings', { seerr: { url: 'https://seerr.example/', apiKey: 'wrong-key-1234' } })).toEqual({ status: 400, body: { error: 'Clé API refusée par Seerr' } });
    expect((await send('PUT', '/api/settings', { seerr: { url: 'ftp://seerr.example' } })).status).toBe(400);
    const saved = await send('PUT', '/api/settings', { seerr: { url: 'https://seerr.example/', apiKey: 'seerr-key-123456' } });
    expect(saved.status).toBe(200);
    expect(saved.body.seerr).toEqual({ url: 'https://seerr.example', keyHint: '…3456' });
    expect(JSON.stringify(saved.body)).not.toContain('seerr-key-123456');
    // Without its key, Seerr is only searched.
    expect((await send('PUT', '/api/settings', { seerr: { apiKey: '' } })).body.seerr).toEqual({ url: 'https://seerr.example', keyHint: null });
    expect((await send('PUT', '/api/settings', { seerr: null })).body.seerr).toEqual({ url: '', keyHint: null });
  });

  it('never sends its key to an address not yet known as Seerr, and drops it without asking Seerr', async () => {
    const seerr = fakeSeerr([]);
    server = createTestServer({ seerrFetch: seerr.fetcher });
    expect((await send('PUT', '/api/settings', { seerr: { url: 'https://seerr.example', apiKey: 'seerr-key-123456' } })).status).toBe(200);
    seerr.calls.length = 0;
    expect((await send('PUT', '/api/settings', { seerr: { url: 'https://seerr.lan.example' } })).status).toBe(200);
    expect(seerr.calls).toEqual([
      { url: 'https://seerr.lan.example/api/v1/status', key: null },
      { url: 'https://seerr.lan.example/api/v1/auth/me', key: 'seerr-key-123456' },
    ]);
    seerr.calls.length = 0;
    expect((await send('PUT', '/api/settings', { seerr: { apiKey: '' } })).body.seerr).toEqual({ url: 'https://seerr.lan.example', keyHint: null });
    expect(seerr.calls).toEqual([]);
  });

  it('refuses an address that does not answer as Seerr', async () => {
    server = createTestServer();
    expect(await send('PUT', '/api/settings', { seerr: { url: 'https://seerr.example' } })).toEqual({ status: 502, body: { error: 'Seerr injoignable' } });
    server.close();
    server = createTestServer({ seerrFetch: (async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch });
    expect(await send('PUT', '/api/settings', { seerr: { url: 'https://seerr.example' } })).toEqual({ status: 400, body: { error: 'Cette adresse ne répond pas comme un serveur Seerr' } });
  });

  it('finds the film in Seerr with its key, its year telling namesakes apart, else gives Seerr’s search', async () => {
    const seerr = fakeSeerr([
      { id: 90, mediaType: 'tv', name: 'Dune', firstAirDate: '2000-12-03' },
      { id: 438631, mediaType: 'movie', title: 'Dune', releaseDate: '2021-09-15', mediaInfo: { status: 5 } },
      { id: 841, mediaType: 'movie', title: 'Dune', releaseDate: '1984-12-14' },
    ]);
    server = createTestServer({ seerrFetch: seerr.fetcher });
    expect((await post('/api/seerr', { link: film })).status).toBe(409);

    server.settings.updateSeerr({ url: 'https://seerr.example', apiKey: 'seerr-key-123456' });
    expect((await post('/api/seerr', { link: film })).body).toEqual({ url: 'https://seerr.example/movie/438631', status: 'available', title: 'Dune (2021)' });
    expect(seerr.calls.at(-1)).toEqual({ url: 'https://seerr.example/api/v1/search?query=Dune&page=1', key: 'seerr-key-123456' });
    expect((await post('/api/seerr', { link: { ...film, facts: ['Année : 1984'] } })).body).toEqual({ url: 'https://seerr.example/movie/841', status: 'missing', title: 'Dune (1984)' });
    expect((await post('/api/seerr', { link: { ...film, kind: 'series', facts: [] } })).body).toEqual({ url: 'https://seerr.example/tv/90', status: 'missing', title: 'Dune (2000)' });

    server.settings.updateSeerr({ apiKey: '' });
    expect((await post('/api/seerr', { link: { ...film, title: 'L’Étranger (1967)' } })).body).toEqual({ url: 'https://seerr.example/search?query=L%E2%80%99%C3%89tranger%20%281967%29', status: null, title: '' });
  });
});
