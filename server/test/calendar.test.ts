import { createDecipheriv, createECDH, createHmac, createPublicKey, verify } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { parseIcs } from '@unlease/calendar/services/ics';
import { Housekeeping } from '../src/jobs/housekeeping';
import { FeedLogins } from '../src/apps/calendar/logins';
import type { Fetcher, FetchOptions, FetchResult } from '../src/reading/fetcher';
import { encryptPayload, makeVapidKeys, vapidAuthorization, vapidPublicKey } from '../src/apps/calendar/webpush';
import { LEAD_MS, nextTickIn } from '../src/apps/calendar/reminders';
import { AUTH, claudeMessage, createTestServer, FakeFetcher, rec, T0, type FakeRoute, type TestServer } from './helpers';
import { putSettings } from './seed';

const DAY = 86_400_000;
const OLD = T0 - 8 * DAY;
const FEED_URL = 'https://calendar.example.org/basic.ics';
const NAGER = 'https://date.nager.at/api/v3';
let server: TestServer;
let closed: TestServer | null = null;

// A test that makes no server leaves the last one closed.
afterEach(() => {
  if (server && server !== closed) server.close();
  closed = server;
});

const ics = (...events: string[]): string =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Club', ...events, 'END:VCALENDAR'].join('\r\n');
const vevent = (uid: string, summary: string, start: string): string =>
  ['BEGIN:VEVENT', `UID:${uid}`, `SUMMARY:${summary}`, `DTSTART;TZID=Europe/Paris:${start}`, `DTEND;TZID=Europe/Paris:${start.slice(0, 9)}235900`, 'END:VEVENT'].join('\r\n');

const event = (id: string, fields: Record<string, unknown> = {}, wall = OLD) =>
  rec('calendarEvent', id, { title: 'Dîner', description: '', start: '2026-10-20T20:00', end: '2026-10-20T22:00', timeZone: 'Europe/Paris', rrule: '', exdates: [], reminders: [], labelIds: [], contactIds: [], files: [], feedId: null, trashedAt: null, createdAt: wall, deletedAt: null, ...fields }, wall);

const feed = (id: string, url: string, fields: Record<string, unknown> = {}) =>
  rec('calendarFeed', id, { kind: 'ics', name: '', url, color: 'blue', hidden: false, position: 'a0', createdAt: OLD, deletedAt: null, ...fields }, OLD);

const liveEvents = (server: TestServer, feedId: string) =>
  server.records.ofType('calendarEvent').filter(record => record.fields.feedId === feedId && record.fields.deletedAt === null);

class SwitchingFetcher extends FakeFetcher {
  constructor(readonly table: Record<string, FakeRoute>) {
    super(table);
  }
}

const DAV_CALENDAR = 'https://dav.example.org/dav/caldav/Y2FsOi8vMC8x';
const BASIC = `Basic ${Buffer.from('lea@example.org:secret').toString('base64')}`;

