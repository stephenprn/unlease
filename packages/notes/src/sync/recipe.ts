/**
 * A recipe's ingredients and steps, for the shopping list and the cook mode: `POST /api/recipe` a
 * RecipeRequest -> RecipeResponse, or 4xx/5xx { error } in French. The server reads them from the
 * page's structured data (free) and asks Claude only when the page lacks what is asked (the
 * ingredients, or the steps for the cook mode); it keeps them a month by address.
 */
import { isLocale, type Locale } from '@unlease/core/i18n';
import { cleanText, parseLinkAddress, type LinkAddress } from './brief';

export interface RecipeRequest {
  readonly link: LinkAddress;
  /** The language Claude writes in, when it has to read the page. */
  readonly lang: Locale;
  /** The cook mode needs the method too: Claude reads it when the page's structured data has none. */
  readonly steps: boolean;
}

/** One step of the method, under its part of the recipe ("Pour la pâte"), or none (''). */
export interface RecipeStep {
  readonly section: string;
  readonly text: string;
}

export interface RecipeResponse {
  /** As the recipe writes them: "200 g de farine". */
  readonly ingredients: readonly string[];
  /** What it makes: "4 personnes", "12 crêpes", or ''. */
  readonly servings: string;
  /** The method, in order; empty when the page gives none. */
  readonly steps: readonly RecipeStep[];
}

export const RECIPE_LIMITS = { ingredients: 60, ingredient: 200, servings: 80, steps: 80, step: 1200, section: 120 } as const;

export function parseRecipeRequest(body: unknown): RecipeRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { link?: unknown; lang?: unknown; steps?: unknown };
  const link = parseLinkAddress(raw.link);
  return link ? { link, lang: isLocale(raw.lang) ? raw.lang : 'fr', steps: raw.steps === true } : null;
}

/**
 * The ingredients, each on one line, within the limits. The same line twice stays twice (« 100 g de
 * beurre » for the pastry and again for the filling); only a line repeated right after itself, a
 * page's slip, goes.
 */
export function parseIngredients(value: unknown): string[] {
  const out: string[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const line = cleanText(entry, RECIPE_LIMITS.ingredient);
    if (!line || line.toLowerCase() === out[out.length - 1]?.toLowerCase()) continue;
    out.push(line);
    if (out.length === RECIPE_LIMITS.ingredients) break;
  }
  return out;
}

/** The steps that say something, within the limits. */
export function parseSteps(value: unknown): RecipeStep[] {
  const out: RecipeStep[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const raw = (typeof entry === 'object' && entry !== null ? entry : {}) as { section?: unknown; text?: unknown };
    const text = cleanText(raw.text, RECIPE_LIMITS.step);
    if (text) out.push({ section: cleanText(raw.section, RECIPE_LIMITS.section), text });
    if (out.length === RECIPE_LIMITS.steps) break;
  }
  return out;
}

export function parseRecipeResponse(body: unknown): RecipeResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { ingredients?: unknown; servings?: unknown; steps?: unknown };
  if (!Array.isArray(raw.ingredients)) return null;
  return { ingredients: parseIngredients(raw.ingredients), servings: cleanText(raw.servings, RECIPE_LIMITS.servings), steps: parseSteps(raw.steps) };
}
