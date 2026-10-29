/**
 * Carnet's routes, beside the platform's under `/api` and behind the same token: sorting links by
 * Claude, the link modules (promo codes, offers, a recipe, a copy kept as a page, ratings, a recap,
 * other outlets, a question), Seerr, questions about pages, and what Claude has cost this month.
 */
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { parseAskRequest } from '@unlease/notes/sync/ask';
import { parseCopyRequest } from '@unlease/notes/sync/copies';
import { parseCouponRequest } from '@unlease/notes/sync/coupons';
import { parseCoverageRequest } from '@unlease/notes/sync/coverage';
import { parseOfferRequest } from '@unlease/notes/sync/offers';
import { parsePagesAskRequest } from '@unlease/notes/sync/pagesAsk';
import { parseRecipeRequest } from '@unlease/notes/sync/recipe';
import { parseSeerrRequest } from '@unlease/notes/sync/seerr';
import { parseSortRequest } from '@unlease/notes/sync/sorting';
import { parseRatingsRequest, parseRecapRequest } from '@unlease/notes/sync/works';
import type { SettingsStore } from '../../settings/store';
import type { Env } from '../types';
import type { PageCopier } from './analysis/copies';
import type { PagesAsker } from './analysis/pagesAsk';
import type { QuestionAsker } from './analysis/questions';
import type { RecipeReader } from './analysis/recipe';
import type { LinkSearches } from './analysis/searches';
import type { LinkSorter } from './analysis/sorter';
import { monthStart, type UsageStore } from './analysis/usage';
import { findInSeerr, seerrProblem } from './seerr';

const MB = 1024 * 1024;
const JSON_LIMIT = 1 * MB;
/** A question about pages carries them: up to 400 000 characters, each up to three bytes, and their ids. */
const PAGES_LIMIT = 4 * MB;
/** A sorting request gives up before Cloudflare does (100 s), so the app hears why. */
const SORT_DEADLINE_MS = 90_000;

const tooLarge = (c: Context) => c.json({ error: 'body too large' }, 413);

export interface NotesServices {
  readonly sorter: LinkSorter;
  readonly searches: LinkSearches;
  readonly recipes: RecipeReader;
  readonly copier: PageCopier;
  readonly questions: QuestionAsker;
  readonly pagesAsker: PagesAsker;
  readonly usage: UsageStore;
  readonly settings: SettingsStore;
  /** How Seerr is called (tests stand in for it). */
  readonly seerrFetch?: typeof fetch;
  readonly now: () => number;
}

export function notesRoutes(app: Hono<Env>, services: NotesServices): void {
  app.post('/api/sort', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), async c => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Requête invalide' }, 400);
    }
    const request = parseSortRequest(body);
    if (!request) return c.json({ error: 'Requête de tri invalide' }, 400);
    const outcome = await services.sorter.sort(request, AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(SORT_DEADLINE_MS)]));
    if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
    return c.json({ moves: outcome.moves, ...(outcome.incomplete ? { incomplete: outcome.incomplete } : {}) });
  });

  // The link modules. A search goes on if the app hangs up: it is paid for, and kept for the next ask.
  const moduleRoute = <R, T>(parse: (body: unknown) => R | null, invalid: string, run: (request: R) => Promise<{ readonly ok: true; readonly answer: T } | { readonly ok: false; readonly status: 409 | 502; readonly error: string }>) =>
    async (c: Context<Env>) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Requête invalide' }, 400);
      }
      const request = parse(body);
      if (!request) return c.json({ error: invalid }, 400);
      const outcome = await run(request);
      if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
      return c.json(outcome.answer as object, 200, { 'Cache-Control': 'no-store' });
    };
  const { searches, recipes, copier, questions, pagesAsker, settings, usage, now } = services;
  app.post('/api/coupons', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseCouponRequest, 'Demande de codes promo invalide', request => searches.coupons(request)));
  app.post('/api/offers', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseOfferRequest, 'Demande d’offres invalide', request => searches.offers(request)));
  app.post('/api/recipe', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseRecipeRequest, 'Demande d’ingrédients invalide', request => recipes.read(request)));
  app.post('/api/copies', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseCopyRequest, 'Demande de copie invalide', request => copier.copy(request)));
  app.post('/api/ratings', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseRatingsRequest, 'Demande de notes invalide', request => searches.ratings(request)));
  app.post('/api/recap', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseRecapRequest, 'Demande de résumé invalide', request => searches.recap(request)));
  app.post('/api/coverage', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseCoverageRequest, 'Demande d’autres regards invalide', request => searches.coverage(request)));
  app.post('/api/ask', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseAskRequest, 'Question invalide', request => questions.ask(request)));
  app.post('/api/pages/ask', bodyLimit({ maxSize: PAGES_LIMIT, onError: tooLarge }), moduleRoute(parsePagesAskRequest, 'Question invalide', request => pagesAsker.ask(request)));
  app.post(
    '/api/seerr',
    bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }),
    moduleRoute(parseSeerrRequest, 'Demande Seerr invalide', async request => {
      const seerr = settings.seerr();
      if (!seerr) return { ok: false, status: 409, error: 'Seerr n’est pas relié : ajoutez-le dans l’administration.' };
      try {
        return { ok: true, answer: await findInSeerr(seerr, request.link, services.seerrFetch) };
      } catch (error) {
        return { ok: false, status: 502, error: seerrProblem(error) };
      }
    }),
  );

  app.get('/api/usage', c => {
    const { model, budgetUsd } = settings.effective();
    return c.json({ monthToDate: usage.totals(monthStart(now())), total: usage.totals(0), model, budgetUsd });
  });
}
