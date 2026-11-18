/**
 * Wallet's routes, beside the platform's under `/api` and behind the same token, answered while
 * Wallet is on: the vault created once, and a paper read by Claude on the person's say.
 */
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { VAULT_ID, VAULT_TYPE } from '@unlease/wallet/crypto/vault';
import { vaultFromRecord } from '@unlease/wallet/sync/entities';
import { parseReadRequest, parseVaultCreate, READ_MAX_PAGE_CHARS, READ_MAX_PAGES, WALLET_READ_PATH, WALLET_VAULT_PATH, type VaultCreateResponse } from '@unlease/wallet/sync/routes';
import type { RecordStore } from '../../sync/records';
import type { SyncService } from '../../sync/service';
import type { Env } from '../types';
import type { WalletReader } from './reader';

const KB = 1024;
const tooLarge = (c: Context) => c.json({ error: 'body too large' }, 413);
const noStore = { 'Cache-Control': 'no-store' };

export function walletRoutes(app: Hono<Env>, { sync, records, reader }: { readonly sync: SyncService; readonly records: RecordStore; readonly reader: WalletReader }): void {
  app.post(WALLET_VAULT_PATH, bodyLimit({ maxSize: 8 * KB, onError: tooLarge }), async c => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid request' }, 400);
    }
    const request = parseVaultCreate(body);
    if (!request) return c.json({ error: 'Invalid vault' }, 400);
    // In one transaction: written only where no vault is, so the first one sent is the one kept.
    const written = sync.apply([{ type: VAULT_TYPE, id: VAULT_ID, create: true, patch: current => (current.seq > 0 ? null : { ...request.fields }) }]);
    const stored = vaultFromRecord(written[0] ?? records.get(VAULT_TYPE, VAULT_ID));
    if (!stored) return c.json({ error: 'Invalid vault' }, 500);
    const answer: VaultCreateResponse = { created: written.length > 0, fields: stored };
    return c.json(answer, 200, noStore);
  });

  app.post(WALLET_READ_PATH, bodyLimit({ maxSize: READ_MAX_PAGES * READ_MAX_PAGE_CHARS + 4 * KB, onError: tooLarge }), async c => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid request' }, 400);
    }
    const request = parseReadRequest(body);
    if (!request) return c.json({ error: 'Invalid request' }, 400);
    const outcome = await reader.read(request);
    if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
    return c.json(outcome.answer, 200, noStore);
  });
}
