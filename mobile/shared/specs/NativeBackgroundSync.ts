/**
 * Sync with the app closed (`com.stephenprn.unlease.backgroundsync`, mobile/shared/android): the app's
 * `syncTask` run by WorkManager every quarter of an hour, soon after changes are left unsent (retried
 * until the server takes them), and soon after a network comes up, a VPN's included. Every app of the
 * suite registers it.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** What Android holds back of the work done with the app closed. */
export interface BackgroundHealth {
  /** The battery's « Restreinte »: nothing runs while the app is closed, sync included. */
  restricted: boolean;
  /** Left out of the battery's optimization (« Sans restriction »). */
  unrestricted: boolean;
  /** Data Saver on, this app not exempt: no data in the background on mobile data. */
  dataSaver: boolean;
}

export interface Spec extends TurboModule {
  /** A server is set: the period and the network watch run; false stops both. */
  configure(on: boolean): void;
  /** Changes the server has not taken, and when a sync last got through (ms), for the network watch to decide. */
  note(pending: number, lastSyncAt: number): void;
  /** A run once a network is there, after `delaySeconds`, retried until `report('done')`. */
  soon(delaySeconds: number): void;
  /** How the run of `syncTask` under way ended: `done` (nothing left to send) or `retry`. */
  report(outcome: string): void;
  health(): Promise<BackgroundHealth>;
  /** Opens the page that fixes it: `battery` (the app's page, its battery), `unrestricted` (Android's question), `data` (its data in the background). */
  open(what: string): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>('BackgroundSync');
