/**
 * Carnet's routes, beside the platform's under `/api` and behind the same token, answered while
 * Carnet is on: sorting links by Claude, the link modules (promo codes, offers, a recipe, ratings, a
 * recap, other outlets, a question), « Essayer » on a template (`analysis/templateTry.ts`), Seerr, the
 * notes that mention something (`mentions.ts`) and gift ideas kept from Contacts (`gifts.ts`). What Claude has cost is the suite's
 * (`claude/routes.ts`). A copy kept as a page is Pages' (`../pages/copies.ts`).
 */
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { parseAskRequest } from '@unlease/notes/sync/ask';
import { parseCouponRequest } from '@unlease/notes/sync/coupons';
import { parseCoverageRequest } from '@unlease/notes/sync/coverage';
import { parseOfferRequest } from '@unlease/notes/sync/offers';
import { parseRecipeRequest } from '@unlease/notes/sync/recipe';
import { parseSeerrRequest } from '@unlease/notes/sync/seerr';
import { parseSortRequest } from '@unlease/notes/sync/sorting';
import { parseTemplateTryRequest, TEMPLATE_TRY_PATH } from '@unlease/notes/sync/templateTry';
import { parseRatingsRequest, parseRecapRequest } from '@unlease/notes/sync/works';
import { GIFTS_PATH, parseGiftLinkRequest } from '@unlease/core/sync/gifts';
import { parseMentionsQuery, type MentionsResponse } from '@unlease/core/sync/mentions';
import type { RecordStore } from '../../sync/records';
import type { GiftMaker } from './gifts';
import { notesMentioning } from './mentions';
import type { SettingsStore } from '../../settings/store';
import type { Env } from '../types';
import type { QuestionAsker } from './analysis/questions';
import type { RecipeReader } from './analysis/recipe';
import type { LinkSearches } from './analysis/searches';
import type { LinkSorter } from './analysis/sorter';
import { TRY_WORDS, type TemplateTrier } from './analysis/templateTry';
import { findInSeerr, seerrProblem } from './seerr';

const MB = 1024 * 1024;
const JSON_LIMIT = 1 * MB;
/** A sorting request gives up before Cloudflare does (100 s), so the app hears why. */
const SORT_DEADLINE_MS = 90_000;

const tooLarge = (c: Context) => c.json({ error: 'body too large' }, 413);

export interface NotesServices {
  readonly sorter: LinkSorter;
  readonly searches: LinkSearches;
  readonly recipes: RecipeReader;
  readonly questions: QuestionAsker;
  readonly templates: TemplateTrier;
  readonly settings: SettingsStore;
  readonly records: RecordStore;
  readonly gifts: GiftMaker;
  /** How Seerr is called (tests stand in for it). */
  readonly seerrFetch?: typeof fetch;
}

export function notesRoutes(app: Hono<Env>, services: NotesServices): void {
  app.get('/api/notes/mentions', c => {
    const query = parseMentionsQuery(c.req.query('type'), c.req.query('ids'));
    if (!query) return c.json({ error: 'Invalid request' }, 400);
    const answer: MentionsResponse = { places: notesMentioning(services.records, query.type, query.ids) };
    return c.json(answer, 200, { 'Cache-Control': 'no-store' });
  });

  app.post(GIFTS_PATH, bodyLimit({ maxSize: 16 * 1024, onError: tooLarge }), async c => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid request' }, 400);
    }
    const request = parseGiftLinkRequest(body);
    if (!request) return c.json({ error: 'Idée de cadeau invalide' }, 400);
    return c.json(services.gifts.add(request), 200, { 'Cache-Control': 'no-store' });
  });

  app.post('/api/sort', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), async c => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid request' }, 400);
    }
    const request = parseSortRequest(body);
    if (!request) return c.json({ error: 'Invalid sorting request' }, 400);
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
        return c.json({ error: 'Invalid request' }, 400);
      }
      const request = parse(body);
      if (!request) return c.json({ error: invalid }, 400);
      const outcome = await run(request);
      if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
      return c.json(outcome.answer as object, 200, { 'Cache-Control': 'no-store' });
    };
  const { searches, recipes, questions, templates, settings } = services;
  app.post('/api/coupons', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseCouponRequest, 'Invalid promo code request', request => searches.coupons(request)));
  app.post('/api/offers', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseOfferRequest, 'Invalid offers request', request => searches.offers(request)));
  app.post('/api/recipe', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseRecipeRequest, 'Invalid ingredients request', request => recipes.read(request)));
  app.post('/api/ratings', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseRatingsRequest, 'Invalid ratings request', request => searches.ratings(request)));
  app.post('/api/recap', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseRecapRequest, 'Invalid recap request', request => searches.recap(request)));
  app.post('/api/coverage', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseCoverageRequest, 'Invalid request for other takes', request => searches.coverage(request)));
  app.post('/api/ask', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), moduleRoute(parseAskRequest, 'Invalid question', request => questions.ask(request)));
  app.post(TEMPLATE_TRY_PATH, bodyLimit({ maxSize: 64 * 1024, onError: tooLarge }), moduleRoute(parseTemplateTryRequest, TRY_WORDS.invalid, request => templates.try(request)));
  app.post(
    '/api/seerr',
    bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }),
    moduleRoute(parseSeerrRequest, 'Invalid Seerr request', async request => {
      const seerr = settings.seerr();
      if (!seerr) return { ok: false, status: 409, error: 'Seerr is not linked: add it in Administration.' };
      try {
        return { ok: true, answer: await findInSeerr(seerr, request.link, services.seerrFetch) };
      } catch (error) {
        return { ok: false, status: 502, error: seerrProblem(error) };
      }
    }),
  );
}

