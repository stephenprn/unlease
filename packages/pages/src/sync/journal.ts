/**
 * Pages made for Agenda, by Pages' server module (the pages are written under the server's clock, as
 * copies are), so Agenda's clients need no page action:
 *
 * - `POST /api/pages/from-event` a FromEventRequest -> PageMade: an event's notes (« Créer une page de
 *   notes »): its title, the day as a date, the people it is with mentioned, the event itself
 *   mentioned (`{@event=<id>}`: the page then shows in the event's « Mentionné dans »), and a
 *   « Notes » heading to write under. Asked again for the same event, the page made before (still
 *   live) is answered.
 * - `POST /api/pages/daily` a DailyRequest -> PageMade: the day's page (« Note du jour ») under a
 *   « Journal » page at the top, made the first time, found again after.
 *
 * Both answer 4xx/5xx { error } in French; both need Pages on the server.
 */
import { isLocale, type Locale } from '@unlease/core/i18n';
import { dateRun, serializeRich, type Run } from '@unlease/core/services/richText';
import { isValidId } from '@unlease/core/sync/schema';

export const FROM_EVENT_PATH = '/api/pages/from-event';
export const DAILY_PATH = '/api/pages/daily';

export interface FromEventRequest {
  readonly eventId: string;
  /** The event's title as shown ('' for an untitled one). */
  readonly title: string;
  /** The occurrence's start as stored (`2026-11-02` or `2026-11-02T14:30`): the page's date. */
  readonly start: string;
  /** The people it is with: each is mentioned. */
  readonly contactIds: readonly string[];
  readonly lang: Locale;
}

export interface DailyRequest {
  /** `2026-11-02`. */
  readonly day: string;
  readonly lang: Locale;
}

/** The page, made or found again: the client opens it in Pages. */
export interface PageMade {
  readonly pageId: string;
  /** Made by this request (false: it was there already). */
  readonly created: boolean;
}

const WHEN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

export function parseFromEventRequest(body: unknown): FromEventRequest | null {
  const raw = body as Record<string, unknown> | null;
  if (!raw || !isValidId(raw.eventId) || typeof raw.start !== 'string' || !WHEN.test(raw.start)) return null;
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 500) : '';
  const contactIds = Array.isArray(raw.contactIds) ? [...new Set(raw.contactIds.filter(isValidId))].slice(0, 50) : [];
  return { eventId: raw.eventId, title, start: raw.start, contactIds, lang: isLocale(raw.lang) ? raw.lang : 'fr' };
}

export function parseDailyRequest(body: unknown): DailyRequest | null {
  const raw = body as Record<string, unknown> | null;
  if (!raw || typeof raw.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.day)) return null;
  return { day: raw.day, lang: isLocale(raw.lang) ? raw.lang : 'fr' };
}

export function parsePageMade(body: unknown): PageMade | null {
  const raw = body as { pageId?: unknown; created?: unknown } | null;
  return raw && isValidId(raw.pageId) ? { pageId: raw.pageId, created: raw.created === true } : null;
}

/** The words of the pages made, in the request's language: nothing the server shows is translated at sight, so both are here. */
export const JOURNAL_WORDS = {
  fr: { journal: 'Journal', notes: 'Notes', with: 'Avec', event: 'Événement', untitled: 'Sans titre', dailyIntro: 'Note du jour' },
  en: { journal: 'Journal', notes: 'Notes', with: 'With', event: 'Event', untitled: 'Untitled', dailyIntro: 'Daily note' },
} as const satisfies Record<Locale, Record<string, string>>;

const MONTHS: Record<Locale, readonly string[]> = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const WEEKDAYS: Record<Locale, readonly string[]> = {
  fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/** « Lundi 2 novembre 2026 », "Monday 2 November 2026": the day's page's title, in the asking device's language. */
export function dayTitle(day: string, lang: Locale): string {
  const [year, month, date] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, date!)).getUTCDay();
  const words = `${WEEKDAYS[lang][weekday]} ${date} ${MONTHS[lang][month! - 1]} ${year}`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The day's page under its title: « Note du jour · <the day> », then a paragraph to write in. What
 * Agenda's « Note du jour » makes (`POST /api/pages/daily`) and Pages' « Journal du jour » template
 * writes, so a day's page reads the same however it was started.
 */
export function dailyPageLines(day: string, lang: Locale): readonly { readonly kind: 'text'; readonly text: string }[] {
  const date = dateRun(day);
  const intro: Run[] = [{ kind: 'text', text: `${JOURNAL_WORDS[lang].dailyIntro} · `, marks: {} }, ...(date ? [date] : [])];
  return [
    { kind: 'text', text: serializeRich(intro) },
    { kind: 'text', text: '' },
  ];
}
