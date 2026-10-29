/**
 * Simple search: every query word must appear in a document, accent- and case-insensitively.
 * An in-memory scan over pre-folded documents (each app builds its own, as Carnet's notes do in
 * `noteSearch`); title hits rank first, then the most recent. The ranked full-text engine is
 * `searchIndex`.
 */

const FOLD: Record<string, string> = {
  à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a', å: 'a',
  ç: 'c',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ñ: 'n',
  ó: 'o', ò: 'o', ô: 'o', ö: 'o', õ: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ý: 'y', ÿ: 'y',
  œ: 'oe', æ: 'ae', ß: 'ss',
  '’': "'",
};

/** Lowercase, accents stripped by table: `normalize('NFD')` is not guaranteed in Hermes. */
export function foldText(value: string): string {
  const lower = value.toLowerCase();
  let out = '';
  for (const char of lower) out += FOLD[char] ?? char;
  return out;
}

export function queryTerms(query: string): string[] {
  return foldText(query)
    .split(/[\s,;]+/)
    .map(term => term.trim())
    .filter(term => term.length > 0);
}

export interface SearchDocument {
  readonly noteId: string;
  /** Folded. */
  readonly title: string;
  /** Everything else, folded and joined. */
  readonly rest: string;
  readonly editedAt: number;
}

export interface SearchHit {
  readonly noteId: string;
  readonly score: number;
}

/**
 * How well a folded title and body hold every term (a title hit outranks a body hit, a word's start
 * outranks its middle), or null when a term is missing. Notes and pages rank the same way.
 */
export function scoreTerms(title: string, rest: string, terms: readonly string[]): number | null {
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += startsWord(title, term) ? 4 : 3;
    else if (rest.includes(term)) score += startsWord(rest, term) ? 2 : 1;
    else return null;
  }
  return score;
}

/** Notes matching every term, best first. An empty query matches nothing. */
export function searchDocuments(documents: readonly SearchDocument[], query: string): SearchHit[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const hits: (SearchHit & { editedAt: number })[] = [];
  for (const doc of documents) {
    const score = scoreTerms(doc.title, doc.rest, terms);
    if (score !== null) hits.push({ noteId: doc.noteId, score, editedAt: doc.editedAt });
  }
  hits.sort((a, b) => b.score - a.score || b.editedAt - a.editedAt);
  return hits.map(({ noteId, score }) => ({ noteId, score }));
}

function startsWord(haystack: string, term: string): boolean {
  let index = haystack.indexOf(term);
  while (index !== -1) {
    if (index === 0 || /[\s\-_'"(/.,:;!?]/.test(haystack[index - 1]!)) return true;
    index = haystack.indexOf(term, index + 1);
  }
  return false;
}

/**
 * Merged ranges over the *original* string, for highlighting.
 * Ligatures (œ, æ, ß) fold to two characters and drift the ranges by one: accepted.
 */
export function matchRanges(text: string, query: string): [number, number][] {
  const folded = foldText(text);
  const ranges: [number, number][] = [];
  for (const term of queryTerms(query)) {
    let index = folded.indexOf(term);
    while (index !== -1) {
      ranges.push([index, Math.min(text.length, index + term.length)]);
      index = folded.indexOf(term, index + term.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}
