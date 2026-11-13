/**
 * Agenda's routes on the server (`server/src/apps/calendar`), behind the token like every route,
 * answered while Agenda is on: what each asks and answers, read the same way by both clients and the
 * server. The published calendar (`/ical/<secret>.ics`) is the only one outside `/api`: it carries
 * its own secret, so another calendar can subscribe to it.
 */
import { isLocale, type Locale } from '@unlease/core/i18n';
import { DAY_PATTERN, WALL_PATTERN } from '../models/events';
import { isDigestTime } from '../services/digest';

export const WEATHER_PATH = '/api/calendar/weather';
export const PARSE_PATH = '/api/calendar/parse';
export const FROM_LINK_PATH = '/api/calendar/from-link';
export const ASK_PATH = '/api/calendar/ask';
export const COUNTRIES_PATH = '/api/calendar/holidays/countries';
export const REGIONS_PATH = '/api/calendar/holidays/regions';
export const PUSH_KEY_PATH = '/api/calendar/push/key';
export const PUSH_SUBSCRIPTIONS_PATH = '/api/calendar/push/subscriptions';

/** `POST /api/calendar/feeds/<id>/refresh`: the server reads the address again now. */
export const feedRefreshPath = (id: string): string => `/api/calendar/feeds/${encodeURIComponent(id)}/refresh`;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isWhen = (value: unknown): value is string => typeof value === 'string' && (DAY_PATTERN.test(value) || WALL_PATTERN.test(value));

/**
 * `POST /api/calendar/feeds/connect`: an address tried before it is followed. The server reads it as
 * an iCalendar address; when it asks for a login and one is given, it finds the calendar over
 * CalDAV (from the calendar's address, the account's, or the server's) and keeps that login under
 * the calendar's id, for itself only. The device then writes the calendar (`ready`), asks for a login
 * (`login`), or asks which calendar (`choose`); a failure is an `error` in French, as `feed.error`.
 * Given the id of a calendar already followed, it changes that calendar's login and reads it again.
 */
export const FEED_CONNECT_PATH = '/api/calendar/feeds/connect';

/** A login's bounds: an address or a name, and a password (an app's password, often). */
export const FEED_LOGIN_LIMITS = { username: 320, password: 1000 } as const;

export interface FeedConnectRequest {
  /** The calendar's id: minted by the device for a new one, or one already followed. */
  readonly id: string;
  readonly url: string;
  /** Both or neither. */
  readonly login?: { readonly username: string; readonly password: string };
}

export type FeedConnectResponse =
  /** It can be followed: as an iCalendar address, or over CalDAV at `url` (the calendar found), with its own `name` ('' when it gives none). */
  | { readonly status: 'ready'; readonly kind: 'ics' | 'caldav'; readonly url: string; readonly name: string }
  /** The address asks for a login. */
  | { readonly status: 'login' }
  /** The login opens several calendars: one is chosen, and asked again by its address. */
  | { readonly status: 'choose'; readonly calendars: readonly { readonly url: string; readonly name: string }[] };

const isId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);

export function parseFeedConnectRequest(value: unknown): FeedConnectRequest | null {
  if (!isObject(value) || !isId(value.id) || typeof value.url !== 'string' || !value.url.trim() || value.url.length > 4000) return null;
  if (value.login === undefined || value.login === null) return { id: value.id, url: value.url.trim() };
  const login = value.login;
  if (!isObject(login) || typeof login.username !== 'string' || typeof login.password !== 'string') return null;
  const username = login.username.trim();
  if (!username || username.length > FEED_LOGIN_LIMITS.username || !login.password || login.password.length > FEED_LOGIN_LIMITS.password) return null;
  return { id: value.id, url: value.url.trim(), login: { username, password: login.password } };
}

export function parseFeedConnectResponse(value: unknown): FeedConnectResponse | null {
  if (!isObject(value)) return null;
  if (value.status === 'login') return { status: 'login' };
  if (value.status === 'ready' && (value.kind === 'ics' || value.kind === 'caldav') && typeof value.url === 'string') {
    return { status: 'ready', kind: value.kind, url: value.url, name: typeof value.name === 'string' ? value.name : '' };
  }
  if (value.status === 'choose' && Array.isArray(value.calendars)) {
    const calendars = value.calendars.flatMap(entry => (isObject(entry) && typeof entry.url === 'string' ? [{ url: entry.url, name: typeof entry.name === 'string' ? entry.name : '' }] : []));
    return calendars.length > 0 ? { status: 'choose', calendars } : null;
  }
  return null;
}

// ── weather ────────────────────────────────────────────────────────────────

