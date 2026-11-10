/**
 * Carnet's gift ideas: the links of its « Cadeaux » collection (`POST /api/notes/gifts` makes and
 * finds it, by the names below in either language), each for the people it names (`contactIds`).
 * A link kept by an older client names its person in its comment only (« Pour Léa Martin »): it is
 * found by the name there.
 */
import { foldText } from '@unlease/core/services/search';
import type { LinkItem, Note } from '../models/entities';

/** The names the gift collection goes by, folded: the server finds a collection made by hand by them too. */
export const GIFT_COLLECTION_NAMES: ReadonlySet<string> = new Set(['cadeaux', 'cadeau', 'idees cadeaux', 'idees de cadeaux', 'gifts', 'gift', 'gift ideas', 'presents']);

/** A live collection named as the gift collection is. */
export function isGiftCollection(note: Note): boolean {
  return note.kind === 'links' && note.deletedAt === null && note.trashedAt === null && GIFT_COLLECTION_NAMES.has(foldText(note.title.trim()));
}

export interface GiftPerson {
  /** The contact's id and those merged into it. */
  readonly ids: readonly string[];
  /** Their name as shown, for the links an older client kept (their comment names them). */
  readonly name: string;
}

/** The gift ideas kept for someone, those still to buy first, then the newest. */
export function giftIdeasFor(notes: Readonly<Record<string, Note>>, links: Readonly<Record<string, LinkItem>>, person: GiftPerson): LinkItem[] {
  const collections = new Set(Object.values(notes).filter(isGiftCollection).map(note => note.id));
  if (collections.size === 0) return [];
  const name = foldText(person.name.trim());
  const first = name.split(/\s+/)[0] ?? '';
  const named = (link: LinkItem): boolean => {
    if (link.contactIds.some(id => person.ids.includes(id))) return true;
    // An older client's: the comment says for whom (the first name alone, once long enough to mean someone).
    if (link.contactIds.length > 0 || !name) return false;
    const comment = foldText(link.comment);
    return comment.includes(name) || (first.length >= 3 && comment.includes(first));
  };
  return Object.values(links)
    .filter(link => link.deletedAt === null && collections.has(link.noteId) && named(link))
    .sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt);
}
