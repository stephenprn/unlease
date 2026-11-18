/**
 * Wallet on the server: a keeper of sealed bytes. It creates the vault once (`POST /api/wallet/vault`,
 * the first device's kept), refuses a push that would change the vault's tier keys afterwards, files
 * the sealed files in the drive and archives as `Wallet/<id>.bin` (no name, no folder that says what a
 * file is), and reads a paper with Claude only when a device sends one on the person's say
 * (`reader.ts`). Its records go to archives as they sync, sealed; it writes no Markdown of them.
 */
import { APP_NAME } from '@unlease/wallet/brand';
import { ITEM_TYPE, VAULT_ID, VAULT_TYPE } from '@unlease/wallet/crypto/vault';
import { writeFields } from '@unlease/core/sync/record';
import '@unlease/wallet/sync/types';
import type { ClaudeContext } from '../../claude/provider';
import type { UsageStore } from '../../claude/usage';
import { log } from '../../log';
import type { RecordStore, StoredRecord } from '../../sync/records';
import type { PushRule, SyncService } from '../../sync/service';
import type { ServerApp } from '../types';
import { WalletReader } from './reader';
import { walletRoutes } from './routes';

/** The app's own folder in the drive and in an archive. */
export const FOLDER = APP_NAME;

/** What the vault holds for good once created: its tier keys and its date. Only the passphrase's and the recovery code's seals change. */
const FIXED_VAULT_FIELDS = ['cards', 'papers', 'createdAt'] as const;

/**
 * A push that changes a vault's tier keys (a device gone wrong; anyone holding the token) is put back
 * under the server's clock: every item is sealed under those keys, and new ones would be unreadable
 * to the other devices.
 */
const keepVault: PushRule = (current, _incoming, merged, { clock }) => {
  if (current.type !== VAULT_TYPE || current.id !== VAULT_ID) return [];
  const restore: Record<string, unknown> = {};
  for (const field of FIXED_VAULT_FIELDS) if (current.fields[field] !== undefined && merged.fields[field] !== current.fields[field]) restore[field] = current.fields[field];
  if (Object.keys(restore).length === 0) return [];
  log.warn('wallet: a push tried to change the vault’s keys; kept as they were', { fields: Object.keys(restore) });
  return [writeFields(merged, restore, clock.stampOver(Object.keys(restore).map(field => merged.clocks[field])))];
};

export const WALLET_PUSH_RULES: readonly PushRule[] = [keepVault];

/** Every sealed file a live item holds (or one a purge keeps). */
export function walletFilesInUse(records: readonly StoredRecord[], keep: (record: StoredRecord) => boolean): Set<string> {
  const ids = new Set<string>();
  for (const record of records) {
    if (record.type !== ITEM_TYPE || !Array.isArray(record.fields.files)) continue;
    const live = record.fields.deletedAt === null || record.fields.deletedAt === undefined;
    if (!live && !keep(record)) continue;
    for (const id of record.fields.files) if (typeof id === 'string') ids.add(id);
  }
  return ids;
}

export interface WalletAppOptions {
  readonly sync: SyncService;
  readonly records: RecordStore;
  readonly usage: UsageStore;
  readonly claude: () => ClaudeContext;
  readonly now: () => number;
}

export interface WalletApp extends ServerApp {
  readonly reader: WalletReader;
}

export function createWalletApp(options: WalletAppOptions): WalletApp {
  const reader = new WalletReader(options);
  return {
    id: 'wallet',
    readme: `\`${FOLDER}/\` : vos cartes et vos papiers, chiffrés sur vos appareils ; seuls ceux-ci les ouvrent (ou votre kit de secours, avec \`tools/wallet/open.mjs\`).`,
    reader,
    routes: app => walletRoutes(app, { sync: options.sync, records: options.records, reader }),
    filesInUse: walletFilesInUse,
    files: all => {
      const files = new Map<string, string>();
      for (const id of walletFilesInUse(all, () => false)) files.set(id, `${FOLDER}/${id}.bin`);
      return files;
    },
  };
}
