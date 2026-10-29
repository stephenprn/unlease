/**
 * A collection shown as a table in a page: one row per link, its properties as columns. The title
 * leads every row and always shows; the other columns are the link's own fields (site, kind, price,
 * summary, the person's note, the day it was added, its address) and the facts Claude read
 * (`attributes`), one column per label some link carries. The person orders them and shows or hides
 * them (`viewColumns` on the embed block); a column never placed comes after the placed ones, shown
 * or not by what the links hold. No column can be added: a new row is a new link.
 */
import { localized, tx } from '@unlease/core/i18n';
import { VIEW_LIMITS, type ViewColumn } from '../models/blocks';
import { LINK_KIND_NAMES, type LinkItem, type LinkKind } from '../models/entities';
import { formatDay, formatPrice } from '@unlease/core/services/format';
import { FACT_LABELS, linkRowText } from './linkRow';
import { foldText } from '@unlease/core/services/search';
import { prettyUrl, siteDomain } from '@unlease/core/services/url';

/** The link's own fields a column can show. */
export type LinkField = 'site' | 'kind' | 'price' | 'summary' | 'comment' | 'added' | 'url';

const FIELD_NAMES: Record<LinkField, string> = localized({
  site: tx('Site'),
  kind: tx('Type'),
  price: tx('Prix'),
  summary: tx('Résumé'),
  comment: tx('Votre note'),
  added: tx('Ajouté le'),
  url: tx('Adresse'),
});

export interface CollectionColumn {
  /** A `LinkField`, or `fact:` and a fact's label as `factLabel` reads it. */
  readonly key: string;
  readonly name: string;
  readonly shown: boolean;
}

const FACT = 'fact:';
/** Facts a field's column already says: the site, and a price (an event's) when the link has none of its own. */
const SITE_FACTS = new Set(['source', 'site']);
const PRICE_FACTS = new Set(['prix', 'price']);
/** Shown at first: the facts at least a third of the links carry, four at most. */
const FACT_SHARE = 1 / 3;
const FACTS_SHOWN = 4;

/** A fact's label as one column: "Taille(s)", "Tailles" and "taille" are the same. */
function factLabel(label: string): string {
  return foldText(label)
    .replace(/\(s\)/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/s\b/g, '');
}

const factKey = (folded: string): string => `${FACT}${folded}`.slice(0, VIEW_LIMITS.key);

function factValue(link: LinkItem, matches: (label: string) => boolean): string {
  const values = link.attributes.flatMap(({ label, value }) => (value.trim() && matches(factLabel(label)) ? [value.trim()] : []));
  return [...new Set(values)].join(' · ');
}

/** The columns these links can fill besides the title, in their first order, each shown or not as it starts. */
export function collectionColumns(links: readonly LinkItem[]): CollectionColumn[] {
  const kinds = new Map<LinkKind, number>();
  const facts = new Map<string, { readonly name: string; count: number; readonly first: number }>();
  let priced = false;
  let noted = false;
  for (const link of links) {
    kinds.set(link.kind, (kinds.get(link.kind) ?? 0) + 1);
    if (link.price !== null) priced = true;
    if (link.comment.trim()) noted = true;
    const counted = new Set<string>();
    for (const { label, value } of link.attributes) {
      const folded = factLabel(label);
      if (!folded || !value.trim() || SITE_FACTS.has(folded)) continue;
      if (PRICE_FACTS.has(folded)) {
        priced = true;
        continue;
      }
      const key = factKey(folded);
      if (counted.has(key)) continue;
      counted.add(key);
      const fact = facts.get(key);
      if (fact) fact.count += 1;
      else facts.set(key, { name: label.trim(), count: 1, first: facts.size });
    }
  }
  // The labels Claude writes for the kind most links are, in their order, then the most carried.
  const main = [...kinds].sort((a, b) => b[1] - a[1])[0]?.[0];
  const wanted = main ? FACT_LABELS[main].map(factLabel) : [];
  const rank = (key: string): number => {
    const at = wanted.findIndex(label => key.slice(FACT.length).startsWith(label));
    return at === -1 ? wanted.length : at;
  };
  const byCount = (a: { count: number; first: number }, b: { count: number; first: number }): number => b.count - a.count || a.first - b.first;
  const enough = Math.max(1, Math.ceil(links.length * FACT_SHARE));
  const shownFacts = new Set(
    [...facts]
      .filter(([, fact]) => fact.count >= enough)
      .sort(([, a], [, b]) => byCount(a, b))
      .slice(0, FACTS_SHOWN)
      .map(([key]) => key),
  );
  const field = (key: LinkField, shown: boolean): CollectionColumn => ({ key, name: FIELD_NAMES[key], shown });
  return [
    field('site', true),
    field('kind', kinds.size > 1),
    field('price', priced),
    ...[...facts].sort(([a, x], [b, y]) => rank(a) - rank(b) || byCount(x, y)).map(([key, fact]) => ({ key, name: fact.name, shown: shownFacts.has(key) })),
    field('summary', false),
    field('comment', noted),
    field('added', false),
    field('url', false),
  ];
}

