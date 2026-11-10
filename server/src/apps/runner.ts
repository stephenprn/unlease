/**
 * Which apps run, at any moment (`ServerSettings.apps`, set from the Administration or the first
 * run): an app that is on hears of pushes and runs its background work; one turned off
 * stops them (its records still sync, are stored and backed up, so nothing is lost), and starts
 * again when it is turned back on. Its routes are gated in `app.ts`, its chores in `jobs/housekeeping.ts`, from the same settings.
 */
import type { AppId } from '@unlease/core/apps';
import { log } from '../log';
import type { SettingsStore } from '../settings/store';
import type { SyncService } from '../sync/service';
import type { ServerApp } from './types';

export class AppRunner {
  private started = false;
  private readonly running = new Set<AppId>();
  /** Starts and stops one after the other: a stop finishes before the same app starts again. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly apps: readonly ServerApp[],
    private readonly settings: SettingsStore,
    sync: SyncService,
  ) {
    sync.onStored(stored => {
      for (const app of this.on()) app.stored?.(stored);
    });
    settings.onApps(() => void this.follow());
  }

  isOn(id: AppId): boolean {
    return this.settings.enabledApps().includes(id);
  }

  /** The apps that are on, in the registry's order. */
  on(): ServerApp[] {
    const enabled = this.settings.enabledApps();
    return this.apps.filter(app => enabled.includes(app.id));
  }

  /** Once the server listens: the background work of every app that is on. */
  start(): void {
    this.started = true;
    void this.follow();
  }

  /** The apps that are on run, those that are off stop: after `start`, at every change of the list. */
  follow(): Promise<void> {
    const step = this.queue.then(async () => {
      if (!this.started) return;
      const enabled = this.settings.enabledApps();
      for (const app of this.apps) {
        const on = enabled.includes(app.id);
        if (on && !this.running.has(app.id)) {
          this.running.add(app.id);
          log.info('app started', { app: app.id });
          app.start?.();
        } else if (!on && this.running.has(app.id)) {
          this.running.delete(app.id);
          log.info('app stopped', { app: app.id });
          await app.stop?.();
        }
      }
    });
    this.queue = step.catch(error => log.error('starting or stopping an app failed', { error }));
    return this.queue;
  }

  /** At shutdown: every app's work stopped, waited for. */
  async stop(): Promise<void> {
    this.started = false;
    await this.queue;
    const running = this.apps.filter(app => this.running.has(app.id));
    this.running.clear();
    await Promise.all(running.map(app => app.stop?.()));
  }
}