export interface WeatherDay {
  readonly day: string;
  /** WMO's code (`services/weather`). */
  readonly code: number;
  readonly max: number;
  readonly min: number;
  /** Chance of rain, 0 to 100. */
  readonly rain: number;
}

export interface WeatherResponse {
  /** The place found (« Lyon, France »), '' when none was. */
  readonly place: string;
  readonly days: readonly WeatherDay[];
}

export const weatherPath = (place: string): string => `${WEATHER_PATH}?place=${encodeURIComponent(place)}`;

export function parseWeatherResponse(value: unknown): WeatherResponse | null {
  if (!isObject(value) || !Array.isArray(value.days)) return null;
  const days = value.days.flatMap((entry): WeatherDay[] => {
    if (!isObject(entry) || typeof entry.day !== 'string' || !DAY_PATTERN.test(entry.day)) return [];
    const number = (key: string): number => (typeof entry[key] === 'number' && Number.isFinite(entry[key]) ? (entry[key] as number) : 0);
    return [{ day: entry.day, code: number('code'), max: number('max'), min: number('min'), rain: number('rain') }];
  });
  return { place: typeof value.place === 'string' ? value.place : '', days };
}

// ── an event read by Claude (typed words, a saved link) ───────────────────

/** What Claude proposes: the form opens with it, nothing is written before the person saves. */
export interface EventProposal {
  readonly title: string;
  readonly start: string;
  readonly end: string;
  /** IANA zone of a timed event ('' all day). */
  readonly timeZone: string;
  readonly place: string;
  readonly description: string;
  readonly url: string;
}

export function parseEventProposal(value: unknown): EventProposal | null {
  if (!isObject(value) || typeof value.title !== 'string' || !isWhen(value.start) || !isWhen(value.end)) return null;
  const allDay = DAY_PATTERN.test(value.start);
  if (allDay !== DAY_PATTERN.test(value.end)) return null;
  return {
    title: value.title.slice(0, 1000),
    start: value.start,
    end: value.end,
    timeZone: allDay ? '' : typeof value.timeZone === 'string' && /^[A-Za-z0-9_+\-/]{1,64}$/.test(value.timeZone) ? value.timeZone : '',
    place: typeof value.place === 'string' ? value.place.slice(0, 1000) : '',
    description: typeof value.description === 'string' ? value.description.slice(0, 5000) : '',
    url: typeof value.url === 'string' && /^https?:\/\//.test(value.url) ? value.url.slice(0, 4000) : '',
  };
}

/** `POST /api/calendar/parse`: words the device could not read. */
export interface ParseRequest {
  readonly text: string;
  readonly lang: Locale;
  /** The device's day and time and zone, so « demain 20h » lands right. */
  readonly now: string;
  readonly timeZone: string;
}

/** `POST /api/calendar/from-link`: a link of Carnet's, read again for its date and place. */
export interface FromLinkRequest {
  readonly linkId: string;
  readonly lang: Locale;
  readonly now: string;
  readonly timeZone: string;
}

/** The answer of both: a proposal, or null when there is no event to find in it. */
export interface ProposalResponse {
  readonly proposal: EventProposal | null;
}

export function parseParseRequest(value: unknown): ParseRequest | null {
  if (!isObject(value) || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 2000) return null;
  if (typeof value.now !== 'string' || !WALL_PATTERN.test(value.now)) return null;
  return { text: value.text.trim(), lang: isLocale(value.lang) ? value.lang : 'fr', now: value.now, timeZone: typeof value.timeZone === 'string' ? value.timeZone.slice(0, 64) : '' };
}

export function parseFromLinkRequest(value: unknown): FromLinkRequest | null {
  if (!isObject(value) || typeof value.linkId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.linkId)) return null;
  if (typeof value.now !== 'string' || !WALL_PATTERN.test(value.now)) return null;
  return { linkId: value.linkId, lang: isLocale(value.lang) ? value.lang : 'fr', now: value.now, timeZone: typeof value.timeZone === 'string' ? value.timeZone.slice(0, 64) : '' };
}

export function parseProposalResponse(value: unknown): ProposalResponse {
  return { proposal: isObject(value) ? parseEventProposal(value.proposal) : null };
}

// ── questions about the calendar ───────────────────────────────────────────

export interface CalendarAskTurn {
  readonly question: string;
  readonly answer: string;
}

/** `POST /api/calendar/ask`: the events around now, built on the device (`services/ask`), and the question. */
export interface CalendarAskRequest {
  readonly question: string;
  readonly context: string;
  readonly lang: Locale;
  readonly now: string;
  readonly history: readonly CalendarAskTurn[];
}

