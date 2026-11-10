/**
 * The spotlight's documents, across the suite: each app turns what it holds into documents for the
 * search engine (`searchIndex`), keyed by a type of its own and an id (Carnet's notes, collections and
 * links, Pages' pages). A client searches the documents of every app it shows.
 */

/** What a document is, for showing and opening it: a type of one app (`note`, `collection`, `link`, `page`), or one a newer client added. */
export interface SpotMeta {
  readonly type: string;
  readonly id: string;
  /** A note's labels; none for anything else. */
  readonly labelIds: readonly string[];
  /** An archived note or collection, or a link in one. */
  readonly archived: boolean;
  /** Where it sits: a page's page, a link's collection; null at the top. */
  readonly within: string | null;
}

/** A document's key: its type and its id. */
export const spotKey = (type: string, id: string): string => `${type}:${id}`;

/** A key's type and id, or null for a key no document could have (`types`: the types the caller shows). */
export function parseSpotKey<T extends string>(key: string, types: readonly T[]): { readonly type: T; readonly id: string } | null {
  const at = key.indexOf(':');
  const type = key.slice(0, at) as T;
  return at > 0 && types.includes(type) ? { type, id: key.slice(at + 1) } : null;
}
