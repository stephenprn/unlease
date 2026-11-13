/** The web's morning digest: pushed at the browser's time in its zone, gathered from every app's records with the layers it keeps on, once, late only while the morning lasts. */
import { createDecipheriv, createECDH, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { digestMoment, DIGEST_LATE_MS } from '@unlease/calendar/services/digest';
import { AUTH, createTestServer, rec, T0, type TestServer } from './helpers';

const DAY = 86_400_000;
const OLD = T0 - 8 * DAY;
const ZONE = 'Europe/Paris';
let server: TestServer;

afterEach(() => server?.close());

const event = (id: string, fields: Record<string, unknown> = {}) =>
  rec('calendarEvent', id, { title: id, description: '', start: '2026-10-19T09:00', end: '2026-10-19T10:00', timeZone: ZONE, rrule: '', exdates: [], reminders: [], labelIds: [], contactIds: [], files: [], feedId: null, trashedAt: null, createdAt: OLD, deletedAt: null, ...fields }, OLD);

const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();
const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, length: number) => hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, length);

/** RFC 8291's decryption, as the browser does it. */
function decrypt(body: Buffer, browser: ReturnType<typeof createECDH>, auth: Buffer): { title: string; body: string; path: string; tag: string } {
  const salt = body.subarray(0, 16);
  const keyLength = body[20]!;
  const sender = body.subarray(21, 21 + keyLength);
  const encrypted = body.subarray(21 + keyLength);
  const ikm = hkdf(auth, browser.computeSecret(sender), Buffer.concat([Buffer.from('WebPush: info\0'), browser.getPublicKey(), sender]), 32);
  const decipher = createDecipheriv('aes-128-gcm', hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12));
  decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
  const plain = Buffer.concat([decipher.update(encrypted.subarray(0, encrypted.length - 16)), decipher.final()]);
  return JSON.parse(plain.subarray(0, plain.length - 1).toString('utf8'));
}

describe('the web’s morning digest', () => {
  it('pushes the day at its time in the browser’s zone, once, and no reminders when only the digest was asked for', async () => {
    const sent: { body: Buffer; urgency: string | null }[] = [];
    const pushFetch = (async (_url: string | URL, init?: RequestInit) => {
      sent.push({ body: Buffer.from(init!.body as Uint8Array), urgency: new Headers(init!.headers).get('Urgency') });
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    server = createTestServer({ pushFetch });
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const auth = Buffer.from('fedcba9876543210');
    const subscribe = await server.app.request('/api/calendar/push/subscriptions', {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'https://push.example.org/send/abc',
        keys: { p256dh: browser.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
        lang: 'fr',
        timeZone: ZONE,
        reminders: false,
        digest: { at: '07:30', empty: false, birthdays: true, noteReminders: true, pageDates: true, twelveHours: false },
      }),
    });
    expect(subscribe.status).toBe(200);
    server.sync.push([
      event('Dentiste', { reminders: [10] }),
      event('Congés', { start: '2026-10-19', end: '2026-10-20', timeZone: '' }),
      rec('contact', 'lea', { firstName: 'Léa', birthday: '1996-10-19', createdAt: OLD, deletedAt: null }, OLD),
      rec('note', 'banque', { kind: 'text', title: 'Appeler la banque', body: '', position: 'a0', reminderAt: Date.UTC(2026, 9, 19, 10), trashedAt: null, deletedAt: null, createdAt: OLD }, OLD),
      rec('block', 'voyage', { kind: 'page', parentId: null, text: 'Voyage', position: 'a0', trashedAt: null, createdAt: OLD, deletedAt: null }, OLD),
      rec('block', 'ligne', { kind: 'text', parentId: 'voyage', text: 'Départ {@date=2026-10-19T1800}', position: 'a0', trashedAt: null, createdAt: OLD, deletedAt: null }, OLD),
    ]);
    expect(await server.calendar.reminders.tick()).toBe(0);
    const moment = digestMoment('2026-10-19', '07:30', ZONE);
    expect(moment).toBe(Date.UTC(2026, 9, 19, 5, 30));
    server.time.value = moment - 1_000;
    expect(await server.calendar.reminders.tick()).toBe(1);
    expect(sent[0]!.urgency).toBe('normal');
    const digest = decrypt(sent[0]!.body, browser, auth);
    expect(digest.title.replace(/\u00a0/g, ' ')).toBe('Aujourd’hui : 2 événements, Anniversaire de Léa (30 ans), 1 rappel, 1 page');
    expect(digest.body.replace(/\u00a0/g, ' ').split('\n')).toEqual(['Anniversaire de Léa (30 ans)', 'Congés', '09:00 – 10:00 · Dentiste', '12:00 · Appeler la banque', '18:00 · Voyage']);
    expect(digest).toMatchObject({ path: '/agenda/today', tag: 'digest:2026-10-19' });
    server.time.value = moment + 60_000;
    expect(await server.calendar.reminders.tick()).toBe(0);
    // Dentiste's reminder at 08:50: this browser asked for the digest alone.
    server.time.value = Date.UTC(2026, 9, 19, 6, 50) - 1_000;
    expect(await server.calendar.reminders.tick()).toBe(0);
  });

  it('rings late after a stop only while the morning lasts, and keeps quiet on a day with nothing unless asked', async () => {
    const sent: string[] = [];
    const pushFetch = (async (url: string | URL) => {
      sent.push(String(url));
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    server = createTestServer({ pushFetch });
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const keys = { p256dh: browser.getPublicKey().toString('base64url'), auth: Buffer.from('0011223344556677').toString('base64url') };
    const digest = { at: '08:00', empty: false, birthdays: false, noteReminders: false, pageDates: false, twelveHours: false };
    server.calendar.reminders.subscribe({ endpoint: 'https://push.example.org/send/quiet', keys, lang: 'fr', timeZone: ZONE, digest });
    server.calendar.reminders.subscribe({ endpoint: 'https://push.example.org/send/empty', keys, lang: 'fr', timeZone: ZONE, digest: { ...digest, empty: true } });
    expect(await server.calendar.reminders.tick()).toBe(0);
    // Stopped over 8:00 on the 19th, back at 8:30: within the hour a stopped server catches up on.
    const moment = digestMoment('2026-10-19', '08:00', ZONE);
    server.time.value = moment + 30 * 60_000;
    expect(await server.calendar.reminders.tick()).toBe(1);
    expect(sent).toEqual(['https://push.example.org/send/empty']);
    // Stopped over the 20th's morning until past it: nothing.
    server.time.value = digestMoment('2026-10-20', '08:00', ZONE) + DIGEST_LATE_MS;
    expect(await server.calendar.reminders.tick()).toBe(0);
  });
});
