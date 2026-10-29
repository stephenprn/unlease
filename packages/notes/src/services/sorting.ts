/**
 * What the apps ask Claude to sort (`notes/sync/sorting.ts`), and which links may be sorted
 * without asking about each one. The server files a new link from `sortTargets` too, so Claude
 * sees a collection the same way whether it files one new link or sorts old ones.
 */
import { t } from '@unlease/core/i18n';
import { INBOX_ID, INBOX_TITLE, type LinkItem, type Note } from '../models/entities';
import { SORT_LIMITS, type SortLink, type SortMove, type SortTarget } from '../sync/sorting';
import { plural } from '@unlease/core/services/format';
import { foldText } from '@unlease/core/services/search';

/** Each collection as Claude reads it: its name, its sentence and the titles of its newest links. */
export function sortTargets(lines: readonly Note[], links: readonly LinkItem[], examplesPerLine = 5): SortTarget[] {
  const examples = new Map<string, string[]>(lines.map(line => [line.id, []]));
  const titled = links.filter(link => link.deletedAt === null && link.title && examples.has(link.noteId)).sort((a, b) => b.createdAt - a.createdAt);
  for (const link of titled) {
    const list = examples.get(link.noteId)!;
    if (list.length < examplesPerLine) list.push(link.title);
  }
  return lines.map(line => ({
    id: line.id,
    title: line.title.trim() || (line.id === INBOX_ID ? INBOX_TITLE : 'Sans titre'),
    hint: line.hint,
    examples: examples.get(line.id)!,
  }));
}

/** At most as many targets as a request may carry, `keep` (a reviewed collection) always among them. */
export function capTargets(targets: readonly SortTarget[], keep: string | null = null): SortTarget[] {
  if (targets.length <= SORT_LIMITS.targets) return [...targets];
  const kept = targets.find(target => target.id === keep);
  const others = targets.filter(target => target.id !== keep).slice(0, SORT_LIMITS.targets - (kept ? 1 : 0));
  return kept ? [kept, ...others] : others;
}

/** A link as Claude reads it when sorting: what its reading found, without its pictures. */
export function sortLink(link: LinkItem): SortLink {
  return {
    id: link.id,
    url: link.url,
    title: link.title,
    site: link.siteName,
    kind: link.kind,
    summary: link.summary,
    facts: link.attributes.map(fact => `${fact.label} : ${fact.value}`),
  };
}

/** Not deleted, and not being read: a link still pending is filed by its reading when it was asked to be. */
export function sortable(link: LinkItem): boolean {
  return link.deletedAt === null && link.status !== 'pending';
}

/** What "Ranger Non classé" sorts: its links, except those the person put there themselves. */
export function inboxToSort(links: readonly LinkItem[]): LinkItem[] {
  return links.filter(link => link.noteId === INBOX_ID && sortable(link) && link.filedBy !== 'person');
}

/** The notes among `ids` whose deletion first asks where their links go: collections holding links, never "Non classé". */
export function collectionsWithLinks(ids: readonly string[], notes: Readonly<Record<string, Note>>, linksByNote: Readonly<Record<string, readonly string[]>>): string[] {
  return ids.filter(id => id !== INBOX_ID && notes[id]?.kind === 'links' && (linksByNote[id]?.length ?? 0) > 0);
}

/** "4 liens rangés dans Recettes", or "12 liens rangés dans 3 collections". */
export function sortedSummary(moved: readonly SortMove[], titleOf: (lineId: string) => string): string {
  const targets = [...new Set(moved.map(move => move.to))];
  const links = plural(moved.length, 'lien rangé', 'liens rangés');
  return targets.length === 1 ? t('{links} dans {collection}', { links, collection: titleOf(targets[0]!) }) : t('{links} dans {count} collections', { links, count: targets.length });
}

/** False when an edit of a collection's name and sentence only fixed a typo; otherwise its links are worth checking again. */
export function meaningChanged(before: { readonly title: string; readonly hint: string }, after: { readonly title: string; readonly hint: string }): boolean {
  return !nearlySame(before.title, after.title, 4) || !nearlySame(before.hint, after.hint, 10);
}

/** Equal once folded, or at most three letters apart with `per` letters of text for each. */
function nearlySame(a: string, b: string, per: number): boolean {
  const x = foldText(a).replace(/\s+/g, ' ').trim();
  const y = foldText(b).replace(/\s+/g, ' ').trim();
  if (x === y) return true;
  if (Math.abs(x.length - y.length) > 3) return false;
  const distance = editDistance(x, y);
  return distance <= 3 && distance * per <= Math.max(x.length, y.length);
}

/** Levenshtein distance. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}
