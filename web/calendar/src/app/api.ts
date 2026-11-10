/**
 * The server's routes Agenda calls: its own (`@unlease/calendar/sync/routes`: the weather, an event
 * read by Claude from words, questions about the calendar, the holidays' countries and regions, a
 * subscription read again, the browser's reminders), Pages' (an event's notes, the day's page),
 * Carnet's (a gift idea) and every app's « where is this mentioned ». Each throws `SyncError` with the
 * server's own words when it refuses (an app turned off answers 404 with its name).
 */
import type { AppId } from '@unlease/core/apps';
import { authHeader } from '@unlease/core/sync/protocol';
import { GIFTS_PATH, isGiftLinkResponse, type GiftLinkRequest, type GiftLinkResponse } from '@unlease/core/sync/gifts';
import { mentionsPath, parseMentionsResponse, type MentionsResponse } from '@unlease/core/sync/mentions';
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
  PUSH_KEY_PATH,
  PUSH_SUBSCRIPTIONS_PATH,
  regionsPath,
  weatherPath,
  type CalendarAskRequest,
  type CalendarAskResponse,
  type HolidayCountry,
  type ParseRequest,
  type ProposalResponse,
  type PushSubscriptionRequest,
  type WeatherResponse,
} from '@unlease/calendar/sync/routes';
import { DAILY_PATH, FROM_EVENT_PATH, parsePageMade, type DailyRequest, type FromEventRequest, type PageMade } from '@unlease/pages/sync/journal';

import type { ServerConfig } from '@shared/app/store/settings';
import { getJson, postJson, SyncError } from '@shared/app/sync/transport';

export function fetchMentions(config: ServerConfig, app: AppId, type: string, ids: readonly string[], signal?: AbortSignal): Promise<MentionsResponse> {
  return getJson(config, mentionsPath(app, type, ids), parseMentionsResponse, signal);
}

export function fetchWeather(config: ServerConfig, place: string, signal?: AbortSignal): Promise<WeatherResponse> {
  return getJson(config, weatherPath(place), parseWeatherResponse, signal);
}

export function askParse(config: ServerConfig, body: ParseRequest, signal?: AbortSignal): Promise<ProposalResponse> {
  return postJson(config, PARSE_PATH, body, parseProposalResponse, signal);
}

export function askCalendar(config: ServerConfig, body: CalendarAskRequest, signal?: AbortSignal): Promise<CalendarAskResponse> {
  return postJson(config, ASK_PATH, body, parseCalendarAskResponse, signal);
}

export function fetchCountries(config: ServerConfig, signal?: AbortSignal): Promise<HolidayCountry[]> {
  return getJson(config, COUNTRIES_PATH, value => parseCountries(value), signal);
}

export function fetchRegions(config: ServerConfig, country: string, signal?: AbortSignal): Promise<string[]> {
  return getJson(config, regionsPath(country), value => parseRegions(value), signal);
}

/** Asks the server to read a subscribed calendar again now. */
export function refreshFeed(config: ServerConfig, id: string): Promise<true> {
  return postJson(config, feedRefreshPath(id), {}, () => true);
}

export function makeEventPage(config: ServerConfig, body: FromEventRequest): Promise<PageMade> {
  return postJson(config, FROM_EVENT_PATH, body, parsePageMade);
}

export function makeDailyPage(config: ServerConfig, body: DailyRequest): Promise<PageMade> {
  return postJson(config, DAILY_PATH, body, parsePageMade);
}

export function addGiftIdea(config: ServerConfig, body: GiftLinkRequest, signal?: AbortSignal): Promise<GiftLinkResponse> {
  return postJson(config, GIFTS_PATH, body, value => (isGiftLinkResponse(value) ? value : null), signal);
}

export function fetchPushKey(config: ServerConfig): Promise<string> {
  return getJson(config, PUSH_KEY_PATH, value => {
    const key = (value as { publicKey?: unknown } | null)?.publicKey;
    return typeof key === 'string' && key ? key : null;
  });
}

export function savePushSubscription(config: ServerConfig, body: PushSubscriptionRequest): Promise<true> {
  return postJson(config, PUSH_SUBSCRIPTIONS_PATH, body, () => true);
}

/** Forgets this browser's subscription on the server (nothing to wait for if it cannot). */
export async function dropPushSubscription(config: ServerConfig, endpoint: string): Promise<void> {
  const response = await fetch(`${config.url}${PUSH_SUBSCRIPTIONS_PATH}`, {
    method: 'DELETE',
    headers: { ...authHeader(config.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok && response.status !== 404) throw new SyncError('http', response.statusText, response.status);
}
