/**
 * Boot: configuration, the database, the platform's services (sync, files, settings), the apps
 * this server can run (`apps/registry.ts`: Carnet, Pages; those the Administration turned on run),
 * the hourly chores, the drive, backups and restores, and the HTTP server; and a clean stop on
 * SIGTERM, which releases long polls at once and lets each app stop its work (Carnet's interrupted
 * link readings stay pending for the next start).
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { SUITE_SLUG } from '@unlease/core/apps';
import { Administration } from './admin';
import { createApp, VERSION } from './app';
import { createApps, PUSH_REPAIRS, PUSH_RULES } from './apps/registry';
import { AppRunner } from './apps/runner';
import { RestoreService } from './backup/restore';
import { BackupService } from './backup/service';
import { BlobStore } from './blobs/store';
import { ConfigError, loadConfig, weakTokenWarning, type Config } from './config';
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
// Warned, never refused: a server that ran with a short token keeps starting.
const weakToken = weakTokenWarning(config.token);
if (weakToken) log.warn(weakToken);
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
const sync = new SyncService({ db, records, clock, notifier, rules: PUSH_RULES, repairs: PUSH_REPAIRS });
sync.startRun();
const blobs = new BlobStore(db, join(config.dataDir, 'blobs'));
const settings = new SettingsStore(db, {
  apiKey: config.anthropicApiKey,
  model: config.claudeModel,
  budgetUsd: config.monthlyBudgetUsd,
});

// A server from before the first run existed, holding data, was set up; a new one waits for its first run.
settings.settleSetup(!records.holdsNothing());

// The apps this server can run (their record types load with their packages); the runner follows which are on.
const suite = createApps({ db, sync, records, blobs, settings, claudeEffort: config.claudeEffort, analysisConcurrency: config.analysisConcurrency, placesUrl: config.placesUrl });
const { apps } = suite;
const runner = new AppRunner(apps, settings, sync);

const housekeeping = new Housekeeping({ db, sync, records, blobs, apps, isOn: id => runner.isOn(id), dataDir: config.dataDir });
housekeeping.start();

const drive = new DriveSync({ db, records, blobs, settings, apps });
blobs.useRemote(drive);
drive.start();
const backups = new BackupService({ db, records, blobs, settings, sync, tmpDir, version: VERSION, drive, apps });
backups.start();
const restore = new RestoreService({ sync, records, blobs, settings, tmpDir, drive, onFiles: () => drive.kick(), exclusive: work => backups.exclusive(work) });
const admin = new Administration({ db, apps, blobs, backups, drive, restore, tmpDir, version: VERSION });

let stopping = false;
const app = createApp({ config, sync, blobs, settings, apps, routes: suite.routes, checks: suite.checks, admin, stopping: () => stopping });
const server = serve({ fetch: app.fetch, port: config.port }, info => {
  const live = settings.effective();
  log.info(`${NAME} listening`, {
    version: VERSION,
    port: info.port,
    dataDir: config.dataDir,
    apps: runner.on().map(one => one.id),
    setup: settings.setupDone() ? 'done' : 'waiting for its first run',
    web: config.webDir ? `the app from ${config.webDir}` : 'API only',
    node: clock.node,
    analysis: live.apiKey ? `${live.model}, key from ${live.keySource}, effort ${config.claudeEffort}` : 'off until a Claude key is set in the apps',
    monthlyBudgetUsd: live.budgetUsd,
    backup: settings.backup()?.recurrence ?? 'off',
    drive: settings.drive() ? `seafile${settings.drive()?.leaving ? ' (bringing files back)' : ''}` : 'off',
    places: config.placesUrl ?? 'off',
    clientAddress: config.trustedProxyHeader ? `from ${config.trustedProxyHeader}` : 'the connection',
  });
});

runner.start();

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
  await runner.stop();
  await closed;
  db.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', error => {
  log.error('unhandled rejection', { error });
});
