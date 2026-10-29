import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseServerSettings, type ServerSettings } from '@unlease/core/sync/settings';
import { LinkModelProvider } from '../src/apps/notes/analysis/provider';
import { setLogLevel } from '../src/log';
import { SettingsStore } from '../src/settings/store';
import type { ListModels } from '../src/settings/update';
import {
  analysisOf,
  AUTH,
  claudeMessage,
  createTestServer,
  ENV_KEY,
  FakeClaude,
  FakeFetcher,
  fixture,
  pendingLink,
  T0,
  type TestServer,
} from './helpers';

const APP_KEY = 'sk-ant-api03-app-set-key-k3Xq';

const servers: TestServer[] = [];
function server(options: Parameters<typeof createTestServer>[0] = {}): TestServer {
  const created = createTestServer(options);
  servers.push(created);
  return created;
}
afterEach(() => {
  for (const created of servers.splice(0)) created.close();
});

/** A models call that accepts APP_KEY (and any key listed) and refuses the rest, recording what it was asked. */
function anthropic(accepted: readonly string[] = [APP_KEY]) {
  const asked: string[] = [];
  const listModels: ListModels = async apiKey => {
    asked.push(apiKey);
    if (!accepted.includes(apiKey)) throw new Anthropic.AuthenticationError(401, { type: 'error' }, 'invalid x-api-key', new Headers());
    return { data: [{ id: 'claude-opus-5-5' }] };
  };
  return { asked, listModels };
}

async function getSettings(target: TestServer): Promise<ServerSettings> {
  const response = await target.app.request('/api/settings', { headers: AUTH });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return (await response.json()) as ServerSettings;
}

