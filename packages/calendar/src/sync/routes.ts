/**
 * Agenda's routes on the server (`server/src/apps/calendar`), behind the token like every route,
 * answered while Agenda is on: what each asks and answers, read the same way by both clients and the
 * server. The published calendar (`/ical/<secret>.ics`) is the only one outside `/api`: it carries
 * its own secret, so another calendar can subscribe to it.
 */
import { isLocale, type Locale } from '@unlease/core/i18n';
import { DAY_PATTERN, WALL_PATTERN } from '../models/events';

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

/** A browser's push subscription (the Push API's), with what the server needs to word and time its reminders. */
export interface PushSubscriptionRequest {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
  readonly lang: Locale;
  /** The browser's zone: an all-day event's reminder rings at its midnight there. */
  readonly timeZone: string;
}

export function parsePushSubscription(value: unknown): PushSubscriptionRequest | null {
  if (!isObject(value) || typeof value.endpoint !== 'string' || !/^https:\/\/\S{8,2000}$/.test(value.endpoint)) return null;
  const keys = value.keys;
  if (!isObject(keys) || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return null;
  if (!/^[A-Za-z0-9_-]{40,200}={0,2}$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]{10,60}={0,2}$/.test(keys.auth)) return null;
  return { endpoint: value.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, lang: isLocale(value.lang) ? value.lang : 'fr', timeZone: typeof value.timeZone === 'string' ? value.timeZone.slice(0, 64) : '' };
}

/** What a reminder's push carries (the service worker shows it). */
export interface PushReminder {
  readonly title: string;
  readonly body: string;
  /** Where a tap opens: `/agenda/event/<id>?at=<occurrence>`. */
  readonly path: string;
  readonly tag: string;
}
