/**
 * A recipe's ingredients and method for "Liste de courses" and "En cuisine" (`POST /api/recipe`):
 * read from the page's structured data when it gives them (free), else by Claude from what the
 * server read, or from the page it fetches itself when the server could not. Kept a month by
 * address, with whether its method was looked for (a recipe may have none): a recipe rarely
 * changes, and it stays in the recipe's own words whatever the language. One reading at a time per
 * address: the list joins any, the cook mode one that looks for the method.
 */
import { normalizeUrl } from '@unlease/core/services/url';
import { parseIngredients, parseSteps, type RecipeRequest, type RecipeResponse } from '@unlease/notes/sync/recipe';
import { log } from '../../../log';
import { buildDigest } from './digest';
import type { Fetcher } from './fetcher';
import { ModelError } from './model';
import type { AnalysisContext } from './provider';
import { readLink } from './reader';
import { BUDGET_SPENT, withCutOffCall, type ModuleOutcome } from './searches';
import { monthStart, type UsageStore } from './usage';

const KEEP_MS = 30 * 86_400_000;
/** The read and Claude share it, within the apps' wait (100 s). */
const DEADLINE_MS = 85_000;
const READ_DEADLINE_MS = 30_000;

export interface RecipeReaderOptions {
  readonly usage: UsageStore;
  readonly analysis: () => AnalysisContext;
  readonly fetcher: Fetcher;
  readonly now?: () => number;
}

/** A recipe as kept: its answer, and whether its method was looked for (Claude asked, or the page's data gave it). */
interface Known {
  readonly answer: RecipeResponse;
  readonly stepsRead: boolean;
}

/**
 * It has what was asked: ingredients, and for the cook mode the method, or the knowledge that there is
 * none; or Claude read the page and found only a method (nothing more to pay for).
 */
const enough = ({ answer, stepsRead }: Known, request: RecipeRequest): boolean =>
  answer.ingredients.length > 0 ? !request.steps || answer.steps.length > 0 || stepsRead : stepsRead && answer.steps.length > 0;

const NO_INGREDIENTS = 'Aucun ingrédient sur cette page';

export class RecipeReader {
  private readonly now: () => number;
  private readonly running = new Map<string, { readonly steps: boolean; readonly job: Promise<ModuleOutcome<RecipeResponse>> }>();

  constructor(private readonly options: RecipeReaderOptions) {
    this.now = options.now ?? Date.now;
  }

  read(request: RecipeRequest): Promise<ModuleOutcome<RecipeResponse>> {
    const url = normalizeUrl(request.link.url);
    const known = this.known(url);
    if (known && enough(known, request)) {
      // A method alone cooks, but makes no shopping list.
      if (known.answer.ingredients.length === 0 && !request.steps) return Promise.resolve({ ok: false, status: 502, error: NO_INGREDIENTS });
      return Promise.resolve({ ok: true, answer: known.answer });
    }
    const running = this.running.get(url);
    if (running) {
      // A list made meanwhile may lack the method: the cook mode asks again once it is done, from what it kept.
      if (!request.steps || running.steps) return running.job;
      return running.job.then(() => this.read(request));
    }
    const job = this.extract(request, url, known?.answer ?? null).finally(() => this.running.delete(url));
    this.running.set(url, { steps: request.steps, job });
    return job;
  }

  private known(url: string): Known | null {
    const kept = this.options.usage.keptFor<RecipeResponse & { readonly stepsRead?: boolean }>('recipe', url, this.now() - KEEP_MS, null);
    if (!kept) return null;
    return { answer: { ingredients: parseIngredients(kept.ingredients), servings: kept.servings, steps: parseSteps(kept.steps) }, stepsRead: kept.stepsRead === true };
  }

