/**
 * The public holidays (Agenda's « Jours fériés »): the country and region the Administration set
 * (`ServerSettings.calendar.holidays`), fetched from Nager.Date (open data, no key) for last year,
 * this one and the next two, and kept as the `holidays` calendar's events, the server's own calendar
 * (a fixed id only it makes). Fetched again when the country changes, every month, and when a year
 * turns; with no country, the calendar and its days go.
 */
import { HOLIDAYS_FEED_ID } from '@unlease/calendar/models/events';
import { holidayDrafts, holidayRegions, holidaysAddress, holidayYears, NAGER_BASE, parseNagerCountries, parseNagerHolidays, type NagerHoliday } from '@unlease/calendar/services/holidays';
import { instantToDay } from '@unlease/calendar/services/time';
import type { HolidayCountry } from '@unlease/calendar/sync/routes';
import { countryName } from '@unlease/core/services/setup';
import { log } from '../../log';
import type { Fetcher } from '../../reading/fetcher';
import type { HolidaysConfig, SettingsStore } from '../../settings/store';
import { refuse, type Refusal } from '../../settings/update';
import type { RecordStore } from '../../sync/records';
import type { SyncService } from '../../sync/service';
import { applyFeedPlan, dropFeedEvents } from './feeds';

const DAY = 86_400_000;
/** Fetched again after a month, so a day Nager.Date corrects comes too. */
const REFRESH_MS = 30 * DAY;
const COUNTRIES_TTL = 7 * DAY;
const REGIONS_TTL = DAY;

export class NagerUnreachable extends Error {}
export class NagerUnknown extends Error {}

export interface HolidayKeeperOptions {
  readonly sync: SyncService;
  readonly records: RecordStore;
  readonly settings: SettingsStore;
  readonly fetcher: Fetcher;
  readonly now: () => number;
}

export class HolidayKeeper {
  private countries: { readonly at: number; readonly list: HolidayCountry[] } | null = null;
  private readonly years = new Map<string, { readonly at: number; readonly days: NagerHoliday[] }>();
  private running: Promise<void> | null = null;

  constructor(private readonly options: HolidayKeeperOptions) {}

  private async getJson(path: string): Promise<unknown> {
    let response;
    try {
      response = await this.options.fetcher.fetch(`${NAGER_BASE}${path}`, { headers: { accept: 'application/json' }, maxBytes: 2 * 1024 * 1024, timeoutMs: 20_000 });
    } catch {
      throw new NagerUnreachable('Nager.Date injoignable');
    }
    if (response.status === 404 || response.status === 204) throw new NagerUnknown('Nager.Date ne connaît pas ce pays');
    if (response.status < 200 || response.status >= 300) throw new NagerUnreachable('Nager.Date injoignable');
    try {
      return JSON.parse(response.body.toString('utf8'));
    } catch {
      throw new NagerUnreachable('Nager.Date injoignable');
    }
  }

  /** A country's days for a year (kept a day). */
  async year(country: string, year: number): Promise<NagerHoliday[]> {
    const key = `${country}:${year}`;
    const kept = this.years.get(key);
    if (kept && this.options.now() - kept.at < REGIONS_TTL) return kept.days;
    const days = parseNagerHolidays(await this.getJson(`/PublicHolidays/${year}/${country}`));
    if (days.length === 0) throw new NagerUnknown('Nager.Date ne connaît pas ce pays');
    this.years.set(key, { at: this.options.now(), days });
    return days;
  }

  /** The countries Nager.Date knows, by name (kept a week). */
  async countryList(): Promise<HolidayCountry[]> {
    if (this.countries && this.options.now() - this.countries.at < COUNTRIES_TTL) return this.countries.list;
    const list = parseNagerCountries(await this.getJson('/AvailableCountries'))
      .map(country => ({ code: country.countryCode, name: country.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    this.countries = { at: this.options.now(), list };
    return list;
  }

  /** The regions this year's days name for a country. */
  async regions(country: string): Promise<string[]> {
    return holidayRegions(await this.year(country, Number(instantToDay(this.options.now(), 'UTC').slice(0, 4))));
  }

  /** The settings' check: the country known at Nager.Date, the region one of its own. */
  check = async (holidays: HolidaysConfig): Promise<Refusal | null> => {
    if (!holidays.country) return null;
    try {
      const regions = await this.regions(holidays.country);
      if (holidays.region && !regions.includes(holidays.region)) return refuse(400, 'Région inconnue pour ce pays');
      return null;
    } catch (error) {
      return error instanceof NagerUnknown ? refuse(400, error.message) : refuse(502, 'Nager.Date injoignable');
    }
  };

  /** The holidays brought in line with the settings now (a run under way is joined). */
  sync(): Promise<void> {
    this.running ??= this.update()
      .catch(error => log.error('holidays failed', { error }))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  /** When they are due: never fetched, a month old, or from another year. */
  syncIfDue(): Promise<void> {
    const { country } = this.options.settings.holidays();
    const feed = this.options.records.get('calendarFeed', HOLIDAYS_FEED_ID);
    const live = feed && typeof feed.fields.deletedAt !== 'number';
    if (!country) return live ? this.sync() : Promise.resolve();
    const refreshedAt = typeof feed?.fields.refreshedAt === 'number' ? feed.fields.refreshedAt : 0;
    const now = this.options.now();
    const due = !live || now - refreshedAt >= REFRESH_MS || new Date(refreshedAt).getUTCFullYear() !== new Date(now).getUTCFullYear();
    return due ? this.sync() : Promise.resolve();
  }

  private async update(): Promise<void> {
    const { sync, records, settings } = this.options;
    const now = this.options.now();
    const { country, region } = settings.holidays();
    if (!country) {
      dropFeedEvents(sync, records, HOLIDAYS_FEED_ID, now);
      sync.apply([{ type: 'calendarFeed', id: HOLIDAYS_FEED_ID, patch: current => (typeof current.fields.deletedAt === 'number' ? null : { deletedAt: now }) }]);
      return;
    }
    const name = `Jours fériés · ${countryName(country)}${region ? ` (${region})` : ''}`;
    // Where they come from (`nager:FR`, `nager:DE-BY`): each device names them in its own language (`feedName`).
    const url = holidaysAddress(region ?? country);
    let days: NagerHoliday[];
    try {
      days = (await Promise.all(holidayYears(instantToDay(now, 'UTC')).map(year => this.year(country, year).catch(error => (error instanceof NagerUnknown ? [] : Promise.reject(error)))))).flat();
    } catch (error) {
      sync.apply([{ type: 'calendarFeed', id: HOLIDAYS_FEED_ID, patch: current => (current.seq > 0 && typeof current.fields.deletedAt !== 'number' ? { error: error instanceof Error ? error.message : 'Nager.Date injoignable' } : null) }]);
      log.warn('holidays not fetched', { country });
      return;
    }
    // The calendar first, made the first time (or again), its colour and whether it is shown left to the people.
    sync.apply([
      {
        type: 'calendarFeed',
        id: HOLIDAYS_FEED_ID,
        create: true,
        patch: current =>
          current.seq > 0 && typeof current.fields.deletedAt !== 'number'
            ? { name, url, refreshedAt: now, error: '' }
            : { kind: 'holidays', name, url, color: typeof current.fields.color === 'string' ? current.fields.color : 'green', hidden: false, position: 'a0', refreshedAt: now, error: '', createdAt: now, deletedAt: null },
      },
    ]);
    const changed = applyFeedPlan(sync, records, HOLIDAYS_FEED_ID, holidayDrafts(days, region), now);
    log.info('holidays kept', { country, region, days: days.length, changed });
  }
}
