/**
 * Public holidays from Nager.Date (https://date.nager.at, open data, no key): a country's days for a
 * year (`GET /api/v3/PublicHolidays/{year}/{country}`), and the regions it has (`counties`, ISO 3166-2:
 * `FR-67`, Alsace and Moselle's Good Friday and St Stephen's day). The server fetches them when the
 * country is set and each new year, and keeps them as the `holidays` calendar's events (`feeds`).
 */
import { t } from '@unlease/core/i18n';
import { markupFromPlain } from '@unlease/core/services/richText';
import { foldText } from '@unlease/core/services/search';
import { countryName } from '@unlease/core/services/setup';
import { EVENT_LIMITS, HOLIDAYS_FEED_ID, type CalendarFeed } from '../models/events';
import type { FeedDraft } from './feeds';
import { feedKey } from './feeds';
import { addDays } from './time';

export const NAGER_BASE = 'https://date.nager.at/api/v3';

/** One day as Nager.Date gives it. */
export interface NagerHoliday {
  readonly date: string;
  readonly localName: string;
  readonly name: string;
  readonly countryCode: string;
  readonly global: boolean;
  readonly counties: readonly string[] | null;
}

/** A country Nager.Date knows. */
export interface NagerCountry {
  readonly countryCode: string;
  readonly name: string;
}

export function parseNagerHolidays(value: unknown): NagerHoliday[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const raw = entry as Record<string, unknown> | null;
    if (!raw || typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) return [];
    return [
      {
        date: raw.date,
        localName: typeof raw.localName === 'string' ? raw.localName : '',
        name: typeof raw.name === 'string' ? raw.name : '',
        countryCode: typeof raw.countryCode === 'string' ? raw.countryCode : '',
        global: raw.global !== false,
        counties: Array.isArray(raw.counties) ? raw.counties.filter((county): county is string => typeof county === 'string') : null,
      },
    ];
  });
}

export function parseNagerCountries(value: unknown): NagerCountry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const raw = entry as Record<string, unknown> | null;
    return raw && typeof raw.countryCode === 'string' && /^[A-Z]{2}$/.test(raw.countryCode) && typeof raw.name === 'string' ? [{ countryCode: raw.countryCode, name: raw.name }] : [];
  });
}

/** The regions a country's days name (`FR-57`, `FR-67`, `FR-68`), sorted. */
export function holidayRegions(days: readonly NagerHoliday[]): string[] {
  return [...new Set(days.flatMap(day => day.counties ?? []))].sort();
}

const slug = (value: string): string =>
  foldText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/**
 * The days the calendar shows: the country's own, and the region's when one is set. Named in the
 * country's language (« Lundi de Pâques »), its English name in the description when it differs.
 */
export function holidayDrafts(days: readonly NagerHoliday[], region: string | null): FeedDraft[] {
  const out = new Map<string, FeedDraft>();
  for (const day of days) {
    if (!day.global && !(region && day.counties?.includes(region))) continue;
    const uid = `holiday-${day.countryCode}-${day.date}-${slug(day.name || day.localName)}@date.nager.at`;
    const key = feedKey(uid, '');
    const title = day.localName || day.name;
    out.set(key, {
      key,
      uid,
      recurrenceId: '',
      fields: {
        title,
        description: day.name && day.name !== title ? markupFromPlain(day.name, EVENT_LIMITS.description) : '',
        place: '',
        start: day.date,
        end: addDays(day.date, 1),
        timeZone: '',
        rrule: '',
        exdates: [],
        originalStart: '',
        reminders: [],
        labelIds: [],
        contactIds: [],
        files: [],
        feedId: HOLIDAYS_FEED_ID,
        uid,
        url: '',
        color: null,
        trashedAt: null,
      },
    });
  }
  return [...out.values()];
}

/** The years the server keeps holidays for, around today: last year, this one and the next two. */
export function holidayYears(today: string): number[] {
  const year = Number(today.slice(0, 4));
  return [year - 1, year, year + 1, year + 2];
}

/** The holidays calendar's address: where its days come from, a country or a region (`nager:FR`, `nager:DE-BY`). */
export function holidaysAddress(code: string): string {
  return `nager:${code}`;
}

/**
 * A calendar's name as shown: the holidays' said in the interface's language from their country
 * (« Jours fériés · Allemagne (DE-BY) », « Public holidays · Germany (DE-BY) »), any other as it was
 * given. A holidays calendar from a server that did not say its country keeps its stored name.
 */
export function feedName(feed: Pick<CalendarFeed, 'kind' | 'name' | 'url'>): string {
  const from = feed.kind === 'holidays' ? /^nager:([A-Z]{2})(?:-[A-Z0-9]{1,3})?$/.exec(feed.url) : null;
  if (!from) return feed.name;
  const region = feed.url.length > 'nager:XX'.length ? feed.url.slice('nager:'.length) : null;
  const country = countryName(from[1]!);
  return region ? t('Public holidays · {country} ({region})', { country, region }) : t('Public holidays · {country}', { country });
}
