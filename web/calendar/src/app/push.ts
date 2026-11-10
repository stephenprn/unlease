/**
 * The browser's reminders: this browser subscribed to the server's push notifications (the Push
 * API, VAPID), which rings each of one's own events' reminders even with the tab closed
 * (`/api/calendar/push/*`). The app's service worker shows them and opens the event on a tap
 * (`public/sw.js`). Only an installed or served build has its worker: the dev server says so.
 * Each start tells the server again (`refreshNotifications`): a browser may replace or drop its
 * subscription on its own, and the server would push into the void; the language and the zone the
 * reminders are worded in may have changed too.
 */
import { getLocale, t } from '@unlease/core/i18n';
import { deviceZone } from '@unlease/calendar/services/time';

import { useSettingsStore, type ServerConfig } from '@shared/app/store/settings';
import { dropPushSubscription, fetchPushKey, savePushSubscription } from './api';
import { savePrefs, usePrefsStore } from './store/prefs';

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

/** Tells the server where and how to reach this browser; false when the subscription is unusable. */
async function register(server: ServerConfig, subscription: PushSubscription): Promise<boolean> {
  const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;
  await savePushSubscription(server, { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, lang: getLocale(), timeZone: deviceZone() });
  return true;
}

/** Turns the reminders on here; null when it worked, else why not, in words. */
export async function enableNotifications(server: ServerConfig): Promise<string | null> {
  if (!pushSupported()) return t('Ce navigateur ne reçoit pas de notifications.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return t('Les notifications sont refusées pour ce site : autorisez-les dans les réglages du navigateur.');
  const worker = await registration();
  if (!worker) return t('L’application doit être servie par votre serveur (ou installée) pour recevoir des rappels.');
  try {
    const subscription = await subscribe(worker, server);
    if (!subscription || !(await register(server, subscription))) return t('Ce navigateur ne reçoit pas de notifications.');
    savePrefs({ notify: true });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : t('Le serveur ne répond pas');
  }
}

/**
 * At each start, with the reminders on here: the subscription made again if the browser dropped or
 * replaced it, and the server told of it, the language and the zone with it. Silent: a refusal since
 * (the permission taken back in the browser) turns them off here, as the switch would.
 */
export async function refreshNotifications(): Promise<void> {
  const server = useSettingsStore.getState().server;
  if (!usePrefsStore.getState().notify || !server || !pushSupported()) return;
  if (Notification.permission === 'denied') {
    savePrefs({ notify: false });
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

/** Turns them off here, and tells the server. */
export async function disableNotifications(server: ServerConfig | null): Promise<void> {
  savePrefs({ notify: false });
  const worker = await registration();
  const subscription = await worker?.pushManager.getSubscription().catch(() => null);
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => false);
  if (server) await dropPushSubscription(server, endpoint).catch(() => undefined);
}
