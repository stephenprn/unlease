/**
 * Carnet's routes on the server: sorting by Claude, the link modules (promo codes, offers, a recipe,
 * ratings, a recap, other outlets, a question, Seerr), a template tried on a page (« Essayer ») and
 * « Garder une copie » (Pages' route), over the suite's transport (`@shared/app/sync/transport`),
 * which this file hands on whole.
 */
import { isValidId } from '@unlease/core/sync/schema';
import { parseAskResponse, type AskRequest, type AskResponse } from '@unlease/notes/sync/ask';
import { parseCouponResponse, type CouponRequest, type CouponResponse } from '@unlease/notes/sync/coupons';
import { parseCoverageResponse, type CoverageRequest, type CoverageResponse } from '@unlease/notes/sync/coverage';
import { parseOfferResponse, type OfferRequest, type OfferResponse } from '@unlease/notes/sync/offers';
import { parseRecipeResponse, type RecipeRequest, type RecipeResponse } from '@unlease/notes/sync/recipe';
import { parseSeerrResponse, type SeerrRequest, type SeerrResponse } from '@unlease/notes/sync/seerr';
import { parseSortResponse, type SortRequest, type SortResponse } from '@unlease/notes/sync/sorting';
import { parseRatingsResponse, parseRecapResponse, type RatingsRequest, type RatingsResponse, type RecapRequest, type RecapResponse } from '@unlease/notes/sync/works';
import { parseTemplateTryResponse, TEMPLATE_TRY_PATH, type TemplateTryRequest, type TemplateTryResponse } from '@unlease/notes/sync/templateTry';
// Types only: Carnet never loads Pages' package (its record types stay Pages').
import type { CopyMade, CopyRequest } from '@unlease/pages/sync/copies';
// « Ajouter à l’agenda » asks Agenda's route to read the link's date: its contract is Agenda's.
import { FROM_LINK_PATH, parseProposalResponse, type FromLinkRequest, type ProposalResponse } from '@unlease/calendar/sync/routes';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { askServer } from '@shared/app/sync/transport';

export * from '@shared/app/sync/transport';

/** `POST /api/sort`: Claude's moves for links already saved. Throws with the server's own words when it refuses. */
export function sortLinks(config: ServerConfig, body: SortRequest, signal?: AbortSignal): Promise<SortResponse> {
  return askServer(config, '/api/sort', body, parseSortResponse, signal);
}

/** `POST /api/coupons`: the promo codes Claude found on the web for a priced link. Throws with the server's own words when it refuses. */
export function searchCoupons(config: ServerConfig, body: CouponRequest, signal?: AbortSignal): Promise<CouponResponse> {
  return askServer(config, '/api/coupons', body, parseCouponResponse, signal);
}

/** `POST /api/offers`: the same item at other shops (`new`) or second-hand (`used`), as Claude found it. */
export function searchOffers(config: ServerConfig, body: OfferRequest, signal?: AbortSignal): Promise<OfferResponse> {
  return askServer(config, '/api/offers', body, parseOfferResponse, signal);
}

/** `POST /api/recipe`: a recipe's ingredients and method, for a shopping list and the cook mode. */
export function fetchRecipe(config: ServerConfig, body: RecipeRequest, signal?: AbortSignal): Promise<RecipeResponse> {
  return askServer(config, '/api/recipe', body, parseRecipeResponse, signal);
}

/** `POST /api/pages/copies`: the article kept as a page in Pages, made by the server; the link's `copy` points at it once the change syncs. */
export function requestCopy(config: ServerConfig, body: CopyRequest, signal?: AbortSignal): Promise<CopyMade> {
  return askServer(config, '/api/pages/copies', body, parseCopyMade, signal);
}

/** `CopyMade`, read here: Pages' own reader would load its record types into Carnet. */
function parseCopyMade(body: unknown): CopyMade | null {
  const raw = body as { pageId?: unknown } | null;
  return raw && isValidId(raw.pageId) ? { pageId: raw.pageId } : null;
}

/** `POST /api/ratings`: a work's ratings on the sites that rate its kind, as Claude found them. */
export function searchRatings(config: ServerConfig, body: RatingsRequest, signal?: AbortSignal): Promise<RatingsResponse> {
  return askServer(config, '/api/ratings', body, parseRatingsResponse, signal);
}

/** `POST /api/recap`: a series up to where the person stopped, nothing after. */
export function searchRecap(config: ServerConfig, body: RecapRequest, signal?: AbortSignal): Promise<RecapResponse> {
  return askServer(config, '/api/recap', body, parseRecapResponse, signal);
}

/** `POST /api/coverage`: the same story told by other outlets. */
export function searchCoverage(config: ServerConfig, body: CoverageRequest, signal?: AbortSignal): Promise<CoverageResponse> {
  return askServer(config, '/api/coverage', body, parseCoverageResponse, signal);
}

/** `POST /api/ask`: Claude's answer to a question about a link, and the pages it cites. */
export function askQuestion(config: ServerConfig, body: AskRequest, signal?: AbortSignal): Promise<AskResponse> {
  return askServer(config, '/api/ask', body, parseAskResponse, signal);
}

/** `POST /api/seerr`: a film or a series in Seerr, its page and state, or Seerr's search for it. */
export function findInSeerr(config: ServerConfig, body: SeerrRequest, signal?: AbortSignal): Promise<SeerrResponse> {
  return askServer(config, '/api/seerr', body, parseSeerrResponse, signal, 20_000);
}

/** `POST /api/calendar/from-link`: the event Claude reads in a saved link (its date, hours and place), or none. */
export function eventFromLink(config: ServerConfig, body: FromLinkRequest, signal?: AbortSignal): Promise<ProposalResponse> {
  return askServer(config, FROM_LINK_PATH, body, parseProposalResponse, signal);
}

/** `POST /api/notes/template-try`: what Claude would put in each field of a template being shaped, read from one page; nothing is written. */
export function tryTemplate(config: ServerConfig, body: TemplateTryRequest, signal?: AbortSignal): Promise<TemplateTryResponse> {
  return askServer(config, TEMPLATE_TRY_PATH, body, parseTemplateTryResponse, signal);
}
