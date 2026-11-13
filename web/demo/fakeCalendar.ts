/**
 * Agenda's routes as the demo's fake server answers them (`fakeServer.ts`): the events mentioning
 * something, the weather (made up from the day), an event read from words or from a link (the
 * device's own reading, or a fixed one), questions about the calendar, the holidays' countries and
 * regions (France's days, named in English as the demo's other records are), a subscription read again, the
 * browser's reminders (none in the demo), and Pages' pages made for Agenda (an event's notes, the
 * day's page), written into the store as the real server writes them.
 */
import { APPS } from '@unlease/core/apps';
import { createId } from '@unlease/core/services/ids';
import { keysBetween } from '@unlease/core/services/fractionalIndex';
import type { Fields, SyncRecord } from '@unlease/core/sync/record';
import { parseMentionsQuery } from '@unlease/core/sync/mentions';
import { HOLIDAYS_FEED_ID } from '@unlease/calendar/models/events';
import { eventsMentioning } from '@unlease/calendar/services/ask';
import { planFeed } from '@unlease/calendar/services/feeds';
import { holidayDrafts, holidayYears, type NagerHoliday } from '@unlease/calendar/services/holidays';
import { readQuickAdd } from '@unlease/calendar/services/quickAdd';
import { addDays, dayKey } from '@unlease/calendar/services/time';
import { eventFromRecord } from '@unlease/calendar/sync/entities';
import { FEED_CONNECT_PATH, parseCalendarAskRequest, parseFeedConnectRequest, parseFromLinkRequest, parseParseRequest } from '@unlease/calendar/sync/routes';
import { feedAddress } from '@unlease/calendar/services/feeds';
import { blockFields } from '@unlease/pages/sync/entities';
import { dailyPageLines, dayTitle, JOURNAL_WORDS, parseDailyRequest, parseFromEventRequest } from '@unlease/pages/sync/journal';

/** What the fake server lends these routes: its records, and its own write. */
export interface CalendarStore {
  readonly records: () => readonly SyncRecord[];
  readonly write: (type: string, id: string, patch: Fields) => void;
}

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

/** France's days for a year, as Nager.Date gives them (Easter's computed). */
function frenchDays(year: number): NagerHoliday[] {
  // Anonymous Gregorian algorithm (Meeus).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easter = dayKey(year, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
  const day = (date: string, localName: string, name: string, counties: string[] | null = null): NagerHoliday => ({ date, localName, name, countryCode: 'FR', global: counties === null, counties });
  return [
    day(`${year}-01-01`, 'Jour de l’an', 'New Year’s Day'),
    day(addDays(easter, -2), 'Vendredi saint', 'Good Friday', ['FR-57', 'FR-67', 'FR-68']),
    day(addDays(easter, 1), 'Lundi de Pâques', 'Easter Monday'),
    day(`${year}-05-01`, 'Fête du Travail', 'Labour Day'),
    day(`${year}-05-08`, 'Victoire 1945', 'Victory in Europe Day'),
    day(addDays(easter, 39), 'Ascension', 'Ascension Day'),
    day(addDays(easter, 50), 'Lundi de Pentecôte', 'Whit Monday'),
    day(`${year}-07-14`, 'Fête nationale', 'Bastille Day'),
    day(`${year}-08-15`, 'Assomption', 'Assumption Day'),
    day(`${year}-11-01`, 'Toussaint', 'All Saints’ Day'),
    day(`${year}-11-11`, 'Armistice 1918', 'Armistice Day'),
    day(`${year}-12-25`, 'Noël', 'Christmas Day'),
    day(`${year}-12-26`, 'Saint-Étienne', 'St. Stephen’s Day', ['FR-57', 'FR-67', 'FR-68']),
  ];
}

/** The holidays' calendar and its days, as the server keeps them (France only in the demo; another country leaves none), in English. */
export function writeHolidays(store: CalendarStore, country: string | null, region: string | null, now: number): void {
  const today = new Date(now).toISOString().slice(0, 10);
  const stored = store
    .records()
    .filter(record => record.type === 'calendarEvent' && record.fields.feedId === HOLIDAYS_FEED_ID)
    .map(record => ({ event: eventFromRecord(record), fields: record.fields }));
  // Named in English (Nager.Date's `name`), as the demo's other records are written.
  const days = (country === 'FR' ? holidayYears(today).flatMap(frenchDays) : []).map(day => ({ ...day, localName: day.name }));
  const plan = planFeed(holidayDrafts(days, region), stored, () => createId(now), now);
  if (country) {
    store.write('calendarFeed', HOLIDAYS_FEED_ID, { kind: 'holidays', name: `Public holidays · ${country === 'FR' ? 'France' : country}`, url: '', color: 'green', hidden: false, position: 'a0', refreshedAt: now, error: '', createdAt: now, deletedAt: null });
  } else if (store.records().some(record => record.type === 'calendarFeed' && record.id === HOLIDAYS_FEED_ID)) {
    store.write('calendarFeed', HOLIDAYS_FEED_ID, { deletedAt: now });
  }
  for (const write of plan.writes) store.write('calendarEvent', write.id, write.fields);
  for (const id of plan.removals) store.write('calendarEvent', id, { deletedAt: now });
}

