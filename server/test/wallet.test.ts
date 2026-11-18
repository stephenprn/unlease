import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_KDF, testCipher } from '@unlease/wallet/crypto/__tests__/testCipher';
import { createVault, ITEM_TYPE, VAULT_ID, VAULT_TYPE } from '@unlease/wallet/crypto/vault';
import { newItemFields } from '@unlease/wallet/sync/entities';
import { EMPTY_DETAILS } from '@unlease/wallet/models/item';
import { WALLET_READ_PATH, WALLET_VAULT_PATH, type VaultCreateResponse } from '@unlease/wallet/sync/routes';
import { walletRoutes } from '../src/apps/wallet/routes';
import type { Env } from '../src/apps/types';
import { AUTH, claudeMessage, createTestServer, rec, T0, type TestServer } from './helpers';

let server: TestServer;

afterEach(() => server.close());

/** Wallet's routes on their own, on a test's Hono: the server's gate is the suite test's. */
function routes(test: TestServer): Hono<Env> {
  const app = new Hono<Env>();
  walletRoutes(app, { sync: test.sync, records: test.records, reader: test.wallet.reader });
  return app;
}

const post = (app: Hono<Env>, path: string, body: unknown) => app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('Wallet on the server', () => {
  it('creates the vault once: a second device gets the first one’s', async () => {
    server = createTestServer();
    const app = routes(server);
    const first = await createVault(testCipher, 'one', T0, TEST_KDF);
    const second = await createVault(testCipher, 'two', T0, TEST_KDF);
    const a = (await (await post(app, WALLET_VAULT_PATH, { fields: first.fields })).json()) as VaultCreateResponse;
    const b = (await (await post(app, WALLET_VAULT_PATH, { fields: second.fields })).json()) as VaultCreateResponse;
    expect(a).toEqual({ created: true, fields: first.fields });
    expect(b).toEqual({ created: false, fields: first.fields });
    expect(server.records.get(VAULT_TYPE, VAULT_ID)!.fields.cards).toBe(first.fields.cards);
  });

  it('refuses a vault with a part missing or misshapen', async () => {
    server = createTestServer();
    const app = routes(server);
    const vault = await createVault(testCipher, 'one', T0, TEST_KDF);
    expect((await post(app, WALLET_VAULT_PATH, { fields: { ...vault.fields, cards: 'plain key' } })).status).toBe(400);
    expect((await post(app, WALLET_VAULT_PATH, { fields: { ...vault.fields, passphrase: '{}' } })).status).toBe(400);
    expect(server.records.get(VAULT_TYPE, VAULT_ID)).toBeUndefined();
  });

  it('keeps the vault’s tier keys when a push tries to change them, and takes a new passphrase', async () => {
    server = createTestServer();
    const vault = await createVault(testCipher, 'one', T0, TEST_KDF);
    await post(routes(server), WALLET_VAULT_PATH, { fields: vault.fields });
    const other = await createVault(testCipher, 'two', T0, TEST_KDF);
    server.sync.push([rec(VAULT_TYPE as never, VAULT_ID, { cards: other.fields.cards, passphrase: other.fields.passphrase }, T0 + 60_000)]);
    const stored = server.records.get(VAULT_TYPE, VAULT_ID)!.fields;
    expect(stored.cards).toBe(vault.fields.cards);
    expect(stored.passphrase).toBe(other.fields.passphrase);
  });

  it('keeps sealed items as they come, and files their blobs as opaque names', async () => {
    server = createTestServer();
    const vault = await createVault(testCipher, 'one', T0, TEST_KDF);
    const files = [{ id: 'f1', role: 'front' as const, mime: 'image/jpeg', name: 'passeport.jpg', width: 1, height: 1, bytes: 1, thumb: 't1' }];
    const { fields } = newItemFields(testCipher, vault.keys.papers, 'item1', { kind: 'passport', title: 'Passeport de Léa', details: { ...EMPTY_DETAILS, files }, notes: '', text: '' }, T0);
    server.sync.push([rec(ITEM_TYPE as never, 'item1', fields, T0), rec(ITEM_TYPE as never, 'gone', { ...fields, files: ['f9'], deletedAt: T0 }, T0)]);
    const stored = server.records.get(ITEM_TYPE, 'item1')!;
    expect(stored.fields.title).toBe(fields.title);
    const all = server.records.all();
    expect([...server.wallet.filesInUse!(all, () => false)].sort()).toEqual(['f1', 't1']);
    expect([...server.wallet.files!(all, { kept: false }).entries()].sort()).toEqual([
      ['f1', 'Wallet/f1.bin'],
      ['t1', 'Wallet/t1.bin'],
    ]);
    expect(JSON.stringify(all)).not.toContain('Léa');
  });

  it('reads a paper with Claude on request, keeping nothing', async () => {
    server = createTestServer();
    server.claude.reply(claudeMessage({ kind: 'passport', title: 'Passeport', number: '19AB12345', expiresOn: '2031-04-02', docType: 'nonsense', amount: null }));
    const response = await post(routes(server), WALLET_READ_PATH, { pages: [{ mime: 'image/jpeg', base64: 'AAAA' }], kind: null, lang: 'fr' });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { fields: Record<string, unknown> };
    expect(body.fields).toMatchObject({ kind: 'passport', title: 'Passeport', number: '19AB12345', expiresOn: '2031-04-02', docType: null });
    const sent = server.claude.requests[0]!.messages[0]!.content as { type: string }[];
    expect(sent.map(block => block.type)).toEqual(['text', 'image']);
    expect(server.claude.userText()).toContain('Language: French.');
    expect(JSON.stringify(server.db.prepare('SELECT * FROM analyses').all())).not.toContain('19AB12345');
  });

  it('refuses a reading without a key, or with pages it cannot take', async () => {
    server = createTestServer({ envApiKey: null });
    const app = routes(server);
    expect((await post(app, WALLET_READ_PATH, { pages: [{ mime: 'image/jpeg', base64: 'AAAA' }], kind: null, lang: 'fr' })).status).toBe(409);
    expect((await post(app, WALLET_READ_PATH, { pages: [], kind: null, lang: 'fr' })).status).toBe(400);
    expect((await post(app, WALLET_READ_PATH, { pages: [{ mime: 'image/gif', base64: 'AAAA' }], kind: null, lang: 'fr' })).status).toBe(400);
  });

  it('answers its routes through the server while it is on', async () => {
    server = createTestServer();
    const vault = await createVault(testCipher, 'one', T0, TEST_KDF);
    const response = await server.app.request(WALLET_VAULT_PATH, { method: 'POST', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify({ fields: vault.fields }) });
    expect(response.status).toBe(200);
  });
});