export interface CalendarAskResponse {
  readonly answer: string;
}

/** The most a question may send of the calendar. */
export const ASK_CONTEXT_MAX = 150_000;

export function parseCalendarAskRequest(value: unknown): CalendarAskRequest | null {
  if (!isObject(value) || typeof value.question !== 'string' || !value.question.trim() || value.question.length > 2000) return null;
  if (typeof value.context !== 'string' || value.context.length > ASK_CONTEXT_MAX) return null;
  if (typeof value.now !== 'string' || !WALL_PATTERN.test(value.now)) return null;
  const history = Array.isArray(value.history)
    ? value.history
        .filter((turn): turn is { question: string; answer: string } => isObject(turn) && typeof turn.question === 'string' && typeof turn.answer === 'string')
        .slice(-6)
        .map(turn => ({ question: turn.question.slice(0, 2000), answer: turn.answer.slice(0, 8000) }))
    : [];
  return { question: value.question.trim(), context: value.context, lang: isLocale(value.lang) ? value.lang : 'fr', now: value.now, history };
}

export function parseCalendarAskResponse(value: unknown): CalendarAskResponse | null {
  return isObject(value) && typeof value.answer === 'string' ? { answer: value.answer } : null;
}

// ── holidays ───────────────────────────────────────────────────────────────

export interface HolidayCountry {
  readonly code: string;
  readonly name: string;
}

export function parseCountries(value: unknown): HolidayCountry[] {
  const list = isObject(value) && Array.isArray(value.countries) ? value.countries : [];
  return list.flatMap(entry => (isObject(entry) && typeof entry.code === 'string' && /^[A-Z]{2}$/.test(entry.code) && typeof entry.name === 'string' ? [{ code: entry.code, name: entry.name }] : []));
}

export const regionsPath = (country: string): string => `${REGIONS_PATH}?country=${encodeURIComponent(country)}`;

export function parseRegions(value: unknown): string[] {
  const list = isObject(value) && Array.isArray(value.regions) ? value.regions : [];
  return list.filter((entry): entry is string => typeof entry === 'string' && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(entry));
}

// ── push notifications (the web's reminders) ──────────────────────────────

/** The morning digest a browser asked for (`services/digest`): when, and what of the day it reads, as its Réglages say. */
export interface PushDigest {
  /** `07:30`, one of `DIGEST_TIMES`, in the browser's zone. */
  readonly at: string;
  /** Pushed on a day with nothing too. */
  readonly empty: boolean;
  readonly birthdays: boolean;
  readonly noteReminders: boolean;
  readonly pageDates: boolean;
  readonly twelveHours: boolean;
}

/** A browser's push subscription (the Push API's), with what the server needs to word and time its reminders. */
export interface PushSubscriptionRequest {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
  readonly lang: Locale;
  /** The browser's zone: an all-day event's reminder rings at its midnight there. */
  readonly timeZone: string;
  /** The events' reminders pushed (false: the digest alone); a browser that never said wants them. */
  readonly reminders?: boolean;
  /** The morning digest, when asked for. */
  readonly digest?: PushDigest | null;
}

function parsePushDigest(value: unknown): PushDigest | null {
  if (!isObject(value) || !isDigestTime(value.at)) return null;
  const flag = (key: string, fallback: boolean): boolean => (typeof value[key] === 'boolean' ? (value[key] as boolean) : fallback);
  return { at: value.at, empty: flag('empty', false), birthdays: flag('birthdays', true), noteReminders: flag('noteReminders', true), pageDates: flag('pageDates', false), twelveHours: flag('twelveHours', false) };
}

export function parsePushSubscription(value: unknown): PushSubscriptionRequest | null {
  if (!isObject(value) || typeof value.endpoint !== 'string' || !/^https:\/\/\S{8,2000}$/.test(value.endpoint)) return null;
  const keys = value.keys;
  if (!isObject(keys) || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return null;
  if (!/^[A-Za-z0-9_-]{40,200}={0,2}$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]{10,60}={0,2}$/.test(keys.auth)) return null;
  return {
    endpoint: value.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    lang: isLocale(value.lang) ? value.lang : 'fr',
    timeZone: typeof value.timeZone === 'string' ? value.timeZone.slice(0, 64) : '',
    reminders: value.reminders !== false,
    digest: parsePushDigest(value.digest),
  };
}

/** What a reminder's push carries (the service worker shows it). */
export interface PushReminder {
  readonly title: string;
  readonly body: string;
  /** Where a tap opens: `/agenda/event/<id>?at=<occurrence>`. */
  readonly path: string;
  readonly tag: string;
}