/** What a link shows in a column, as text (empty when it has nothing there). */
export function linkCell(link: LinkItem, key: string, now: number): string {
  switch (key) {
    case 'site':
      // As the list says it: a site named like the link's own title gives its domain instead.
      return linkRowText(link).source || siteDomain(link.url);
    case 'kind':
      return LINK_KIND_NAMES[link.kind];
    case 'price':
      return link.price !== null ? formatPrice(link.price, link.currency) : factValue(link, label => PRICE_FACTS.has(label));
    case 'summary':
      return link.summary;
    case 'comment':
      return link.comment;
    case 'added':
      return formatDay(link.createdAt, now);
    case 'url':
      return prettyUrl(link.url);
    default:
      return key.startsWith(FACT) ? factValue(link, label => factKey(label) === key) : '';
  }
}

/** The columns in the person's order and choice, then those never placed, as they start; a placed one no link fills now is left out. */
export function arrangeColumns(columns: readonly CollectionColumn[], placed: readonly ViewColumn[]): CollectionColumn[] {
  const waiting = new Map(columns.map(column => [column.key, column]));
  const out: CollectionColumn[] = [];
  for (const entry of placed) {
    const column = waiting.get(entry.key);
    if (!column) continue;
    waiting.delete(entry.key);
    out.push({ ...column, shown: entry.shown });
  }
  for (const column of columns) if (waiting.has(column.key)) out.push(column);
  return out;
}

/** What the block keeps: every column as arranged, then those placed before that no link fills now, so they come back where they were. */
function kept(arranged: readonly CollectionColumn[], placed: readonly ViewColumn[]): ViewColumn[] {
  const keys = new Set(arranged.map(column => column.key));
  return [...arranged.map(({ key, shown }) => ({ key, shown })), ...placed.filter(entry => !keys.has(entry.key)).map(({ key, shown }) => ({ key, shown }))].slice(0, VIEW_LIMITS.columns);
}

/** Where a column goes to stand right after the last one shown. */
const afterShown = (columns: readonly CollectionColumn[]): number => columns.reduce((last, column, index) => (column.shown ? index + 1 : last), 0);

/** A shown column moved to `index` among the shown ones (the hidden ones keep their places). */
export function placeColumn(arranged: readonly CollectionColumn[], placed: readonly ViewColumn[], key: string, index: number): ViewColumn[] {
  const column = arranged.find(entry => entry.key === key);
  if (!column) return kept(arranged, placed);
  const others = arranged.filter(entry => entry.key !== key);
  const shown = others.filter(entry => entry.shown);
  const before = shown[Math.max(0, index)];
  others.splice(before ? others.indexOf(before) : afterShown(others), 0, column);
  return kept(others, placed);
}

/** A column shown or hidden; one shown again goes after the last one shown, where it is seen. */
export function showColumn(arranged: readonly CollectionColumn[], placed: readonly ViewColumn[], key: string, shown: boolean): ViewColumn[] {
  const at = arranged.findIndex(entry => entry.key === key);
  if (at === -1) return kept(arranged, placed);
  const others = arranged.filter(entry => entry.key !== key);
  others.splice(shown ? afterShown(others) : at, 0, { ...arranged[at]!, shown });
  return kept(others, placed);
}
