/**
 * The link modules' calls (`notes/models/modules`): promo codes, offers elsewhere, ratings, a series'
 * recap and other outlets (Claude on the web), a recipe's ingredients and method, an article kept as
 * a page, a question to Claude, the film in Seerr. Asked from a link's sheet; only the copy writes
 * on its own, through the page actions (the shopping list writes from its sheet, `addToChecklist`,
 * and an answer goes in the link's note when the person adds it). The
 * web's `web/notes/src/app/modules.ts` is a port of it. Each throws `SyncError` with the interface's words
 * when it cannot be done.
 */
import { getLocale, t } from '@unlease/core/i18n';
import type { LinkItem } from '@unlease/notes/models/entities';
import { couponRequest } from '@unlease/notes/services/coupons';
import { formatIsoDay } from '@unlease/core/services/format';
import { linkBrief } from '@unlease/notes/services/modules';
import { offerRequest } from '@unlease/notes/services/offers';
import { richFromPlain, serializeRich, setFlag } from '@unlease/core/services/richText';
import type { AskResponse } from '@unlease/notes/sync/ask';
import type { CouponResponse } from '@unlease/notes/sync/coupons';
import type { CoverageResponse } from '@unlease/notes/sync/coverage';
import type { OfferMarket, OfferResponse } from '@unlease/notes/sync/offers';
import type { RecipeResponse } from '@unlease/notes/sync/recipe';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';
import type { SeerrResponse } from '@unlease/notes/sync/seerr';
import type { RatingsResponse, RecapResponse } from '@unlease/notes/sync/works';

import { useLibraryStore } from './store/libraryStore';
import { saveTypedText } from './store/actions';
import { createPageFrom } from './store/pages';
import { useSettingsStore, type ServerConfig } from './store/settingsStore';
import { askQuestion, fetchRecipe, findInSeerr, requestCopy, searchCoupons, searchCoverage, searchOffers, searchRatings, searchRecap, SyncError } from './sync/transport';

function server(): ServerConfig {
  const config = useSettingsStore.getState().server;
  if (!config) throw new SyncError('network', t('Aucun serveur n’est connecté'));
  return config;
}

function linkOf(id: string): LinkItem {
  const link = useLibraryStore.getState().links[id];
  if (!link) throw new SyncError('protocol', t('Ce lien n’existe plus.'));
  return link;
}

/** Claude's codes for this link, in the interface's language; `fresh` searches again instead of showing those of the last hours. */
export async function findCoupons(linkId: string, fresh: boolean, signal?: AbortSignal): Promise<CouponResponse> {
  const request = couponRequest(linkOf(linkId), getLocale(), fresh);
  if (!request) throw new SyncError('protocol', t('Ce lien n’a pas de prix'));
  return searchCoupons(server(), request, signal);
}

/** The same item at other shops (`new`) or second-hand (`used`), as Claude found it. */
export async function findOffers(linkId: string, market: OfferMarket, fresh: boolean, signal?: AbortSignal): Promise<OfferResponse> {
  const request = offerRequest(linkOf(linkId), market, getLocale(), fresh);
  if (!request) throw new SyncError('protocol', t('Ce lien n’a pas de prix'));
  return searchOffers(server(), request, signal);
}

/** A recipe's ingredients for "Liste de courses", and its method too for "En cuisine" (`steps`). */
export async function readRecipe(linkId: string, steps: boolean, signal?: AbortSignal): Promise<RecipeResponse> {
  const link = linkOf(linkId);
  return fetchRecipe(server(), { link: { id: link.id, url: link.url }, lang: getLocale(), steps }, signal);
}

/** "Notes": the work's ratings, in the interface's language; `fresh` searches again instead of showing those of the week. */
export async function findRatings(linkId: string, fresh: boolean, signal?: AbortSignal): Promise<RatingsResponse> {
  return searchRatings(server(), { link: linkBrief(linkOf(linkId)), lang: getLocale(), fresh }, signal);
}