  private async extract(request: RecipeRequest, url: string, kept: RecipeResponse | null): Promise<ModuleOutcome<RecipeResponse>> {
    const { usage } = this.options;
    const started = this.now();
    const deadline = AbortSignal.timeout(DEADLINE_MS);
    const read = await readLink(request.link.url, this.options.fetcher, AbortSignal.any([deadline, AbortSignal.timeout(READ_DEADLINE_MS)]));
    const record = (answer: RecipeResponse | null, stepsRead: boolean, error: string | null, spent: Parameters<UsageStore['recordModule']>[1]['usage']) =>
      usage.recordModule('recipe', { linkId: request.link.id, url, usage: spent, ok: answer !== null, error, durationMs: this.now() - started, result: answer ? { ...answer, stepsRead, lang: request.lang } : null });
    // What the page gave before still serves when it cannot give more now: the list, without its method.
    const orKept = (refusal: ModuleOutcome<RecipeResponse>): ModuleOutcome<RecipeResponse> => (kept && kept.ingredients.length > 0 ? { ok: true, answer: kept } : refusal);
    // A page gone or refused for good: Claude would be paid to find nothing.
    if (!read.page && read.fatal) return orKept({ ok: false, status: 502, error: read.error ?? 'La page n’a pas pu être lue' });

    const listed = read.page?.recipe;
    const structured: RecipeResponse | null = listed && listed.ingredients.length > 0 ? { ingredients: parseIngredients(listed.ingredients), servings: listed.servings, steps: parseSteps(listed.steps) } : null;
    if (structured && enough({ answer: structured, stepsRead: structured.steps.length > 0 }, request)) {
      record(structured, structured.steps.length > 0, null, null);
      return { ok: true, answer: structured };
    }

    const { model, budgetUsd } = this.options.analysis();
    const spent = usage.costSince(monthStart(this.now())) >= budgetUsd;
    // Without Claude, the ingredients alone still make a shopping list and half a cook mode.
    if (structured && (!model || spent)) return { ok: true, answer: structured };
    if (!model) return orKept({ ok: false, status: 409, error: read.page ? 'Cette page ne donne pas ses ingrédients toute seule : ajoutez une clé Claude pour qu’il les lise.' : (read.error ?? 'La page n’a pas pu être lue') });
    if (spent) return orKept({ ok: false, status: 409, error: BUDGET_SPENT });
    try {
      const found = await model.listIngredients(
        {
          url: request.link.url,
          digest: buildDigest({ read, candidates: [] }),
          lang: request.lang,
          webFetch: read.page ? null : { reason: read.error ?? 'page illisible' },
        },
        deadline,
      );
      // The structured list is the page's own: kept over Claude's reading of it.
      const answer: RecipeResponse = structured ? { ...structured, steps: found.steps } : { ingredients: found.ingredients, servings: found.servings, steps: found.steps };
      if (answer.ingredients.length === 0) {
        // A method without a list still cooks: kept, so the cook mode shows its steps and nothing is paid for twice.
        if (answer.steps.length > 0) {
          record(answer, true, null, found.usage);
          return request.steps ? { ok: true, answer } : orKept({ ok: false, status: 502, error: NO_INGREDIENTS });
        }
        record(null, false, NO_INGREDIENTS, found.usage);
        return orKept({ ok: false, status: 502, error: NO_INGREDIENTS });
      }
      // Claude was asked for the method too: none found is an answer, not to be paid for again.
      record(answer, true, null, found.usage);
      log.info('recipe read by Claude', { ingredients: answer.ingredients.length, steps: answer.steps.length, costUsd: Math.round(found.usage.costUsd * 10_000) / 10_000 });
      return { ok: true, answer };
    } catch (error) {
      if (!deadline.aborted && !(error instanceof ModelError)) log.error('recipe reading crashed', { error });
      const message = deadline.aborted ? 'Claude a mis trop de temps' : error instanceof ModelError ? error.message : 'Erreur de la lecture';
      const cost = error instanceof ModelError ? error.usage : null;
      // Cut off, it was reading the page (with web_fetch at most), not searching the web.
      record(null, false, message, deadline.aborted ? withCutOffCall(cost, model.model, true) : cost);
      // The ingredients the page gave still serve.
      return structured ? { ok: true, answer: structured } : orKept({ ok: false, status: 502, error: message });
    }
  }
}
