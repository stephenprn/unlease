/**
 * What Claude answers, and how it becomes link fields. The schema is sent as
 * the structured-output format; the API enforces its shape but not lengths or
 * ranges, so `normalizeOutput` clips and checks everything against the core
 * link schema rather than trusting it.
 */
import { z } from 'zod';
import { LINK_KINDS, type LinkAttribute, type LinkKind } from '@unlease/notes/models/entities';

export const LinkOutputSchema = z.object({
  title: z.string().describe('The clean name of the thing itself, without the site name.'),
  site: z.string().describe('The site or brand as people write it, e.g. "Komono", "Leroy Merlin", "X".'),
  kind: z.enum(LINK_KINDS),
  summary: z.string().describe('One or two factual sentences in the message\'s language, at most 240 characters.'),
  price: z
    .object({
      amount: z.number().describe("In the currency's main unit, e.g. 49.9"),
      currency: z.string().describe('ISO 4217 code, e.g. EUR'),
    })
    .nullable()
    .describe('Only when the page sells the thing; the lowest current price for a range.'),
  attributes: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .describe('At most 6 short facts, in the message\'s language, chosen for the kind.'),
  imageIndex: z.number().nullable().describe('Index of the best image candidate, or null.'),
  listId: z.string().nullable().describe('The chosen list id when filing is asked for, else null.'),
  pageRead: z.boolean().describe('false only when the page could not be read and the answer comes from the URL alone.'),
});

export type RawOutput = z.infer<typeof LinkOutputSchema>;

/** A sorting answer: numbers from the message, checked against it by the sorter. */
export const SortOutputSchema = z.object({
  moves: z.array(z.object({ link: z.number().int(), to: z.number().int() })),
});

export type SortOutput = z.infer<typeof SortOutputSchema>;

/** The same, in the JSON Schema subset the API accepts. */
export const SORT_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    moves: {
      type: 'array',
      items: {
        type: 'object',
        properties: { link: { type: 'integer' }, to: { type: 'integer' } },
        required: ['link', 'to'],
        additionalProperties: false,
      },
    },
  },
  required: ['moves'],
  additionalProperties: false,
};

/** A recipe's ingredients, when its page's structured data gave none. */
export const IngredientsOutputSchema = z.object({
  ingredients: z.array(z.string()),
  servings: z.string(),
  steps: z.array(z.object({ section: z.string(), text: z.string() })),
});

export const INGREDIENTS_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    ingredients: { type: 'array', items: { type: 'string' } },
    servings: { type: 'string' },
    steps: {
      type: 'array',
      items: { type: 'object', properties: { section: { type: 'string' }, text: { type: 'string' } }, required: ['section', 'text'], additionalProperties: false },
    },
  },
  required: ['ingredients', 'servings', 'steps'],
  additionalProperties: false,
};

export interface LinkOutput {
  readonly title: string;
  readonly site: string;
  readonly kind: LinkKind;
  readonly summary: string;
  readonly price: number | null;
  readonly currency: string | null;
  readonly attributes: readonly LinkAttribute[];
  readonly imageIndex: number | null;
  readonly listId: string | null;
  readonly pageRead: boolean;
}

const SYMBOLS: Record<string, string> = { '€': 'EUR', $: 'USD', 'US$': 'USD', '£': 'GBP', '¥': 'JPY', CA$: 'CAD' };

export function clipText(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(' ', max - 1);
  return `${text.slice(0, cut > max * 0.6 ? cut : max - 1).replace(/[\s,;:.]+$/, '')}…`;
}

function currencyCode(value: string): string | null {
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) return upper;
  return SYMBOLS[trimmed] ?? null;
}

export function normalizeOutput(raw: RawOutput, candidateCount: number): LinkOutput {
  const amount = raw.price && Number.isFinite(raw.price.amount) && raw.price.amount >= 0 && raw.price.amount < 1e9 ? raw.price.amount : null;
  const currency = raw.price && amount !== null ? currencyCode(raw.price.currency) : null;
  const labels = new Set<string>();
  const attributes: LinkAttribute[] = [];
  for (const { label, value } of raw.attributes) {
    const cleanLabel = clipText(label, 60);
    const cleanValue = clipText(value, 300);
    if (!cleanLabel || !cleanValue || labels.has(cleanLabel.toLowerCase())) continue;
    labels.add(cleanLabel.toLowerCase());
    attributes.push({ label: cleanLabel, value: cleanValue });
    if (attributes.length === 6) break;
  }
  const index = raw.imageIndex === null ? null : Math.round(raw.imageIndex);
  return {
    title: clipText(raw.title, 500),
    site: clipText(raw.site, 60),
    kind: raw.kind,
    summary: clipText(raw.summary, 240),
    price: amount !== null && currency !== null ? Math.round(amount * 100) / 100 : null,
    currency: amount !== null ? currency : null,
    attributes,
    imageIndex: index !== null && index >= 0 && index < candidateCount ? index : null,
    listId: raw.listId?.trim() || null,
    pageRead: raw.pageRead,
  };
}