/** A weather made up from the day: the same each time, never true. */
// What no map finds, as Open-Meteo's search answers: the day's weather falls to its next place.
const NOWHERE = /^(visio|video call|zoom|meet|teams|en ligne|online|t[ée]l[ée]phone|phone|salle .*)$/i;

function weatherFor(place: string): Response {
  if (!place.trim() || NOWHERE.test(place.trim())) return json({ place: '', days: [] });
  const today = new Date();
  const days = Array.from({ length: 16 }, (_, index) => {
    const day = addDays(today.toISOString().slice(0, 10), index);
    const seed = (Number(day.slice(8, 10)) * 7 + place.length) % 10;
    const code = [0, 1, 2, 3, 61, 63, 3, 2, 80, 95][seed]!;
    return { day, code, max: 12 + seed, min: 4 + Math.floor(seed / 2), rain: seed * 9 };
  });
  return json({ place: place.split(',')[0]!.trim(), days });
}

function topPages(records: readonly SyncRecord[]): string[] {
  return records
    .filter(record => record.type === 'block' && record.fields.parentId === null && record.fields.deletedAt === null)
    .map(record => String(record.fields.position))
    .sort();
}

/** Agenda's and Pages' routes for Agenda, or null for any other address. */
export function calendarRoute(store: CalendarStore, url: URL, method: string, body: unknown, apps: readonly string[]): Response | null {
  const path = url.pathname;
  const off = (app: 'calendar' | 'pages'): Response | null => (apps.includes(app) ? null : json({ error: `${APPS[app].name} n’est pas activé sur ce serveur` }, 404));
  if (path.startsWith('/api/calendar/')) {
    const refused = off('calendar');
    if (refused) return refused;
  }
  if (path === '/api/calendar/mentions' && method === 'GET') {
    const query = parseMentionsQuery(url.searchParams.get('type') ?? undefined, url.searchParams.get('ids') ?? undefined);
    if (!query) return json({ error: 'Invalid request' }, 400);
    const events = store
      .records()
      .filter(record => record.type === 'calendarEvent')
      .map(eventFromRecord);
    return json({ places: eventsMentioning(events, query.type, query.ids) });
  }
  if (path === '/api/calendar/weather' && method === 'GET') return weatherFor(url.searchParams.get('place') ?? '');
  if (path === '/api/calendar/parse' && method === 'POST') {
    const request = parseParseRequest(body);
    if (!request) return json({ error: 'Invalid request' }, 400);
    const read = readQuickAdd(request.text, request.now.slice(0, 10));
    return json({ proposal: { title: read.title || request.text, start: read.foundTime || read.foundDay ? read.start : `${addDays(request.now.slice(0, 10), 1)}T19:00`, end: read.foundTime || read.foundDay ? read.end : `${addDays(request.now.slice(0, 10), 1)}T20:00`, timeZone: request.timeZone, place: read.place, description: '', url: '' } });
  }
  if (path === '/api/calendar/from-link' && method === 'POST') {
    const request = parseFromLinkRequest(body);
    if (!request) return json({ error: 'Invalid request' }, 400);
    const link = store.records().find(record => record.type === 'link' && record.id === request.linkId);
    if (!link) return json({ error: 'Ce lien n’existe plus' }, 409);
    const day = addDays(request.now.slice(0, 10), 10);
    return json({ proposal: { title: String(link.fields.title || (request.lang === 'en' ? 'Event' : 'Événement')), start: `${day}T20:00`, end: `${day}T22:30`, timeZone: request.timeZone, place: 'Salle Pleyel, Paris', description: String(link.fields.summary ?? ''), url: String(link.fields.url ?? '') } });
  }
  if (path === '/api/calendar/ask' && method === 'POST') {
    const request = parseCalendarAskRequest(body);
    if (!request) return json({ error: 'Invalid request' }, 400);
    const lines = request.context.split('\n').filter(line => line >= request.now.slice(0, 10)).slice(0, 3);
    const english = request.lang === 'en';
    const next = lines.map(line => `• ${line}`).join('\n');
    if (english) return json({ answer: lines.length > 0 ? `In the demo, Claude doesn’t really answer. Your next events:\n${next}` : 'In the demo, Claude doesn’t really answer: nothing planned.' });
    return json({ answer: lines.length > 0 ? `Dans la démo, Claude ne répond pas vraiment. Vos prochains événements :\n${next}` : 'Dans la démo, Claude ne répond pas vraiment : rien de prévu.' });
  }
  if (path === '/api/calendar/holidays/countries' && method === 'GET') {
    return json({ countries: [{ code: 'FR', name: 'France' }, { code: 'BE', name: 'Belgium' }, { code: 'CH', name: 'Switzerland' }, { code: 'GB', name: 'United Kingdom' }, { code: 'US', name: 'United States' }, { code: 'DE', name: 'Germany' }] });
  }
  if (path === '/api/calendar/holidays/regions' && method === 'GET') return json({ regions: url.searchParams.get('country') === 'FR' ? ['FR-57', 'FR-67', 'FR-68'] : [] });
  if (path === FEED_CONNECT_PATH && method === 'POST') {
    // No network in the demo: an address that names CalDAV asks for a login, and any login opens it; any other address is an iCalendar one.
    const request = parseFeedConnectRequest(body);
    const address = request ? feedAddress(request.url) : null;
    if (!request || !address) return json({ error: 'Invalid calendar address' }, 400);
    if (!/dav/i.test(address)) return json({ status: 'ready', kind: 'ics', url: address, name: '' });
    if (!request.login) return json({ status: 'login' });
    return json({ status: 'ready', kind: 'caldav', url: address, name: '' });
  }
  const refresh = /^\/api\/calendar\/feeds\/([^/]+)\/refresh$/.exec(path);
  if (refresh && method === 'POST') {
    const now = Date.now();
    if (refresh[1] !== HOLIDAYS_FEED_ID) store.write('calendarFeed', decodeURIComponent(refresh[1]!), { refreshedAt: now, error: '' });
    return json({ ok: true });
  }
  if (path === '/api/calendar/push/key') return json({ error: 'Pas de rappels dans la démo' }, 501);
  if (path === '/api/calendar/push/subscriptions') return json({ ok: true });
  if (path === '/api/pages/from-event' && method === 'POST') {
    const refused = off('pages');
    if (refused) return refused;
    const request = parseFromEventRequest(body);
    if (!request) return json({ error: 'Invalid request' }, 400);
    const words = JOURNAL_WORDS[request.lang];
    const records = store.records();
    const found = records.find(record => record.type === 'block' && record.fields.kind === 'text' && record.fields.deletedAt === null && String(record.fields.text).includes(`{@event=${request.eventId}}`));
    if (found && typeof found.fields.parentId === 'string') return json({ pageId: found.fields.parentId, created: false });
    const now = Date.now();
    const pageId = createId(now);
    const tops = topPages(records);
    store.write('block', pageId, blockFields({ kind: 'page', parentId: null, position: keysBetween(tops.at(-1) ?? null, null, 1)[0]!, createdAt: now, text: request.title || words.untitled, trashedAt: null }));
    const date = request.start.length > 10 ? `{@date=${request.start.slice(0, 10)}T${request.start.slice(11, 13)}${request.start.slice(14, 16)}}` : `{@date=${request.start}}`;
    const lines = [
      { kind: 'text' as const, text: `${words.event} : {@event=${request.eventId}} · ${date}` },
      ...(request.contactIds.length > 0 ? [{ kind: 'text' as const, text: `${words.with} : ${request.contactIds.map(id => `{@contact=${id}}`).join(', ')}` }] : []),
      { kind: 'h2' as const, text: words.notes },
      { kind: 'text' as const, text: '' },
    ];
    const keys = keysBetween(null, null, lines.length);
    lines.forEach((line, at) => store.write('block', createId(now), blockFields({ ...line, parentId: pageId, position: keys[at]!, createdAt: now })));
    return json({ pageId, created: true });
  }
  if (path === '/api/pages/daily' && method === 'POST') {
    const refused = off('pages');
    if (refused) return refused;
    const request = parseDailyRequest(body);
    if (!request) return json({ error: 'Invalid request' }, 400);
    const words = JOURNAL_WORDS[request.lang];
    const records = store.records();
    const now = Date.now();
    let journal = records.find(record => record.type === 'block' && record.fields.kind === 'page' && record.fields.parentId === null && record.fields.deletedAt === null && record.fields.text === words.journal)?.id;
    if (!journal) {
      journal = createId(now);
      store.write('block', journal, blockFields({ kind: 'page', parentId: null, position: keysBetween(topPages(records).at(-1) ?? null, null, 1)[0]!, createdAt: now, text: words.journal, trashedAt: null }));
    }
    // The server's day page (`dailyPageLines`), titled as it titles it, in either language.
    const titles = new Set([dayTitle(request.day, 'fr'), dayTitle(request.day, 'en')]);
    const existing = records.find(record => record.type === 'block' && record.fields.kind === 'page' && record.fields.parentId === journal && record.fields.deletedAt === null && titles.has(String(record.fields.text)));
    if (existing) return json({ pageId: existing.id, created: false });
    const pageId = createId(now);
    store.write('block', pageId, blockFields({ kind: 'page', parentId: journal, position: keysBetween(null, null, 1)[0]!, createdAt: now, text: dayTitle(request.day, request.lang), trashedAt: null }));
    const lines = dailyPageLines(request.day, request.lang);
    const keys = keysBetween(null, null, lines.length);
    lines.forEach((line, at) => store.write('block', createId(now), blockFields({ ...line, parentId: pageId, position: keys[at]!, createdAt: now })));
    return json({ pageId, created: true });
  }
  return null;
}
