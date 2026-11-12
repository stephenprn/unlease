/**
 * Sync with the app closed, through the BackgroundSync TurboModule (`specs/NativeBackgroundSync.ts`):
 * WorkManager runs the app's `syncTask` every quarter of an hour, soon after changes are left unsent,
 * and soon after a network (a VPN's too) comes up. Missing (tests), nothing runs in the background.
 */
import NativeBackgroundSync, { type BackgroundHealth } from '../../specs/NativeBackgroundSync';

export type { BackgroundHealth };

/** What fixes each: the app's page (its battery), Android's « Sans restriction » question, its data in the background. */
export type BackgroundSetting = 'battery' | 'unrestricted' | 'data';

export type BackgroundOutcome = 'done' | 'retry';

let configured: boolean | null = null;

/** A server is set, or no longer: told once per process and value. */
export function configureBackgroundSync(on: boolean): void {
  if (configured === on) return;
  configured = on;
  NativeBackgroundSync?.configure(on);
}

let noted = '';

/** What the network watch decides on: changes the server has not taken, and the last sync that got through. */
export function noteBackgroundSync(pending: number, lastSyncAt: number | null): void {
  const value = `${pending}:${lastSyncAt ?? 0}`;
  if (value === noted) return;
  noted = value;
  NativeBackgroundSync?.note(pending, lastSyncAt ?? 0);
}

/** A run once a network is there, after `delaySeconds`, retried until the server takes everything. */
export function syncSoonInBackground(delaySeconds = 0): void {
  NativeBackgroundSync?.soon(delaySeconds);
}

/** How the run of `syncTask` under way ended: the worker retries it unless `done`. */
export function reportBackgroundSync(outcome: BackgroundOutcome): void {
  NativeBackgroundSync?.report(outcome);
}

const HEALTHY: BackgroundHealth = { restricted: false, unrestricted: false, dataSaver: false };

/** What Android holds back of the sync with the app closed; missing, the healthy answer. */
export async function backgroundHealth(): Promise<BackgroundHealth> {
  return (await NativeBackgroundSync?.health().catch(() => null)) ?? HEALTHY;
}

export async function openBackgroundSetting(what: BackgroundSetting): Promise<boolean> {
  return (await NativeBackgroundSync?.open(what).catch(() => false)) ?? false;
}

/** Test seam. */
export function resetBackgroundSync(): void {
  configured = null;
  noted = '';
}
