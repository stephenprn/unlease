/**
 * Carnet's routes on the server (`server/src/apps/notes`): sorting by Claude, the link modules'
 * searches, and a template tried on one page. Each throws `SyncError` with the server's own words when it refuses.
 */
import { parseAskResponse, type AskRequest, type AskResponse } from '@unlease/notes/sync/ask';
import { parseCouponResponse, type CouponRequest, type CouponResponse } from '@unlease/notes/sync/coupons';
import { parseCoverageResponse, type CoverageRequest, type CoverageResponse } from '@unlease/notes/sync/coverage';
import { parseOfferResponse, type OfferRequest, type OfferResponse } from '@unlease/notes/sync/offers';
import { parseRecipeResponse, type RecipeRequest, type RecipeResponse } from '@unlease/notes/sync/recipe';
import { parseSeerrResponse, type SeerrRequest, type SeerrResponse } from '@unlease/notes/sync/seerr';
import { parseSortResponse, type SortRequest, type SortResponse } from '@unlease/notes/sync/sorting';
import { parseTemplateTryResponse, TEMPLATE_TRY_PATH, type TemplateTryRequest, type TemplateTryResponse } from '@unlease/notes/sync/templateTry';
import { parseRatingsResponse, parseRecapResponse, type RatingsRequest, type RatingsResponse, type RecapRequest, type RecapResponse } from '@unlease/notes/sync/works';
// The one contract of Pages that Carnet calls: « Garder une copie » asks Pages' route to make the page.
import { parseCopyMade, type CopyMade, type CopyRequest } from '@unlease/pages/sync/copies';
// « Ajouter à l’agenda » asks Agenda's route to read the link's date: its contract is Agenda's.
import { FROM_LINK_PATH, parseProposalResponse, type FromLinkRequest, type ProposalResponse } from '@unlease/calendar/sync/routes';

import type { ServerConfig } from '@shared/app/store/settings';
import { postJson, SyncError } from '@shared/app/sync/transport';

/** `POST /api/sort`: Claude's moves for links already saved. */
export function sortLinks(config: ServerConfig, body: SortRequest, signal?: AbortSignal): Promise<SortResponse> {
  return postJson(config, '/api/sort', body, parseSortResponse, signal);
}

/** `POST /api/coupons`: the promo codes Claude found on the web for a priced link. */
export function searchCoupons(config: ServerConfig, body: CouponRequest, signal?: AbortSignal): Promise<CouponResponse> {
  return postJson(config, '/api/coupons', body, parseCouponResponse, signal);
}

/** `POST /api/offers`: the same item at other shops (`new`) or second-hand (`used`), as Claude found it. */
export function searchOffers(config: ServerConfig, body: OfferRequest, signal?: AbortSignal): Promise<OfferResponse> {
  return postJson(config, '/api/offers', body, parseOfferResponse, signal);
}

/** `POST /api/recipe`: a recipe's ingredients and method, for a shopping list and the cook mode. */
export function fetchRecipe(config: ServerConfig, body: RecipeRequest, signal?: AbortSignal): Promise<RecipeResponse> {
  return postJson(config, '/api/recipe', body, parseRecipeResponse, signal);
}

/** `POST /api/pages/copies`: Pages makes the article into a page and points the link's `copy` at it, in one change that syncs. */
export function requestCopy(config: ServerConfig, body: CopyRequest, signal?: AbortSignal): Promise<CopyMade> {
  return postJson(config, '/api/pages/copies', body, parseCopyMade, signal);
}

/** `POST /api/ratings`: a work's ratings on the sites that rate its kind, as Claude found them. */
export function searchRatings(config: ServerConfig, body: RatingsRequest, signal?: AbortSignal): Promise<RatingsResponse> {
  return postJson(config, '/api/ratings', body, parseRatingsResponse, signal);
}

/** `POST /api/recap`: a series up to where the person stopped, nothing after. */
export function searchRecap(config: ServerConfig, body: RecapRequest, signal?: AbortSignal): Promise<RecapResponse> {
  return postJson(config, '/api/recap', body, parseRecapResponse, signal);
}

/** `POST /api/coverage`: the same story told by other outlets. */
export function searchCoverage(config: ServerConfig, body: CoverageRequest, signal?: AbortSignal): Promise<CoverageResponse> {
  return postJson(config, '/api/coverage', body, parseCoverageResponse, signal);
}

/** `POST /api/ask`: Claude's answer to a question about a link, and the pages it cites. */
export function askQuestion(config: ServerConfig, body: AskRequest, signal?: AbortSignal): Promise<AskResponse> {
  return postJson(config, '/api/ask', body, parseAskResponse, signal);
}

/** `POST /api/seerr`: a film or a series in Seerr, its page and state, or Seerr's search for it. */
export function findInSeerr(config: ServerConfig, body: SeerrRequest, signal?: AbortSignal): Promise<SeerrResponse> {
  return postJson(config, '/api/seerr', body, parseSeerrResponse, signal, 20_000);
}

/** `POST /api/calendar/from-link`: the event Claude reads in a saved link (its date, hours and place), or none. */
export function eventFromLink(config: ServerConfig, body: FromLinkRequest, signal?: AbortSignal): Promise<ProposalResponse> {
  return postJson(config, FROM_LINK_PATH, body, parseProposalResponse, signal, 60_000);
}

/** `POST /api/notes/template-try`: what Claude would put in each field of a template being shaped, read on one page; nothing is written. */
export function tryTemplate(config: ServerConfig, body: TemplateTryRequest, signal?: AbortSignal): Promise<TemplateTryResponse> {
  return postJson(config, TEMPLATE_TRY_PATH, body, parseTemplateTryResponse, signal);
}

export { SyncError };