async function putSettings(target: TestServer, body: unknown) {
  const response = await target.app.request('/api/settings', {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

describe('precedence: a value set from the apps, then the environment, then the default', () => {
  it('starts from the defaults, with reading off, when nothing is set', async () => {
    const target = server({ envApiKey: null });
    const settings = await getSettings(target);
    expect(settings.analysis).toEqual({ enabled: false, keySource: null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 });
    expect(settings.backup).toMatchObject({ configured: false, recurrence: 'off', keep: 30 });
    expect(settings.drive).toMatchObject({ provider: null, leaving: false });
  });

  it('uses the environment key when the apps set none, showing only its last characters', async () => {
    const settings = await getSettings(server());
    expect(settings.analysis).toEqual({ enabled: true, keySource: 'env', keyHint: '…0001', model: 'claude-opus-5-5', budgetUsd: 15 });
    expect(JSON.stringify(settings)).not.toContain(ENV_KEY);
    expect(parseServerSettings(settings)).toEqual(settings);
  });

  it('prefers what the apps set, and falls back to the environment key when the app key is removed', async () => {
    const { listModels } = anthropic();
    const target = server({ listModels });
    const set = await putSettings(target, { anthropicApiKey: APP_KEY, model: 'claude-haiku-5-5', budgetUsd: 4.5 });
    expect(set.status).toBe(200);
    expect(set.body.analysis).toEqual({ enabled: true, keySource: 'app', keyHint: '…k3Xq', model: 'claude-haiku-5-5', budgetUsd: 4.5 });
    expect(await getSettings(target)).toEqual(set.body);

    const removed = await putSettings(target, { anthropicApiKey: null });
    expect(removed.body.analysis).toEqual({ enabled: true, keySource: 'env', keyHint: '…0001', model: 'claude-haiku-5-5', budgetUsd: 4.5 });
  });

  it('turns reading off when the app key is removed and there is no environment key', async () => {
    const { listModels } = anthropic();
    const target = server({ envApiKey: null, listModels });
    await putSettings(target, { anthropicApiKey: APP_KEY });
    expect((await putSettings(target, { anthropicApiKey: null })).body.analysis).toMatchObject({ enabled: false, keySource: null, keyHint: null });
  });

  it('keeps app values across a restart (they live in the database)', async () => {
    const { listModels } = anthropic();
    const target = server({ listModels });
    await putSettings(target, { anthropicApiKey: APP_KEY, budgetUsd: 2 });
    const restarted = new SettingsStore(target.db, { apiKey: null, model: 'claude-sonnet-5-5', budgetUsd: 15 });
    expect(restarted.effective()).toEqual({ apiKey: APP_KEY, keySource: 'app', model: 'claude-sonnet-5-5', budgetUsd: 2 });
  });
});

describe('PUT /api/settings', () => {
  it('checks a new key with a free models call before storing it', async () => {
    const { asked, listModels } = anthropic();
    const target = server({ envApiKey: null, listModels });
    const response = await putSettings(target, { anthropicApiKey: `  ${APP_KEY}  ` });
    expect(response.status).toBe(200);
    expect(asked).toEqual([APP_KEY]);
    expect(target.settings.effective().apiKey).toBe(APP_KEY);
  });

  it('refuses a key Anthropic rejects (401 or 403) and stores nothing', async () => {
    const forbidden: ListModels = async () => {
      throw new Anthropic.PermissionDeniedError(403, { type: 'error' }, 'permission denied', new Headers());
    };
    for (const listModels of [anthropic([]).listModels, forbidden]) {
      const target = server({ envApiKey: null, listModels });
      const response = await putSettings(target, { anthropicApiKey: APP_KEY, budgetUsd: 3 });
      expect(response).toEqual({ status: 400, body: { error: 'Clé refusée par Anthropic' } });
      expect((await getSettings(target)).analysis).toMatchObject({ enabled: false, budgetUsd: 15 });
    }
  });

  it('says so when the key cannot be checked, and stores nothing', async () => {
    const offline: ListModels = async () => {
      throw new Anthropic.APIConnectionError({ message: 'getaddrinfo ENOTFOUND api.anthropic.com' });
    };
    const target = server({ envApiKey: null, listModels: offline });
    const response = await putSettings(target, { anthropicApiKey: APP_KEY });
    expect(response).toEqual({ status: 502, body: { error: 'Impossible de vérifier la clé auprès d’Anthropic' } });
    expect(target.settings.effective().apiKey).toBeNull();
  });

  it('refuses an unknown model, an invalid budget or a malformed key, before calling Anthropic', async () => {
    const { asked, listModels } = anthropic();
    const target = server({ listModels });
    const cases: [unknown, string][] = [
      [{ model: 'claude-opus-4-8' }, 'Modèle inconnu'],
      [{ model: null }, 'Modèle inconnu'],
      [{ budgetUsd: -1 }, 'Budget invalide'],
      [{ budgetUsd: '10' }, 'Budget invalide'],
      [{ budgetUsd: 1e9 }, 'Budget invalide'],
      [{ anthropicApiKey: '' }, 'Clé invalide'],
      [{ anthropicApiKey: 'sk ant with spaces' }, 'Clé invalide'],
      [{ anthropicApiKey: 42 }, 'Clé invalide'],
      [[], 'Requête invalide'],
      ['not json', 'Requête invalide'],
      // A valid key with a bad model: nothing is checked and nothing is stored.
      [{ anthropicApiKey: APP_KEY, model: 'gpt' }, 'Modèle inconnu'],
    ];
    for (const [body, error] of cases) {
      expect(await putSettings(target, body), JSON.stringify(body)).toEqual({ status: 400, body: { error } });
    }
    expect(asked).toEqual([]);
    expect(target.settings.effective()).toEqual({ apiKey: ENV_KEY, keySource: 'env', model: 'claude-opus-5-5', budgetUsd: 15 });
  });

  it('accepts a partial patch and an empty one', async () => {
    const target = server();
    expect((await putSettings(target, { budgetUsd: 0 })).body.analysis.budgetUsd).toBe(0);
    expect((await putSettings(target, {})).status).toBe(200);
    expect((await putSettings(target, { model: 'claude-sonnet-5-5' })).body.analysis).toMatchObject({ model: 'claude-sonnet-5-5', budgetUsd: 0 });
  });

  it('needs the token, like every route but health', async () => {
    const target = server();
    expect((await target.app.request('/api/settings')).status).toBe(401);
    expect((await target.app.request('/api/settings', { method: 'PUT', body: '{}' })).status).toBe(401);
  });

  it('never logs the key', async () => {
    const { listModels } = anthropic();
    const target = server({ listModels });
    const written: string[] = [];
    const capture = (chunk: unknown) => {
      written.push(String(chunk));
      return true;
    };
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
    setLogLevel('debug');
    try {
      await putSettings(target, { anthropicApiKey: APP_KEY });
      await putSettings(target, { anthropicApiKey: 'sk-ant-api03-refused-key-0000' });
    } finally {
      setLogLevel('silent');
      out.mockRestore();
      err.mockRestore();
    }
    expect(written.join('')).toContain('settings changed');
    expect(written.join('')).not.toContain(APP_KEY);
    expect(written.join('')).not.toContain('refused-key');
  });
});

describe('health and usage follow the live settings', () => {
  it('reports in /api/health whether links are read', async () => {
    const { listModels } = anthropic();
    const target = server({ envApiKey: null, listModels });
    const health = async () => ((await (await target.app.request('/api/health')).json()) as { analysis: boolean }).analysis;
    expect(await health()).toBe(false);
    await putSettings(target, { anthropicApiKey: APP_KEY });
    expect(await health()).toBe(true);
    await putSettings(target, { anthropicApiKey: null });
    expect(await health()).toBe(false);
  });

  it('reports the live model and budget in /api/usage', async () => {
    const target = server();
    await putSettings(target, { model: 'claude-haiku-5-5', budgetUsd: 3 });
    const usage = (await (await target.app.request('/api/usage', { headers: AUTH })).json()) as Record<string, unknown>;
    expect(usage).toMatchObject({ model: 'claude-haiku-5-5', budgetUsd: 3 });
  });
});

describe('the analysis reads the settings for every link', () => {
  const SHOP = 'https://www.maison-lucette.fr/fr/femme/vestes/veste-jean-oversize-delavee-p4512.html';
  const answer = {
    title: 'Veste en jean oversize délavée',
    site: 'Maison Lucette',
    kind: 'product',
    summary: 'Veste en jean.',
    price: null,
    attributes: [],
    imageIndex: null,
    listId: null,
    pageRead: true,
  };

  it('uses a model chosen in the apps for the next link, without a restart', async () => {
    const target = server();
    const claude = new FakeClaude().reply(claudeMessage(answer), claudeMessage(answer));
    const fetcher = new FakeFetcher({
      [SHOP]: { headers: { 'content-type': 'text/html' }, body: fixture('shop-product.html') },
      [`${SHOP}?taille=m`]: { headers: { 'content-type': 'text/html' }, body: fixture('shop-product.html') },
    });
    const { queue } = analysisOf(target, { fetcher, claude });
    target.sync.push([pendingLink('l1', SHOP, T0 - 1000)]);
    await queue.idle();
    await putSettings(target, { model: 'claude-haiku-5-5' });
    target.sync.push([pendingLink('l2', `${SHOP}?taille=m`, T0 - 900)]);
    await queue.idle();

    expect(claude.requests.map(request => request.model)).toEqual(['claude-opus-5-5', 'claude-haiku-5-5']);
    expect(claude.requests[0]).toHaveProperty('fallbacks', 'default');
    expect(claude.requests[1]).not.toHaveProperty('fallbacks');
  });

  it('builds the Claude client once per key, and again when the key changes', () => {
    const target = server({ envApiKey: null });
    const built: string[] = [];
    const provider = new LinkModelProvider(target.settings, {
      effort: 'low',
      createApi: apiKey => {
        built.push(apiKey);
        return new FakeClaude();
      },
    });
    expect(provider.current().model).toBeNull();
    target.settings.update({ apiKey: 'sk-ant-first-key-1111' });
    expect(provider.current().model?.model).toBe('claude-opus-5-5');
    provider.current();
    target.settings.update({ apiKey: 'sk-ant-second-key-2222', model: 'claude-sonnet-5-5' });
    expect(provider.current().model?.model).toBe('claude-sonnet-5-5');
    expect(built).toEqual(['sk-ant-first-key-1111', 'sk-ant-second-key-2222']);
    target.settings.update({ apiKey: null });
    expect(provider.current()).toEqual({ model: null, budgetUsd: 15 });
  });
});
