import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INBOX_ID } from '@unlease/notes/models/entities';
import type { SortLink, SortRequest, SortTarget } from '@unlease/notes/sync/sorting';
import { AUTH, claudeMessage, createTestServer, type TestServer } from './helpers';

const mode: SortTarget = { id: 'mode', title: 'Mode', hint: 'Vêtements, chaussures et accessoires', examples: ['Jupe plissée'] };
const films: SortTarget = { id: 'films', title: 'Films', hint: '', examples: [] };
const recettes: SortTarget = { id: 'recettes', title: 'Recettes', hint: 'Plats à cuisiner', examples: [] };

function link(id: string, title: string, extra: Partial<SortLink> = {}): SortLink {
  return { id, url: `https://example.fr/${id}`, title, site: 'Exemple', kind: 'other', summary: '', facts: [], ...extra };
}

let server: TestServer;

beforeEach(() => {
  server = createTestServer();
});
afterEach(() => server.close());

async function postSort(body: unknown) {
  const response = await server.app.request('/api/sort', {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

const fileRequest: SortRequest = {
  task: 'file',
  from: null,
  targets: [mode, films],
  links: [
    link('l1', 'Veste en jean', { kind: 'product', summary: 'Veste en jean oversize.', facts: ['Couleur : Bleu'] }),
    link('l2', 'La Grande Évasion', { kind: 'film' }),
    link('l3', 'Un article sans rapport', { kind: 'article' }),
  ],
};

describe('POST /api/sort, filing', () => {
  it('answers Claude’s moves by id, from one cached, structured call', async () => {
    server.claude.reply(claudeMessage({ moves: [{ link: 1, to: 1 }, { link: 2, to: 2 }] }));
    const { status, body } = await postSort(fileRequest);

    expect(status).toBe(200);
    expect(body).toEqual({ moves: [{ link: 'l1', to: 'mode' }, { link: 'l2', to: 'films' }] });
    expect(server.claude.requests).toHaveLength(1);
    const request = server.claude.requests[0]!;
    expect(request).toMatchObject({
      model: 'claude-opus-5-5',
      output_config: { effort: 'low', format: { type: 'json_schema' } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    expect(request).not.toHaveProperty('thinking');
    expect(request.system).toEqual([expect.objectContaining({ type: 'text', cache_control: { type: 'ephemeral' } })]);
    const text = server.claude.userText();
    expect(text).toContain('Task: file.');
    expect(text).toContain('1. {"title":"Mode","description":"Vêtements, chaussures et accessoires","examples":["Jupe plissée"]}');
    expect(text).toContain('2. {"title":"Films"}');
    expect(text).toContain('1. {"title":"Veste en jean","site":"Exemple","kind":"product","summary":"Veste en jean oversize.","facts":["Couleur : Bleu"],"url":"https://example.fr/l1"}');
    expect(text).not.toContain('Non classé');
  });

  it('drops numbers it never sent, a second move of a link, and "Non classé" outside a review', async () => {
    server.claude.reply(claudeMessage({ moves: [{ link: 1, to: 2 }, { link: 1, to: 1 }, { link: 9, to: 1 }, { link: 2, to: 7 }, { link: 3, to: 0 }] }));
    const { body } = await postSort(fileRequest);
    expect(body.moves).toEqual([{ link: 'l1', to: 'films' }]);
  });

  it('sends a long list in batches and puts their answers together', async () => {
    const links = Array.from({ length: 130 }, (_, index) => link(`l${index}`, `Lien ${index}`));
    server.claude.reply(
      claudeMessage({ moves: [{ link: 1, to: 1 }] }),
      claudeMessage({ moves: [{ link: 60, to: 2 }] }),
      claudeMessage({ moves: [{ link: 10, to: 1 }] }),
    );
    const { status, body } = await postSort({ ...fileRequest, links });

    expect(status).toBe(200);
    expect(server.claude.requests).toHaveLength(3);
    expect(body.moves).toEqual(expect.arrayContaining([{ link: 'l0', to: 'mode' }, { link: 'l129', to: 'mode' }]));
    expect(body.moves).toHaveLength(3);
  });

  it('keeps the moves of the batches that answered when one fails, and starts no batch after it', async () => {
    const links = Array.from({ length: 200 }, (_, index) => link(`l${index}`, `Lien ${index}`));
    server.claude.reply(
      claudeMessage({ moves: [] }, { stop_reason: 'refusal' }),
      claudeMessage({ moves: [{ link: 1, to: 1 }] }),
      claudeMessage({ moves: [{ link: 2, to: 2 }] }),
    );
    const { status, body } = await postSort({ ...fileRequest, links });

    expect(status).toBe(200);
    expect(server.claude.requests).toHaveLength(3);
    expect(body).toEqual({ moves: [{ link: 'l60', to: 'mode' }, { link: 'l121', to: 'films' }], incomplete: 'Tri refusé par Claude' });
  });

  it('starts no batch once the month’s budget is spent', async () => {
    server.settings.update({ budgetUsd: 0.02 });
    const links = Array.from({ length: 200 }, (_, index) => link(`l${index}`, `Lien ${index}`));
    server.claude.reply(claudeMessage({ moves: [] }), claudeMessage({ moves: [] }), claudeMessage({ moves: [{ link: 1, to: 1 }] }));
    const { status, body } = await postSort({ ...fileRequest, links });

    expect(status).toBe(200);
    expect(server.claude.requests).toHaveLength(3);
    expect(body).toEqual({ moves: [{ link: 'l120', to: 'mode' }], incomplete: 'Budget mensuel atteint' });
  });

  it('bills each call to the month without counting it as a link read', async () => {
    server.claude.reply(claudeMessage({ moves: [] }));
    await postSort(fileRequest);

    const usage = (await (await server.app.request('/api/usage', { headers: AUTH })).json()) as { monthToDate: unknown };
    const cost = (3000 * 4 + 500 * 20 + 1500 * 0.2) / 1e6;
    expect(usage.monthToDate).toEqual({ analyses: 0, inputTokens: 4500, outputTokens: 500, costUsd: Number(cost.toFixed(4)) });
    expect(server.db.prepare('SELECT task, link_id, ok FROM analyses').all()).toEqual([{ task: 'sort', link_id: '', ok: 1 }]);
  });
});

describe('POST /api/sort, reviewing a collection', () => {
  const reviewRequest: SortRequest = {
    task: 'review',
    from: 'mode',
    targets: [{ ...mode, examples: [] }, films, recettes],
    links: [link('l1', 'Veste en jean', { kind: 'product' }), link('l2', 'Tarte aux poireaux', { kind: 'recipe' }), link('l3', 'Un podcast', { kind: 'music' })],
  };

  it('names the current collection, offers "Non classé" as 0, and drops moves to where a link already is', async () => {
    server.claude.reply(claudeMessage({ moves: [{ link: 1, to: 1 }, { link: 2, to: 3 }, { link: 3, to: 0 }] }));
    const { status, body } = await postSort(reviewRequest);

    expect(status).toBe(200);
    expect(body.moves).toEqual([{ link: 'l2', to: 'recettes' }, { link: 'l3', to: INBOX_ID }]);
    const text = server.claude.userText();
    expect(text).toContain('Task: review. The links all sit in collection 1 ("Mode"), the current one.');
    expect(text).toContain('0. {"title":"Non classé","description":"For links that fit no collection."}');
  });

  it('refuses a review whose collection is not among the targets', async () => {
    const { status, body } = await postSort({ ...reviewRequest, from: 'ailleurs' });
    expect(status).toBe(400);
    expect(body.error).toBe('Requête de tri invalide');
    expect(server.claude.requests).toHaveLength(0);
  });
});

describe('POST /api/sort, refusals', () => {
  it('refuses a malformed request without asking Claude', async () => {
    for (const body of ['pas du json', { task: 'file', targets: [mode], links: [] }, { task: 'ranger', targets: [mode], links: [link('l1', 'x')] }, { task: 'file', targets: [{ id: INBOX_ID, title: 'Non classé' }], links: [link('l1', 'x')] }]) {
      const { status } = await postSort(body);
      expect(status).toBe(400);
    }
    expect(server.claude.requests).toHaveLength(0);
  });

  it('says so in French when no key is set', async () => {
    server.close();
    server = createTestServer({ envApiKey: null });
    const { status, body } = await postSort(fileRequest);
    expect(status).toBe(409);
    expect(body.error).toBe('Claude ne lit pas les liens : ajoutez une clé dans l’administration.');
  });

  it('stops at the monthly budget', async () => {
    server.settings.update({ budgetUsd: 0 });
    const { status, body } = await postSort(fileRequest);
    expect(status).toBe(409);
    expect(body.error).toBe('Budget mensuel atteint');
    expect(server.claude.requests).toHaveLength(0);
  });

  it('passes Claude’s failure on in French, and bills what it cost', async () => {
    server.claude.reply(claudeMessage({ moves: [] }, { stop_reason: 'refusal' }));
    const { status, body } = await postSort(fileRequest);
    expect(status).toBe(502);
    expect(body.error).toBe('Tri refusé par Claude');
    expect(server.db.prepare('SELECT task, ok, error FROM analyses').all()).toEqual([{ task: 'sort', ok: 0, error: 'Tri refusé par Claude' }]);
  });

  it('retries once when Claude is overloaded', async () => {
    const overloaded = new Anthropic.InternalServerError(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 'Overloaded', new Headers());
    server.claude.reply(overloaded, claudeMessage({ moves: [{ link: 2, to: 2 }] }));
    const { status, body } = await postSort(fileRequest);
    expect(status).toBe(200);
    expect(body.moves).toEqual([{ link: 'l2', to: 'films' }]);
  });
});
