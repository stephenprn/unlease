/**
 * Boot: configuration, the database, the platform's services (sync, files, settings), the apps
 * this server runs (`apps/`: Carnet), the hourly chores, the drive, backups and restores, and the
 * HTTP server; and a clean stop on SIGTERM, which releases long polls at once and lets each app
 * stop its work (Carnet's interrupted link readings stay pending for the next start).
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { SUITE_SLUG } from '@unlease/core/apps';
import { Administration } from './admin';
import { createApp, VERSION } from './app';
import { createNotesApp, NOTES_PUSH_RULES } from './apps/notes';
import type { ServerApp } from './apps/types';
import { RestoreService } from './backup/restore';
import { BackupService } from './backup/service';
import { BlobStore } from './blobs/store';
import { ConfigError, loadConfig, type Config } from './config';
import { openDatabase } from './db/database';
import { DriveSync } from './drive/sync';
import { Housekeeping } from './jobs/housekeeping';
import { log } from './log';
import { SettingsStore } from './settings/store';
import { newestStoredClock, ServerClock, serverNodeId } from './sync/clock';
import { ChangeNotifier } from './sync/notifier';
import { RecordStore } from './sync/records';
import { SyncService } from './sync/service';

const NAME = `${SUITE_SLUG}-server`;

function configOrExit(): Config {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${NAME}: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

const config = configOrExit();
mkdirSync(join(config.dataDir, 'blobs'), { recursive: true });
// Archives being written or restored: what a stop left there is of no use.
const tmpDir = join(config.dataDir, 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
const db = openDatabase(join(config.dataDir, `${SUITE_SLUG}.sqlite`));

const records = new RecordStore(db);
const clock = new ServerClock(serverNodeId(db));
const newest = newestStoredClock(db);
if (newest) clock.observe(newest);
const notifier = new ChangeNotifier();
const sync = new SyncService({ db, records, clock, notifier, rules: NOTES_PUSH_RULES });
sync.startRun();
const blobs = new BlobStore(db, join(config.dataDir, 'blobs'));
const settings = new SettingsStore(db, {
  apiKey: config.anthropicApiKey,
  model: config.claudeModel,
  budgetUsd: config.monthlyBudgetUsd,
});

// The apps this server runs. A new app's module goes here (its record types load with its package).
const notes = createNotesApp({ db, sync, records, blobs, settings, claudeEffort: config.claudeEffort, analysisConcurrency: config.analysisConcurrency });
const apps: readonly ServerApp[] = [notes];
for (const app of apps) {
  const stored = app.stored;
  if (stored) sync.onStored(list => stored(list));
}

const housekeeping = new Housekeeping({ db, sync, records, blobs, apps, dataDir: config.dataDir });
housekeeping.start();

const drive = new DriveSync({ db, records, blobs, settings, apps });
blobs.useRemote(drive);
drive.start();
const backups = new BackupService({ db, records, blobs, settings, sync, tmpDir, version: VERSION, drive, apps });
backups.start();
const restore = new RestoreService({ sync, records, blobs, settings, tmpDir, drive, onFiles: () => drive.kick(), exclusive: work => backups.exclusive(work) });
const admin = new Administration({ db, blobs, backups, drive, restore, tmpDir, version: VERSION });

let stopping = false;
const app = createApp({ config, sync, blobs, settings, apps, admin, stopping: () => stopping });
const server = serve({ fetch: app.fetch, port: config.port }, info => {
  const live = settings.effective();
  log.info(`${NAME} listening`, {
    version: VERSION,
    port: info.port,
    dataDir: config.dataDir,
    apps: apps.map(one => one.id),
    web: config.webDir ? `the app from ${config.webDir}` : 'API only',
    node: clock.node,
    analysis: live.apiKey ? `${live.model}, key from ${live.keySource}, effort ${config.claudeEffort}` : 'off until a Claude key is set in the apps',
    monthlyBudgetUsd: live.budgetUsd,
    backup: settings.backup()?.recurrence ?? 'off',
    drive: settings.drive() ? `seafile${settings.drive()?.leaving ? ' (bringing files back)' : ''}` : 'off',
  });
});

for (const one of apps) one.start?.();

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info('stopping', { signal });
  setTimeout(() => process.exit(1), 10_000).unref();
  housekeeping.stop();
  backups.stop();
  drive.stop();
  // Answer the long polls now; then wait for requests in flight before closing the database.
  const closed = new Promise<void>(resolve => server.close(() => resolve()));
  notifier.close();
  if ('closeIdleConnections' in server) server.closeIdleConnections();
  await Promise.all(apps.map(one => one.stop?.()));
  await closed;
  db.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', error => {
  log.error('unhandled rejection', { error });
});