const multistatus = (...responses: string[]): string => `<?xml version="1.0" encoding="UTF-8"?><D:multistatus xmlns:D="DAV:" xmlns:CAL="urn:ietf:params:xml:ns:caldav">${responses.join('')}</D:multistatus>`;
const davResponse = (href: string, props: string): string => `<D:response><D:href>${href}</D:href><D:propstat><D:prop>${props}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
const calendarProps = (name: string, comps = '<CAL:comp name="VEVENT"/>'): string =>
  `<D:resourcetype><D:collection/><CAL:calendar/></D:resourcetype><D:displayname>${name}</D:displayname><CAL:supported-calendar-component-set>${comps}</CAL:supported-calendar-component-set>`;

/** An Open-Xchange-like CalDAV server: a login opens a principal, its home, two calendars of events and a list of tasks. */
class FakeCalDav implements Fetcher {
  readonly calls: { method: string; url: string; authorization: string | undefined; body: string }[] = [];
  password = 'secret';

  async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    const method = options.method ?? 'GET';
    const authorization = options.login ? `Basic ${Buffer.from(`${options.login.username}:${options.login.password}`).toString('base64')}` : undefined;
    this.calls.push({ method, url, authorization, body: options.body ?? '' });
    const answer = (status: number, body = '', headers: Record<string, string> = {}): FetchResult => ({ url, status, headers, body: Buffer.from(body), truncated: false });
    if (url === FEED_URL) return answer(200, ics(vevent('a@x', 'Match', '20261103T190000')), { 'content-type': 'text/calendar' });
    if (!url.startsWith('https://dav.example.org/')) return answer(404);
    if (authorization !== `Basic ${Buffer.from(`lea@example.org:${this.password}`).toString('base64')}`) return answer(401, 'Authorization Required', { 'www-authenticate': 'Basic realm="OX WebDAV"' });
    const depth = options.headers?.depth;
    if (method === 'PROPFIND' && url === DAV_CALENDAR && depth === '0') return answer(207, multistatus(davResponse('/dav/caldav/Y2FsOi8vMC8x', calendarProps('Travail'))));
    if (method === 'PROPFIND' && url === 'https://dav.example.org/dav/caldav/home/' && depth === '0') return answer(207, multistatus(davResponse('/dav/caldav/home/', calendarProps('Maison'))));
    if (method === 'PROPFIND' && url === 'https://dav.example.org/' && depth === '0') return answer(207, multistatus(davResponse('/', '<D:resourcetype><D:collection/></D:resourcetype>')));
    if (method === 'PROPFIND' && url === 'https://dav.example.org/' && depth === '1') return answer(207, multistatus(davResponse('/', '<D:resourcetype><D:collection/></D:resourcetype>')));
    if (method === 'PROPFIND' && url === 'https://dav.example.org/.well-known/caldav') return { ...answer(207, multistatus(davResponse('/dav/', '<D:current-user-principal><D:href>/dav/principals/lea/</D:href></D:current-user-principal>'))), url: 'https://dav.example.org/dav/' };
    if (method === 'PROPFIND' && url === 'https://dav.example.org/dav/principals/lea/') return answer(207, multistatus(davResponse('/dav/principals/lea/', '<CAL:calendar-home-set><D:href>/dav/caldav/</D:href></CAL:calendar-home-set>')));
    if (method === 'PROPFIND' && url === 'https://dav.example.org/dav/caldav/' && depth === '1') {
      return answer(
        207,
        multistatus(
          davResponse('/dav/caldav/', '<D:resourcetype><D:collection/></D:resourcetype>'),
          davResponse('/dav/caldav/Y2FsOi8vMC8x', calendarProps('Travail')),
          davResponse('/dav/caldav/home/', calendarProps('Maison', '<CAL:comp name="VEVENT"/><CAL:comp name="VTODO"/>')),
          davResponse('/dav/caldav/tasks/', calendarProps('Tâches', '<CAL:comp name="VTODO"/>')),
        ),
      );
    }
    if (method === 'REPORT' && depth === '1' && options.body?.includes('calendar-query')) {
      const data = (uid: string, summary: string, start: string): string => davResponse(`/dav/caldav/Y2FsOi8vMC8x/${uid}.ics`, `<D:getetag>"1"</D:getetag><CAL:calendar-data>${ics(vevent(uid, summary, start)).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</CAL:calendar-data>`);
      return answer(207, multistatus(data('p@x', 'Point d’équipe', '20261104T100000'), `<D:response><D:href>/dav/caldav/Y2FsOi8vMC8x/r.ics</D:href><D:propstat><D:prop><CAL:calendar-data><![CDATA[${ics(vevent('r@x', 'Revue', '20261105T140000'))}]]></CAL:calendar-data></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`));
    }
    return answer(404);
  }
}

const json = (value: unknown): FakeRoute => ({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });

describe('Agenda on the server', () => {
  it('reads a subscription, writes only what changed, and drops what it no longer serves', async () => {
    const table: Record<string, FakeRoute> = { [FEED_URL]: { status: 200, headers: { 'content-type': 'text/calendar' }, body: ics(vevent('a@x', 'Entraînement', '20261103T190000'), vevent('b@x', 'Match', '20261108T150000')) } };
    server = createTestServer({ fetcher: new SwitchingFetcher(table) });
    server.sync.push([feed('club', FEED_URL)]);
    expect(await server.calendar.feeds.refresh('club')).toEqual({ ok: true });
    expect(liveEvents(server, 'club').map(record => record.fields.title).sort()).toEqual(['Entraînement', 'Match']);
    const club = server.records.get('calendarFeed', 'club')!.fields;
    expect(club.name).toBe('Club');
    expect(club.refreshedAt).toBe(T0);
    const seq = server.records.maxSeq();
    expect(await server.calendar.feeds.refresh('club')).toEqual({ ok: true });
    // Nothing changed: only the calendar's own refreshedAt (the same time) and no event written.
    expect(server.records.maxSeq()).toBe(seq);
    table[FEED_URL] = { status: 200, body: ics(vevent('a@x', 'Entraînement (gymnase)', '20261103T190000')) };
    expect(await server.calendar.feeds.refresh('club')).toEqual({ ok: true });
    expect(liveEvents(server, 'club').map(record => record.fields.title)).toEqual(['Entraînement (gymnase)']);
    table[FEED_URL] = { status: 404, body: 'gone' };
    expect(await server.calendar.feeds.refresh('club')).toMatchObject({ ok: false, status: 502 });
    expect(server.records.get('calendarFeed', 'club')!.fields.error).toBe('This calendar no longer exists at this address');
    expect(liveEvents(server, 'club')).toHaveLength(1);
    // Deleted, its events go with it.
    server.sync.apply([{ type: 'calendarFeed', id: 'club', patch: () => ({ deletedAt: T0 }) }]);
    await server.calendar.feeds.refresh('club');
    expect(liveEvents(server, 'club')).toHaveLength(0);
  });

  it('tries an address before it is followed, asks for a login, and finds the calendar over CalDAV', async () => {
    const dav = new FakeCalDav();
    server = createTestServer({ fetcher: dav });
    const connect = (body: unknown) => server.app.request('/api/calendar/feeds/connect', { method: 'POST', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    // A public address: ready as iCalendar, its own name.
    expect(await (await connect({ id: 'club', url: FEED_URL.replace('https', 'webcal') })).json()).toEqual({ status: 'ready', kind: 'ics', url: FEED_URL, name: 'Club' });
    // The mailbox's CalDAV address asks for a login.
    expect(await (await connect({ id: 'work', url: DAV_CALENDAR })).json()).toEqual({ status: 'login' });
    const refused = await connect({ id: 'work', url: DAV_CALENDAR, login: { username: 'lea@example.org', password: 'wrong' } });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ error: 'Login or password refused' });
    // The right login: the calendar itself, its name, and nothing written yet but the login.
    const ready = await connect({ id: 'work', url: DAV_CALENDAR, login: { username: 'lea@example.org', password: 'secret' } });
    expect(await ready.json()).toEqual({ status: 'ready', kind: 'caldav', url: DAV_CALENDAR, name: 'Travail' });
    expect(server.records.get('calendarFeed', 'work')).toBeUndefined();
    // The device follows it: the server reads its events with the login, never sent elsewhere.
    server.sync.push([feed('work', DAV_CALENDAR, { kind: 'caldav', account: 'lea@example.org' })]);
    expect(await server.calendar.feeds.refresh('work')).toEqual({ ok: true });
    expect(liveEvents(server, 'work').map(record => record.fields.title).sort()).toEqual(['Point d’équipe', 'Revue']);
    expect(server.records.get('calendarFeed', 'work')!.fields).toMatchObject({ name: 'dav.example.org', refreshedAt: T0, error: '' });
    expect(dav.calls.filter(call => call.method !== 'GET').every(call => call.authorization !== undefined)).toBe(true);
    expect(dav.calls.filter(call => call.method === 'REPORT').every(call => call.authorization === BASIC)).toBe(true);
    // No password in what syncs.
    expect(JSON.stringify(server.records.all())).not.toContain('secret');
    // The password changed elsewhere: the calendar says so, and keeps its events.
    dav.password = 'renewed';
    expect(await server.calendar.feeds.refresh('work')).toMatchObject({ ok: false });
    expect(server.records.get('calendarFeed', 'work')!.fields.error).toBe('Login or password refused');
    expect(liveEvents(server, 'work')).toHaveLength(2);
    // Unsubscribed: its events and its login go.
    server.sync.apply([{ type: 'calendarFeed', id: 'work', patch: () => ({ deletedAt: T0 }) }]);
    await server.calendar.feeds.refresh('work');
    expect(liveEvents(server, 'work')).toHaveLength(0);
    expect(new FeedLogins(server.db).get('work')).toBeNull();
  });

  it('finds the calendars from the server’s root, asks which one, and never sends a password over http', async () => {
    const dav = new FakeCalDav();
    server = createTestServer({ fetcher: dav });
    const connect = (body: unknown) => server.app.request('/api/calendar/feeds/connect', { method: 'POST', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const login = { username: 'lea@example.org', password: 'secret' };
    expect(await (await connect({ id: 'work', url: 'https://dav.example.org/', login })).json()).toEqual({
      status: 'choose',
      calendars: [
        { url: DAV_CALENDAR, name: 'Travail' },
        { url: 'https://dav.example.org/dav/caldav/home/', name: 'Maison' },
      ],
    });
    // The list of tasks is no calendar of events. One chosen: ready.
    expect(await (await connect({ id: 'work', url: 'https://dav.example.org/dav/caldav/home/', login })).json()).toMatchObject({ status: 'ready', kind: 'caldav', name: 'Maison' });
    const plain = await connect({ id: 'other', url: 'http://dav.example.org/dav/caldav/Y2FsOi8vMC8x', login });
    expect(plain.status).toBe(422);
    expect(await plain.json()).toEqual({ error: 'A password only travels over https://' });
    // A login never claimed by a calendar is let go after a day.
    const logins = new FeedLogins(server.db);
    expect(logins.get('work')).not.toBeNull();
    logins.prune(() => null, T0 + 2 * DAY);
    expect(logins.get('work')).toBeNull();
  });

  it('refreshes from its route, and answers 404 while Agenda is off', async () => {
    server = createTestServer({ fetcher: new FakeFetcher({ [FEED_URL]: { status: 200, body: ics(vevent('a@x', 'A', '20261103T190000')) } }) });
    server.sync.push([feed('club', FEED_URL)]);
    const response = await server.app.request('/api/calendar/feeds/club/refresh', { method: 'POST', headers: AUTH });
    expect(response.status).toBe(200);
    expect(liveEvents(server, 'club')).toHaveLength(1);
    expect((await putSettings(server, { apps: ['notes'] })).status).toBe(200);
    expect((await server.app.request('/api/calendar/feeds/club/refresh', { method: 'POST', headers: AUTH })).status).toBe(404);
  });

  it('keeps a country’s holidays, its region’s too, and drops them with the country', async () => {
    const year = (y: number) => [
      { date: `${y}-01-01`, localName: 'Jour de l’an', name: 'New Year’s Day', countryCode: 'FR', global: true, counties: null },
      { date: `${y}-12-26`, localName: 'Saint-Étienne', name: 'St. Stephen’s Day', countryCode: 'FR', global: false, counties: ['FR-57', 'FR-67', 'FR-68'] },
    ];
    const table: Record<string, FakeRoute> = {};
    for (const y of [2025, 2026, 2027, 2028]) table[`${NAGER}/PublicHolidays/${y}/FR`] = json(year(y));
    server = createTestServer({ fetcher: new FakeFetcher(table) });
    expect((await putSettings(server, { calendar: { holidays: { country: 'FR', region: 'FR-99' } } })).body).toEqual({ error: 'Région inconnue pour ce pays' });
    expect((await putSettings(server, { calendar: { holidays: { country: 'XX' } } })).status).toBe(400);
    const saved = await putSettings(server, { calendar: { holidays: { country: 'FR', region: 'FR-67' } } });
    expect(saved.status).toBe(200);
    expect(saved.body.calendar.holidays).toEqual({ country: 'FR', region: 'FR-67' });
    await server.calendar.holidays.sync();
    expect(server.records.get('calendarFeed', 'holidays')!.fields).toMatchObject({ kind: 'holidays', name: 'Jours fériés · France (FR-67)' });
    expect(liveEvents(server, 'holidays')).toHaveLength(8);
    expect(server.calendar.counts!()).toEqual({ events: 0 });
    const regions = await server.app.request('/api/calendar/holidays/regions?country=FR', { headers: AUTH });
    expect(await regions.json()).toEqual({ regions: ['FR-57', 'FR-67', 'FR-68'] });
    expect((await putSettings(server, { calendar: { holidays: { country: null } } })).status).toBe(200);
    await server.calendar.holidays.sync();
    expect(liveEvents(server, 'holidays')).toHaveLength(0);
    expect(server.records.get('calendarFeed', 'holidays')!.fields.deletedAt).toBe(T0);
  });

  it('publishes its own events at a secret address, without the token', async () => {
    server = createTestServer();
    server.sync.push([event('mine', { title: 'Anniversaire de Léa', description: 'Avec {@contact=lea}' }), rec('contact', 'lea', { firstName: 'Léa', createdAt: OLD, deletedAt: null }, OLD), event('theirs', { feedId: 'club', title: 'Match' })]);
    expect((await server.app.request('/ical/abcdefghijklmnopqrstuvwx.ics')).status).toBe(404);
    const published = await putSettings(server, { calendar: { publish: true } });
    const path = published.body.calendar.publishPath as string;
    expect(path).toMatch(/^\/ical\/[A-Za-z0-9_-]{32}\.ics$/);
    const response = await server.app.request(path);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    const calendar = parseIcs(await response.text());
    expect(calendar.events.map(each => each.title)).toEqual(['Anniversaire de Léa']);
    expect(calendar.events[0]!.description).toBe('Avec Léa');
    expect((await server.app.request(path.replace(/.\.ics$/, 'Z.ics'))).status).toBe(404);
    const renewed = await putSettings(server, { calendar: { publish: 'renew' } });
    expect(renewed.body.calendar.publishPath).not.toBe(path);
    expect((await server.app.request(path)).status).toBe(404);
    expect((await putSettings(server, { calendar: { publish: false } })).body.calendar.publishPath).toBeNull();
  });

  it('names only contacts and the events it publishes at that address, never a note, a link, a page or what is in the bin', async () => {
    server = createTestServer();
    server.sync.push([
      rec('contact', 'lea', { firstName: 'Léa', createdAt: OLD, deletedAt: null }, OLD),
      rec('contact', 'old-lea', { firstName: 'Léa (ancienne)', mergedInto: 'lea', trashedAt: OLD, createdAt: OLD, deletedAt: null }, OLD),
      rec('contact', 'gone', { firstName: 'Paul', trashedAt: OLD, createdAt: OLD, deletedAt: null }, OLD),
      rec('note', 'diary', { kind: 'text', title: 'Mon journal', body: 'Rien à dire', position: 'a0', trashedAt: null, deletedAt: null, createdAt: OLD }, OLD),
      rec('link', 'bank', { noteId: 'inbox', url: 'https://bank.example.org/statement', status: 'ready', autoFile: false, title: 'Relevé de compte', kind: 'other', analyzedAt: OLD, createdAt: OLD, deletedAt: null }, OLD),
      rec('block', 'secret', { kind: 'page', parentId: null, text: 'Projet confidentiel', private: true, position: 'a0', trashedAt: null, createdAt: OLD, deletedAt: null }, OLD),
      rec('block', 'open', { kind: 'page', parentId: null, text: 'Courses', position: 'a1', trashedAt: null, createdAt: OLD, deletedAt: null }, OLD),
      event('match', { feedId: 'club', title: 'Match à domicile' }),
      event('binned', { title: 'Rendez-vous médecin', trashedAt: OLD }),
      event('lunch', { title: 'Déjeuner' }),
      event('mine', {
        title: 'Réunion',
        description: 'Avec {@contact=lea}, {@contact=old-lea} et {@contact=gone}. Voir {@note=diary}, {@link=bank}, {@page=secret}, {@page=open}, après {@event=lunch}, avant {@event=match} et {@event=binned}.',
      }),
    ]);
    const published = await putSettings(server, { calendar: { publish: true } });
    const calendar = parseIcs(await (await server.app.request(published.body.calendar.publishPath as string)).text());
    const description = calendar.events.find(each => each.title === 'Réunion')!.description;
    expect(description).toBe('Avec Léa, Léa et …. Voir …, …, …, …, après Déjeuner, avant … et ….');
    // The backup is the person's own: it names them all.
    const backup = server.calendar.markdown!(server.records.all(), { kept: false }).find(file => file.path.endsWith('.ics'))!.text;
    expect(parseIcs(backup).events.find(each => each.title === 'Réunion')!.description).toContain('Voir Mon journal, Relevé de compte, Projet confidentiel, Courses');
  });

  it('lists the events that mention a page or a person', async () => {
    server = createTestServer();
    server.sync.push([event('reunion', { title: 'Réunion', description: 'Voir {@page=projet}' }), event('diner', { contactIds: ['lea'] }), event('autre')]);
    const page = (await (await server.app.request('/api/calendar/mentions?type=page&ids=projet', { headers: AUTH })).json()) as { places: { id: string }[] };
    expect(page.places).toEqual([expect.objectContaining({ app: 'calendar', type: 'event', id: 'reunion', title: 'Réunion', when: '2026-10-20T20:00' })]);
    const person = (await (await server.app.request('/api/calendar/mentions?type=contact&ids=lea', { headers: AUTH })).json()) as { places: { id: string }[] };
    expect(person.places.map(place => place.id)).toEqual(['diner']);
  });

  it('empties its bin after a week, a series with its exceptions', async () => {
    server = createTestServer();
    const housekeeping = new Housekeeping({ db: server.db, sync: server.sync, records: server.records, blobs: server.blobs, apps: server.apps, isOn: id => server.runner.isOn(id), now: server.now });
    server.sync.push([event('serie', { rrule: 'FREQ=WEEKLY', trashedAt: OLD }), event('exception', { recurringId: 'serie', originalStart: '2026-10-27T20:00' }), event('recent', { trashedAt: T0 - DAY })]);
    expect((await housekeeping.run()).tombstoned).toBe(2);
    expect(server.records.get('calendarEvent', 'exception')!.fields.deletedAt).toBe(T0);
    expect(server.records.get('calendarEvent', 'recent')!.fields.deletedAt).toBeNull();
  });

  it('writes its calendar and list in archives, its files under its folder', () => {
    server = createTestServer();
    server.sync.push([
      event('concert', { title: 'Concert', place: 'Olympia, Paris', files: [{ id: 'billet', name: 'Billet.pdf', mime: 'application/pdf', bytes: 10, uploaded: true }], labelIds: ['sorties'] }),
      rec('calendarLabel', 'sorties', { name: 'Sorties', color: 'red', position: 'a0', createdAt: OLD, deletedAt: null }, OLD),
      event('match', { feedId: 'club', title: 'Match' }),
    ]);
    const all = server.records.all();
    expect([...server.calendar.filesInUse!(all, () => false)]).toEqual(['billet']);
    const files = server.calendar.files!(all, { kept: false });
    expect(files.get('billet')).toBe('Agenda/2026-10-20 Concert/Billet.pdf');
    const markdown = server.calendar.markdown!(all, { kept: false });
    expect(markdown.map(file => file.path)).toEqual(['Agenda/Agenda.ics', 'Agenda/Agenda.md']);
    const list = markdown[1]!.text;
    expect(list).toContain('### Concert');
    expect(list).toContain('- Lieu : Olympia, Paris');
    expect(list).toContain('- Libellés : Sorties');
    expect(list).toContain('[Billet.pdf](<../Fichiers/Agenda/2026-10-20 Concert/Billet.pdf>)');
    expect(list).not.toContain('Match');
    expect(parseIcs(markdown[0]!.text).events[0]!.categories).toEqual(['Sorties']);
  });

  it('reads a link Carnet kept for an event, through Claude', async () => {
    server = createTestServer();
    server.sync.push([rec('link', 'billet', { noteId: 'inbox', url: 'https://tickets.example.org/concert', status: 'ready', autoFile: false, title: 'Concert à l’Olympia', summary: 'Le 12 décembre à 20h', kind: 'event', analyzedAt: OLD, createdAt: OLD, deletedAt: null }, OLD)]);
    server.claude.reply(claudeMessage({ event: { title: 'Concert', start: '2026-12-12T20:00', end: '2026-12-12T22:00', timeZone: 'Europe/Paris', place: 'Olympia, Paris', description: '' } }));
    const response = await server.app.request('/api/calendar/from-link', { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ linkId: 'billet', lang: 'fr', now: '2026-10-18T14:00', timeZone: 'Europe/Paris' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ proposal: { title: 'Concert', start: '2026-12-12T20:00', end: '2026-12-12T22:00', timeZone: 'Europe/Paris', place: 'Olympia, Paris', description: '', url: 'https://tickets.example.org/concert' } });
    expect(server.claude.userText()).toContain('Summary: Le 12 décembre à 20h');
    const ask = await server.app.request('/api/calendar/ask', { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Quoi demain ?', context: '2026-10-19 all day | Repos', lang: 'fr', now: '2026-10-18T14:00', history: [] }) });
    expect(ask.status).toBe(409);
    expect((await putSettings(server, { calendar: { ask: true } })).status).toBe(200);
    server.claude.reply(claudeMessage('Demain, rien de prévu : repos.'));
    const asked = await server.app.request('/api/calendar/ask', { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Quoi demain ?', context: '2026-10-19 all day | Repos', lang: 'fr', now: '2026-10-18T14:00', history: [] }) });
    expect(await asked.json()).toEqual({ answer: 'Demain, rien de prévu : repos.' });
  });

  it('finds the weather for a place by its last part', async () => {
    const geocoding = (name: string) => `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=fr&format=json`;
    const fetcher = new FakeFetcher({
      [geocoding('12 rue de la Paix, Lyon')]: json({}),
      [geocoding('Lyon')]: json({ results: [{ name: 'Lyon', country: 'France', latitude: 45.75, longitude: 4.85 }] }),
      'https://api.open-meteo.com/v1/forecast?latitude=45.75&longitude=4.85&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16': json({
        daily: { time: ['2026-10-18'], weather_code: [61], temperature_2m_max: [14.2], temperature_2m_min: [7.9], precipitation_probability_max: [80] },
      }),
    });
    server = createTestServer({ fetcher });
    const response = await server.app.request(`/api/calendar/weather?place=${encodeURIComponent('12 rue de la Paix, Lyon')}`, { headers: AUTH });
    expect(await response.json()).toEqual({ place: 'Lyon, France', days: [{ day: '2026-10-18', code: 61, max: 14.2, min: 7.9, rain: 80 }] });
  });
});

describe('the web’s reminders', () => {
  const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();
  const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, length: number) => hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, length);

  /** What a browser does with a push: RFC 8291's decryption, with its own private key. */
  function decrypt(body: Buffer, browser: ReturnType<typeof createECDH>, auth: Buffer): string {
    const salt = body.subarray(0, 16);
    const keyLength = body[20]!;
    const sender = body.subarray(21, 21 + keyLength);
    const encrypted = body.subarray(21 + keyLength);
    const shared = browser.computeSecret(sender);
    const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from('WebPush: info\0'), browser.getPublicKey(), sender]), 32);
    const key = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
    const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
    const decipher = createDecipheriv('aes-128-gcm', key, nonce);
    decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
    const plain = Buffer.concat([decipher.update(encrypted.subarray(0, encrypted.length - 16)), decipher.final()]);
    expect(plain[plain.length - 1]).toBe(2);
    return plain.subarray(0, plain.length - 1).toString('utf8');
  }

  it('encrypts for one browser and signs as the server', () => {
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const auth = Buffer.from('0123456789abcdef');
    const body = encryptPayload(Buffer.from('{"title":"Dîner"}'), { p256dh: browser.getPublicKey().toString('base64url'), auth: auth.toString('base64url') });
    expect(decrypt(body, browser, auth)).toBe('{"title":"Dîner"}');
    const keys = makeVapidKeys();
    const header = vapidAuthorization(keys, 'https://push.example.org/send/abc', 'https://example.org', T0);
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(match[4]).toBe(vapidPublicKey(keys));
    expect(JSON.parse(Buffer.from(match[2]!, 'base64url').toString())).toMatchObject({ aud: 'https://push.example.org', sub: 'https://example.org' });
    const publicKey = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: keys.x, y: keys.y }, format: 'jwk' });
    expect(verify('sha256', Buffer.from(`${match[1]}.${match[2]}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(match[3]!, 'base64url'))).toBe(true);
  });

  it('rings each reminder once, worded for the browser, and forgets a browser gone', async () => {
    const sent: { endpoint: string; body: Buffer }[] = [];
    let status = 201;
    const pushFetch = (async (url: string | URL, init?: RequestInit) => {
      sent.push({ endpoint: String(url), body: Buffer.from(init!.body as Uint8Array) });
      return new Response(null, { status });
    }) as typeof fetch;
    server = createTestServer({ pushFetch });
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const auth = Buffer.from('fedcba9876543210');
    const subscribe = await server.app.request('/api/calendar/push/subscriptions', {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://push.example.org/send/abc', keys: { p256dh: browser.getPublicKey().toString('base64url'), auth: auth.toString('base64url') }, lang: 'en', timeZone: 'Europe/Paris' }),
    });
    expect(subscribe.status).toBe(200);
    expect(((await (await server.app.request('/api/calendar/push/key', { headers: AUTH })).json()) as { publicKey: string }).publicKey).toMatch(/^B[A-Za-z0-9_-]{86}$/);
    // 18 October 2026 at 14:00 in Paris (12:00 UTC is T0): a reminder 10 minutes before 14:30.
    server.sync.push([event('rdv', { title: 'Dentiste', start: '2026-10-18T14:30', end: '2026-10-18T15:00', reminders: [10], place: 'Cabinet' })]);
    expect(await server.calendar.reminders.tick()).toBe(0);
    server.time.value = T0 + 21 * 60_000;
    expect(await server.calendar.reminders.tick()).toBe(1);
    const reminder = JSON.parse(decrypt(sent[0]!.body, browser, auth));
    expect(reminder).toEqual({ title: 'Dentiste', body: 'Sun 18\u00a0Oct · 14:30 · Cabinet', path: '/agenda/event/rdv?at=2026-10-18T14%3A30', tag: 'rdv@2026-10-18T14:30#10' });
    server.time.value = T0 + 30 * 60_000;
    expect(await server.calendar.reminders.tick()).toBe(0);
    server.sync.push([event('rdv2', { title: 'Encore', start: '2026-10-18T14:45', end: '2026-10-18T15:00', reminders: [10] })]);
    status = 410;
    server.time.value = T0 + 40 * 60_000;
    expect(await server.calendar.reminders.tick()).toBe(0);
    expect(server.calendar.reminders.subscriptions()).toHaveLength(0);
  });

  it('ticks on the clock’s minutes, a moment early', () => {
    const minute = Date.UTC(2026, 10, 4, 13, 50);
    expect(nextTickIn(minute - 20_000)).toBe(20_000 - LEAD_MS);
    // Just rung for 13:50: the next is 13:51's.
    expect(nextTickIn(minute - LEAD_MS + 10)).toBe(60_000 - 10);
    expect(nextTickIn(minute + 5_000)).toBe(55_000 - LEAD_MS);
  });

  it('rings a minute’s reminders just before it, lives until they stop being worth it, and rings late after a stop only those still worth it', async () => {
    const sent: { ttl: string | null; urgency: string | null }[] = [];
    const pushFetch = (async (_url: string | URL, init?: RequestInit) => {
      const headers = new Headers(init!.headers);
      sent.push({ ttl: headers.get('TTL'), urgency: headers.get('Urgency') });
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    server = createTestServer({ pushFetch });
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    server.calendar.reminders.subscribe({ endpoint: 'https://push.example.org/send/def', keys: { p256dh: browser.getPublicKey().toString('base64url'), auth: Buffer.from('0011223344556677').toString('base64url') }, lang: 'fr', timeZone: 'Europe/Paris' });
    // At 14:20 Paris (T0 + 20 min), 10 minutes before 14:30.
    server.sync.push([event('rdv', { start: '2026-10-18T14:30', end: '2026-10-18T15:00', reminders: [10] })]);
    expect(await server.calendar.reminders.tick()).toBe(0);
    server.time.value = T0 + 20 * 60_000 - 1_000;
    expect(await server.calendar.reminders.tick()).toBe(1);
    // Until ten minutes after the start: 20 minutes and a second.
    expect(sent[0]).toEqual({ ttl: '1201', urgency: 'high' });
    server.time.value = T0 + 20 * 60_000 + 30_000;
    expect(await server.calendar.reminders.tick()).toBe(0);
    // Stopped from 14:21 to 15:10: the 14:35 reminder of a 14:45 event is stale, the 15:05 one of 16:00 still worth it.
    server.sync.push([event('stale', { start: '2026-10-18T14:45', end: '2026-10-18T15:00', reminders: [10] }), event('late', { start: '2026-10-18T16:00', end: '2026-10-18T17:00', reminders: [55] })]);
    server.time.value = T0 + 70 * 60_000;
    expect(await server.calendar.reminders.tick()).toBe(1);
  });
});
