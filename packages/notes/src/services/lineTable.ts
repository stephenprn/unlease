/**
 * A collection as a table (`LineLayout` `table`, both clients): beside each link's title, where it
 * comes from and its price, a column for each fact Claude reads on most of its links (« Marque »,
 * « Couleur », « Réalisateur »…), so they compare side by side. The columns come from the links
 * themselves: a fact on a single link of many is left to its page, never a column of blanks.
 */
import { foldText } from '@unlease/core/services/search';
import type { LinkItem, LinkKind } from '../models/entities';
import { FACT_LABELS, NEVER_FACTS } from './linkRow';

/** A desk screen shows four beside the title, the site and the price; the phone scrolls them sideways. */
export const MAX_TABLE_COLUMNS = 4;

export interface LineColumn {
  /** The label folded (case and accents aside): « Couleur » and « couleur » are one column. */
  readonly key: string;
  /** As Claude wrote it on most of the links. */
  readonly label: string;
}

type Tabled = Pick<LinkItem, 'kind' | 'attributes'>;

/** The kind most of the links are: its facts lead, in the order a row shows them. */
function mainKind(links: readonly Tabled[]): LinkKind {
  const counts = new Map<LinkKind, number>();
  for (const link of links) counts.set(link.kind, (counts.get(link.kind) ?? 0) + 1);
  let best: LinkKind = 'other';
  for (const [kind, count] of counts) if (count > (counts.get(best) ?? 0)) best = kind;
  return best;
}

/** Where a label stands among its kind's facts (`FACT_LABELS`); one the kind does not name comes after them. */
function rank(key: string, kind: LinkKind): number {
  const at = FACT_LABELS[kind].findIndex(wanted => key.startsWith(foldText(wanted)));
  return at === -1 ? FACT_LABELS[kind].length : at;
}

/**
 * The facts worth a column: those on two links at least and on a third of them (on one link when
 * it is alone), the kind's own first, then the most worn; never the source or the price, which have
 * their own.
 */
export function lineColumns(links: readonly Tabled[]): LineColumn[] {
  const seen = new Map<string, { count: number; first: number; spellings: Map<string, number> }>();
  let order = 0;
  for (const link of links) {
    const worn = new Set<string>();
    for (const { label, value } of link.attributes) {
      const key = foldText(label.trim());
      if (!key || NEVER_FACTS.has(key) || !value.trim() || worn.has(key)) continue;
      worn.add(key);
      const entry = seen.get(key) ?? { count: 0, first: order++, spellings: new Map<string, number>() };
      entry.count += 1;
      entry.spellings.set(label.trim(), (entry.spellings.get(label.trim()) ?? 0) + 1);
      seen.set(key, entry);
    }
  }
  const kind = mainKind(links);
  const enough = Math.min(2, links.length);
  return [...seen.entries()]
    .filter(([, entry]) => entry.count >= enough && entry.count * 3 >= links.length)
    .sort(([a, x], [b, y]) => rank(a, kind) - rank(b, kind) || y.count - x.count || x.first - y.first)
    .slice(0, MAX_TABLE_COLUMNS)
    .map(([key, entry]) => ({ key, label: [...entry.spellings.entries()].sort((x, y) => y[1] - x[1])[0]![0] }));
}

/** What a link says under a column, or '' when Claude did not read it there. */
export function columnValue(link: Pick<LinkItem, 'attributes'>, column: LineColumn): string {
  return link.attributes.find(attribute => foldText(attribute.label.trim()) === column.key)?.value.trim() ?? '';
}
