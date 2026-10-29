/**
 * URL lists as filing targets. Each list is offered to Claude with its
 * description and a few titles already in it, which says more about what
 * "Mode" or "À voir" means to this person than the title alone.
 */
import { INBOX_ID, INBOX_TITLE, type LinkKind } from '@unlease/notes/models/entities';
import { comparePositions } from '@unlease/core/services/fractionalIndex';
import { foldText } from '@unlease/core/services/search';
import { sortTargets } from '@unlease/notes/services/sorting';
import { linkFromRecord, noteFromRecord } from '@unlease/notes/sync/entities';
import type { RecordStore } from '../../../sync/records';
import { clipText } from './output';
import type { CachedAnalysis } from './usage';

export interface RoutingList {
  readonly id: string;
  readonly title: string;
  readonly hint: string;
  readonly examples: readonly string[];
}

const EXAMPLES_PER_LIST = 5;

/** Every live URL list (not deleted, not in the bin), the inbox always included. */
export function routingLists(records: RecordStore): RoutingList[] {
  const notes = records
    .ofType('note')
    .map(noteFromRecord)
    .filter(note => note.kind === 'links' && note.deletedAt === null && note.trashedAt === null)
    .sort(comparePositions);
  if (!notes.some(note => note.id === INBOX_ID)) notes.push(noteFromRecord({ type: 'note', id: INBOX_ID, fields: { kind: 'links', title: INBOX_TITLE }, clocks: {} }));
  return sortTargets(notes, records.ofType('link').map(linkFromRecord), EXAMPLES_PER_LIST).map(target => ({
    id: target.id,
    title: clipText(target.title, 100),
    hint: clipText(target.hint, 300),
    examples: target.examples.map(example => clipText(example, 120)),
  }));
}

/** Words a list title uses for each kind, French then English, folded (no accents). */
const KIND_WORDS: Record<LinkKind, readonly string[]> = {
  product: ['achat', 'shopping', 'envie', 'wishlist', 'cadeau', 'buy', 'gift', 'wish', 'shop'],
  film: ['film', 'cinema', 'movie'],
  series: ['serie', 'show', 'tv'],
  book: ['livre', 'bouquin', 'lecture', 'book', 'reading'],
  music: ['musique', 'album', 'chanson', 'playlist', 'music', 'song'],
  game: ['jeu', 'jeux', 'gaming', 'game', 'games', 'console'],
  restaurant: ['restaurant', 'resto', 'bar', 'cafe', 'manger', 'food', 'eat', 'dining'],
  place: ['lieu', 'visite', 'voyage', 'sortie', 'place', 'visit', 'travel', 'trip'],
  recipe: ['recette', 'cuisine', 'recipe', 'cooking'],
  article: ['article', 'lecture', 'lire', 'read'],
  video: ['video'],
  event: ['evenement', 'concert', 'expo', 'sortie', 'event', 'exhibition', 'gig'],
  other: [],
};

/**
 * Where a cached result goes without asking Claude again: the list it was
 * filed in last time (renamed or not), else one with that list's name, else a
 * list whose title names the kind, else the inbox.
 */
export function routeCached(lists: readonly RoutingList[], cached: CachedAnalysis): string {
  const fold = (value: string) => foldText(value).trim();
  const kept = cached.listId ? lists.find(list => list.id === cached.listId) : undefined;
  if (kept) return kept.id;
  if (cached.listTitle) {
    const same = lists.find(list => fold(list.title) === fold(cached.listTitle!));
    if (same) return same.id;
  }
  const words = KIND_WORDS[cached.kind] ?? [];
  for (const list of lists) {
    if (list.id === INBOX_ID) continue;
    const tokens = fold(list.title).split(/[^a-z0-9]+/);
    if (words.some(word => tokens.some(token => token.startsWith(word)))) return list.id;
  }
  return INBOX_ID;
}