/** "Résumé jusqu’ici": the series up to `season`, and to its `episode` (null: the whole season). */
export async function findRecap(linkId: string, season: number, episode: number | null, fresh: boolean, signal?: AbortSignal): Promise<RecapResponse> {
  return searchRecap(server(), { link: linkBrief(linkOf(linkId)), season, episode, lang: getLocale(), fresh }, signal);
}

/** "Autres regards": the story in other outlets. */
export async function findCoverage(linkId: string, fresh: boolean, signal?: AbortSignal): Promise<CoverageResponse> {
  return searchCoverage(server(), { link: linkBrief(linkOf(linkId)), lang: getLocale(), fresh }, signal);
}

/** "Demander à Claude": its answer to `question`, from the page, and from the web when `web`. */
export async function askAbout(linkId: string, question: string, web: boolean, signal?: AbortSignal): Promise<AskResponse> {
  return askQuestion(server(), { link: linkBrief(linkOf(linkId)), question, web, lang: getLocale() }, signal);
}

/** An answer at the end of the link's own note (« Votre note »), as one edit the person made; false, and nothing written, when it would not fit whole. */
export function addToLinkNote(linkId: string, text: string): boolean {
  const link = linkOf(linkId);
  const joined = link.comment.trim() ? `${link.comment.trimEnd()}\n\n${text}` : text;
  if (joined.length > TEXT_LIMITS.link.comment) return false;
  saveTypedText('link', linkId, 'comment', link.comment, joined);
  return true;
}

/** A Seerr lookup is asked again after this: someone may have asked for the film meanwhile. */
const SEERR_KEEP_MS = 5 * 60_000;
const seerrLookups = new Map<string, { readonly at: number; readonly answer: Promise<SeerrResponse> }>();

/** The film or series in Seerr (its page and state, or Seerr's search): asked once every few minutes per link, whoever shows it. */
export function lookUpSeerr(linkId: string): Promise<SeerrResponse> {
  const link = useLibraryStore.getState().links[linkId];
  const config = useSettingsStore.getState().server;
  if (!link || !config) return Promise.reject(new SyncError('network', t('Aucun serveur n’est connecté')));
  // A title read meanwhile is another search.
  const key = `${link.id} ${link.title}`;
  const kept = seerrLookups.get(key);
  if (kept && Date.now() - kept.at < SEERR_KEEP_MS) return kept.answer;
  const answer = findInSeerr(config, { link: linkBrief(link) });
  seerrLookups.set(key, { at: Date.now(), answer });
  answer.catch(() => {
    if (seerrLookups.get(key)?.answer === answer) seerrLookups.delete(key);
  });
  return answer;
}

/** Copies being made, by link: a press on a link closed and opened again meanwhile joins the first, never a second page. */
const copying = new Map<string, Promise<string>>();

/** The copy of this link being made, if one is. */
export const runningCopy = (linkId: string): Promise<string> | null => copying.get(linkId) ?? null;

/** "Garder une copie": the article as a new page, the link's card first, then who wrote it and when. Returns the page. */
export function keepCopy(linkId: string): Promise<string> {
  const running = copying.get(linkId);
  if (running) return running;
  const made = makeCopy(linkId).finally(() => copying.delete(linkId));
  copying.set(linkId, made);
  return made;
}

async function makeCopy(linkId: string): Promise<string> {
  const link = linkOf(linkId);
  const copy = await requestCopy(server(), { link: { id: link.id, url: link.url }, lang: getLocale() });
  const credit = [copy.byline, copy.published ? formatIsoDay(copy.published) : ''].filter(Boolean).join(' · ');
  const lead = credit ? [{ kind: 'text' as const, text: serializeRich(setFlag(richFromPlain(credit), 0, credit.length, 'i', true)) }] : [];
  // The link's own title first: the page's carries its site's name (« … | Auto Plus »), or is only the domain.
  return createPageFrom({ title: link.title || copy.title, cite: { type: 'link', id: link.id }, drafts: [...lead, ...copy.drafts] });
}
