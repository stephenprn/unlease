/**
 * The browser's reminders: this browser subscribed to the server's push notifications (the Push
 * API, VAPID), which rings each of one's own events' reminders even with the tab closed
 * (`/api/calendar/push/*`). The app's service worker shows them and opens the event on a tap
 * (`public/sw.js`). Only an installed or served build has its worker: the dev server says so.
 * Each start tells the server again (`refreshNotifications`): a browser may replace or drop its
 * subscription on its own, and the server would push into the void; the language and the zone the
 * reminders are worded in may have changed too. The same subscription carries the morning digest
 * (`services/digest`: its time and what of the day it reads), on with the reminders or alone.
 */
import { getLocale, t } from '@unlease/core/i18n';
import { deviceZone } from '@unlease/calendar/services/time';
import type { PushSubscriptionRequest } from '@unlease/calendar/sync/routes';

import { useSettingsStore, type ServerConfig } from '@shared/app/store/settings';
import { dropPushSubscription, fetchPushKey, savePushSubscription } from './api';
import { savePrefs, usePrefsStore, type AgendaPrefs } from './store/prefs';

/** A base64url key as the bytes `applicationServerKey` takes. */
function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(key.length / 4) * 4, '=');
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) out[index] = raw.charCodeAt(index);
  return out;
}

/** Whether this browser can receive them at all. */
export function pushSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL).catch(() => undefined)) ?? null;
}

/** This browser's subscription to the server's key, made if it has none; null when it cannot hold one. */
async function subscribe(worker: ServiceWorkerRegistration, server: ServerConfig): Promise<PushSubscription | null> {
  const key = await fetchPushKey(server);
  const current = await worker.pushManager.getSubscription();
  // One made for another key (the server's data started again) is never pushed to: made again.
  const wanted = keyBytes(key);
  const held = current?.options.applicationServerKey;
  if (current && held && !sameBytes(new Uint8Array(held), wanted)) await current.unsubscribe().catch(() => false);
  else if (current) return current;
  return worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** What this browser asks the server to push: the reminders, the morning digest (`services/digest`), or both. */
function pushWanted(prefs: AgendaPrefs): Pick<PushSubscriptionRequest, 'reminders' | 'digest'> {
  return {
    reminders: prefs.notify,
    digest: prefs.digest ? { at: prefs.digestAt, empty: prefs.digestEmpty, birthdays: prefs.birthdays, noteReminders: prefs.noteReminders, pageDates: prefs.pageDates, twelveHours: prefs.twelveHours } : null,
  };
}

/** Tells the server where and how to reach this browser, and what to push to it; false when the subscription is unusable. */
async function register(server: ServerConfig, subscription: PushSubscription, prefs: AgendaPrefs = usePrefsStore.getState()): Promise<boolean> {
  const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;
  await savePushSubscription(server, { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, lang: getLocale(), timeZone: deviceZone(), ...pushWanted(prefs) });
  return true;
}

/** Turns on here what `patch` turns on (the reminders, the digest); null when it worked, else why not, in words. */
async function enablePush(server: ServerConfig, patch: Partial<AgendaPrefs>): Promise<string | null> {
  if (!pushSupported()) return t('This browser does not receive notifications.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return t('Notifications are blocked for this site: allow them in the browser’s settings.');
  const worker = await registration();
  if (!worker) return t('The app must be served by your server (or installed) to receive reminders.');
  try {
    const subscription = await subscribe(worker, server);
    if (!subscription || !(await register(server, subscription, { ...usePrefsStore.getState(), ...patch }))) return t('This browser does not receive notifications.');
    savePrefs(patch);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : t('The server isn’t responding');
  }
}

/** Turns the reminders on here; null when it worked, else why not, in words. */
export function enableNotifications(server: ServerConfig): Promise<string | null> {
  return enablePush(server, { notify: true });
}

/** Turns the morning digest on here, as the reminders. */
export function enableDigest(server: ServerConfig): Promise<string | null> {
  return enablePush(server, { digest: true });
}

/**
 * At each start, with the reminders on here: the subscription made again if the browser dropped or
 * replaced it, and the server told of it, the language and the zone with it. Silent: a refusal since
 * (the permission taken back in the browser) turns them off here, as the switch would.
 */
export async function refreshNotifications(): Promise<void> {
  const server = useSettingsStore.getState().server;
  const prefs = usePrefsStore.getState();
  if (!(prefs.notify || prefs.digest) || !server || !pushSupported()) return;
  if (Notification.permission === 'denied') {
    savePrefs({ notify: false, digest: false });
    return;
  }
  if (Notification.permission !== 'granted') return;
  const worker = await registration();
  if (!worker) return;
  try {
    const subscription = await subscribe(worker, server);
    if (subscription) await register(server, subscription);
  } catch {
    // Offline or the server away: the next start tries again.
  }
}

/** Turns off here what `patch` turns off, and tells the server: the subscription goes once nothing is pushed any more. */
async function disablePush(server: ServerConfig | null, patch: Partial<AgendaPrefs>): Promise<void> {
  savePrefs(patch);
  const worker = await registration();
  const subscription = await worker?.pushManager.getSubscription().catch(() => null);
  if (!subscription) return;
  const prefs = usePrefsStore.getState();
  if (prefs.notify || prefs.digest) {
    if (server) await register(server, subscription).catch(() => false);
    return;
  }
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => false);
  if (server) await dropPushSubscription(server, endpoint).catch(() => undefined);
}

/** Turns the reminders off here, and tells the server. */
export function disableNotifications(server: ServerConfig | null): Promise<void> {
  return disablePush(server, { notify: false });
}

/** Turns the morning digest off here, and tells the server. */
export function disableDigest(server: ServerConfig | null): Promise<void> {
  return disablePush(server, { digest: false });
}

/** Saves a choice the digest reads (its time, the days with nothing, a layer, the hours' format) and, with it on, tells the server. Silent: offline, the next start tells it. */
export async function savePushPrefs(patch: Partial<AgendaPrefs>): Promise<void> {
  savePrefs(patch);
  const server = useSettingsStore.getState().server;
  if (!usePrefsStore.getState().digest || !server || !pushSupported() || Notification.permission !== 'granted') return;
  const subscription = await (await registration())?.pushManager.getSubscription().catch(() => null);
  if (subscription) await register(server, subscription).catch(() => false);
}
