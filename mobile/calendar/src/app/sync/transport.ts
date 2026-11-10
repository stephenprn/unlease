/**
 * Agenda's routes on the server (the weather, Claude reading typed words, questions about the
 * calendar, a subscription read again, the holidays' countries) and those of the other apps it asks
 * (where an event is mentioned, a meeting's page or the day's page in Pages, a gift idea for Carnet),
 * over the suite's transport (`@shared/app/sync/transport`), which this file hands on whole.
 */
import type { AppId } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { GIFTS_PATH, isGiftLinkResponse, type GiftLinkRequest, type GiftLinkResponse } from '@unlease/core/sync/gifts';
import { mentionsPath, parseMentionsResponse, type MentionPlace } from '@unlease/core/sync/mentions';
import { authHeader } from '@unlease/core/sync/protocol';
import {
  ASK_PATH,
  COUNTRIES_PATH,
  feedRefreshPath,
  PARSE_PATH,
  parseCalendarAskResponse,
  parseCountries,
  parseProposalResponse,
  parseRegions,
  parseWeatherResponse,
  regionsPath,
  weatherPath,
  type CalendarAskRequest,
  type CalendarAskResponse,
  type HolidayCountry,
  type ParseRequest,
  type ProposalResponse,
  type WeatherResponse,
} from '@unlease/calendar/sync/routes';
import { DAILY_PATH, FROM_EVENT_PATH, parsePageMade, type DailyRequest, type FromEventRequest } from '@unlease/pages/sync/journal';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { askServer, SyncError } from '@shared/app/sync/transport';

export * from '@shared/app/sync/transport';

const GET_TIMEOUT_MS = 15_000;

/** A GET on the server, its answer read by `parse`; null for a 404 (the app off, nothing found). */
async function getFrom<T>(config: ServerConfig, path: string, parse: (value: unknown) => T, signal?: AbortSignal): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GET_TIMEOUT_MS);
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    let response: Response;
    try {
      response = await fetch(`${config.url}${path}`, { method: 'GET', headers: authHeader(config.token), signal: controller.signal });
    } catch {
      throw new SyncError('network', t('Serveur injoignable'));
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new SyncError('http', t('Le serveur a répondu {status}', { status: response.status }), response.status);
    return parse(await response.json());
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** `GET /api/<app>/mentions`: that app's places mentioning one of `ids`. Empty while the app is off. */
export async function fetchMentions(config: ServerConfig, app: AppId, type: string, ids: readonly string[], signal?: AbortSignal): Promise<readonly MentionPlace[]> {
  return (await getFrom(config, mentionsPath(app, type, ids), value => parseMentionsResponse(value).places, signal)) ?? [];
}

/** `POST /api/notes/gifts`: a product's link kept in Carnet's « Cadeaux » collection, for someone. */
export function addGiftLink(config: ServerConfig, request: GiftLinkRequest, signal?: AbortSignal): Promise<GiftLinkResponse> {
  return askServer(config, GIFTS_PATH, request, value => (isGiftLinkResponse(value) ? value : null), signal);
}

/** `GET /api/calendar/weather`: the days ahead at a place; null when it is not found or Agenda is off. */
export function fetchWeather(config: ServerConfig, place: string, signal?: AbortSignal): Promise<WeatherResponse | null> {
  return getFrom(config, weatherPath(place), parseWeatherResponse, signal);
}

/** `POST /api/calendar/parse`: Claude reads words the phone could not. */
export function parseWithClaude(config: ServerConfig, request: ParseRequest, signal?: AbortSignal): Promise<ProposalResponse> {
  return askServer(config, PARSE_PATH, request, parseProposalResponse, signal);
}

/** `POST /api/calendar/ask`: a question about the calendar. */
export function askCalendar(config: ServerConfig, request: CalendarAskRequest, signal?: AbortSignal): Promise<CalendarAskResponse> {
  return askServer(config, ASK_PATH, request, parseCalendarAskResponse, signal);
}

/** `POST /api/calendar/feeds/<id>/refresh`: the server reads the address again now. */
export function refreshFeed(config: ServerConfig, id: string): Promise<true> {
  return askServer(config, feedRefreshPath(id), {}, () => true as const);
}

export async function fetchCountries(config: ServerConfig, signal?: AbortSignal): Promise<readonly HolidayCountry[]> {
  return (await getFrom(config, COUNTRIES_PATH, parseCountries, signal)) ?? [];
}

export async function fetchRegions(config: ServerConfig, country: string, signal?: AbortSignal): Promise<readonly string[]> {
  return (await getFrom(config, regionsPath(country), parseRegions, signal)) ?? [];
}

/** `POST /api/pages/from-event`: Pages' module writes the meeting's page (its date, its guests, the event mentioned). 404 while Pages is off. */
export async function createMeetingPage(config: ServerConfig, request: FromEventRequest): Promise<string> {
  return (await askServer(config, FROM_EVENT_PATH, request, parsePageMade)).pageId;
}

/** `POST /api/pages/daily`: the day's page in Pages' « Journal », found or made. */
export async function dailyPage(config: ServerConfig, request: DailyRequest): Promise<string> {
  return (await askServer(config, DAILY_PATH, request, parsePageMade)).pageId;
}
