import { afterEach, describe, expect, it } from 'vitest';
import type { PagesAskRequest } from '@unlease/notes/sync/pagesAsk';
import { AUTH, claudeMessage, createTestServer, type TestServer } from './helpers';

let server: TestServer;
afterEach(() => server.close());

async function send(method: 'POST' | 'PUT' | 'GET', path: string, body?: unknown) {
  const response = await server.app.request(path, { method, headers: { ...AUTH, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

const trip: PagesAskRequest = {
  scope: 'tree',
  question: 'Quand est-ce que je pars ?',
  history: [],
  web: false,
  lang: 'fr',
  pages: [
    { id: 'p1', path: 'Voyages › Lisbonne', blocks: [{ id: 'b1', text: '# Lisbonne' }, { id: 'b2', text: 'Départ le 3 mai, retour le 10.' }, { id: 'b3', text: '- [ ] Réserver le train' }] },
    { id: 'p2', path: 'Voyages › Lisbonne › Hôtels', blocks: [{ id: 'b4', text: 'Hôtel près de l’Alfama' }] },
  ],
};

const turnOn = (pages: Record<string, unknown> = {}) => send('PUT', '/api/settings', { pages: { enabled: true, ...pages } });

/** An answer citing the second block of the first page twice, and the hotel once. */
const cited = claudeMessage('', {
  content: [
    { type: 'thinking', thinking: '', signature: 'sig' },
    {
      type: 'text',
      text: 'Vous partez le 3 mai',
      citations: [{ type: 'search_result_location', source: 'carnet-page:p1', title: 'Voyages › Lisbonne', cited_text: 'Départ le 3 mai, retour le 10.', search_result_index: 0, start_block_index: 1, end_block_index: 2 }],
    },
    { type: 'text', text: ' et revenez le 10, ', citations: [{ type: 'search_result_location', source: 'carnet-page:p1', title: 'Voyages › Lisbonne', cited_text: 'Départ le 3 mai, retour le 10.', search_result_index: 0, start_block_index: 1, end_block_index: 2 }] },
    { type: 'text', text: 'depuis un hôtel près de l’Alfama.', citations: [{ type: 'search_result_location', source: 'carnet-page:p2', title: 'Hôtels', cited_text: 'Hôtel près de l’Alfama', search_result_index: 1, start_block_index: 0, end_block_index: 1 }] },
  ],
});

describe('POST /api/pages/ask', () => {
  it('is off until the Administration turns it on, and the switches are checked', async () => {
    server = createTestServer();
    expect((await send('GET', '/api/settings')).body.pages).toEqual({ enabled: false, everywhere: true, web: true, reach: 'medium' });
    const off = await send('POST', '/api/pages/ask', trip);
    expect(off).toEqual({ status: 409, body: { error: 'Les questions sur les pages sont désactivées dans l’administration' } });
    expect(server.claude.requests).toHaveLength(0);

    expect((await send('PUT', '/api/settings', { pages: { reach: 'huge' } })).status).toBe(400);
    expect((await send('PUT', '/api/settings', { pages: { enabled: 'yes' } })).status).toBe(400);
    expect((await turnOn({ web: false, reach: 'short' })).status).toBe(200);
    expect((await send('GET', '/api/settings')).body.pages).toEqual({ enabled: true, everywhere: true, web: false, reach: 'short' });
  });

  it('sends each page as a search result and maps Claude’s citations back to the blocks', async () => {
    server = createTestServer();
    await turnOn();
    server.claude.reply(cited);
    const { status, body } = await send('POST', '/api/pages/ask', trip);
    expect(status).toBe(200);
    expect(body).toEqual({
      parts: [
        { text: 'Vous partez le 3 mai', cites: [0] },
        { text: ' et revenez le 10, ', cites: [0] },
        { text: 'depuis un hôtel près de l’Alfama.', cites: [1] },
      ],
      citations: [
        { pageId: 'p1', blockIds: ['b2'], quote: 'Départ le 3 mai, retour le 10.' },
        { pageId: 'p2', blockIds: ['b4'], quote: 'Hôtel près de l’Alfama' },
      ],
      sources: [],
    });
    const request = server.claude.requests[0]!;
    expect(request).not.toHaveProperty('tools');
    const content = request.messages[0]!.content as any[];
    expect(content[0]).toEqual({
      type: 'search_result',
      source: 'carnet-page:p1',
      title: 'Voyages › Lisbonne',
      content: [
        { type: 'text', text: '# Lisbonne' },
        { type: 'text', text: 'Départ le 3 mai, retour le 10.' },
        { type: 'text', text: '- [ ] Réserver le train' },
      ],
      citations: { enabled: true },
    });
    // The pages are cached for the follow-ups.
    expect(content[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(server.claude.userText()).toBe('Web: no.\nLanguage: French.\n<question>\nQuand est-ce que je pars ?\n</question>');
    expect(server.db.prepare('SELECT task, ok, result FROM analyses').all()).toEqual([{ task: 'pages', ok: 1, result: null }]);
  });

  it('carries the conversation, the web said with the last question only', async () => {
    server = createTestServer();
    await turnOn();
    server.claude.reply(claudeMessage('Le 10 mai.'));
    const { body } = await send('POST', '/api/pages/ask', { ...trip, web: true, lang: 'en', question: 'And back?', history: [{ question: 'When do I leave?', answer: 'On 3 May.' }] });
    expect(body.parts).toEqual([{ text: 'Le 10 mai.', cites: [] }]);
    const request = server.claude.requests[0]!;
    expect(request.messages.map(message => message.role)).toEqual(['user', 'assistant', 'user']);
    expect(server.claude.userText()).toContain('Language: English.\n<question>\nWhen do I leave?\n</question>');
    expect(server.claude.userText()).not.toContain('Web:');
    expect(request.messages[1]!.content).toEqual([{ type: 'text', text: 'On 3 May.' }]);
    expect(request.messages[2]!.content).toEqual([{ type: 'text', text: 'Web: yes.\n<question>\nAnd back?\n</question>' }]);
    expect((request.tools ?? []).map(tool => ('name' in tool ? tool.name : tool.type))).toEqual(['web_search']);
  });

  it('holds each question to what the Administration allows', async () => {
    server = createTestServer();
    await turnOn({ everywhere: false, web: false, reach: 'short' });
    expect((await send('POST', '/api/pages/ask', { ...trip, scope: 'all' })).body.error).toBe('Les questions sur toutes les pages sont désactivées dans l’administration');
    const long = { ...trip, pages: [{ id: 'p1', path: 'Long', blocks: Array.from({ length: 6 }, (_, at) => ({ id: `b${at}`, text: 'x'.repeat(7000) })) }] };
    expect((await send('POST', '/api/pages/ask', long)).body.error).toBe('Ces pages sont trop longues pour une question : choisissez moins de pages');
    expect(server.claude.requests).toHaveLength(0);
    // The web asked for while the Administration forbids it: answered without.
    server.claude.reply(claudeMessage('Le 3 mai.'));
    expect((await send('POST', '/api/pages/ask', { ...trip, web: true })).status).toBe(200);
    expect(server.claude.requests[0]).not.toHaveProperty('tools');
  });

  it('refuses a malformed question, and asks nothing without a key', async () => {
    server = createTestServer({ envApiKey: null });
    await turnOn();
    expect((await send('POST', '/api/pages/ask', { ...trip, question: '  ' })).status).toBe(400);
    expect((await send('POST', '/api/pages/ask', { ...trip, scope: 'everything' })).status).toBe(400);
    expect((await send('POST', '/api/pages/ask', { ...trip, pages: [{ id: 'bad id!', path: '', blocks: [] }] })).status).toBe(400);
    expect((await send('POST', '/api/pages/ask', trip)).body.error).toBe('Claude n’a pas de clé : ajoutez-en une dans l’administration.');
  });
});
