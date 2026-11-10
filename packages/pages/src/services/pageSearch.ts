/**
 * Page search: a page's title and the words of its own blocks (text, headings, lists, callouts,
 * code, table cells, file names, what a bookmark or a mention points at, captions), folded as
 * notes are and ranked the same way (`scoreTerms`). A sub-page is a page of its own: its words are
 * not its parent's. Each hit names the block that matched first and a few words around the match.
 */
import { CAPTION_KINDS, RICH_KINDS, type Block, type BlockKind, type BlockTarget } from '../models/blocks';
import { isInBin, type BlockMap, type ChildIndex } from './blocks';
import { dateWords } from '@unlease/core/services/dates';
import { markupToPlain } from '@unlease/core/services/richText';
import { foldText, queryTerms, scoreTerms } from '@unlease/core/services/search';
import { cellText } from './table';

export interface PagePart {
  readonly blockId: string;
  /** As shown, for a snippet. */
  readonly text: string;
  readonly folded: string;
}

export interface PageSearchDocument {
  readonly pageId: string;
  /** Folded. */
  readonly title: string;
  /** Its blocks' words, folded and joined. */
  readonly rest: string;
  readonly parts: readonly PagePart[];
  /** The page's last change, its blocks' included. */
  readonly editedAt: number;
}

export interface PageSearchHit {
  readonly pageId: string;
  readonly score: number;
  /** The first block holding a word of the query, or null when only the title matched. */
  readonly blockId: string | null;
  /** A few words around that match, as written; empty when only the title matched. */
  readonly snippet: string;
}

/** Deeper than any real page: a cycle a merge could make stops here. */
const MAX_DEPTH = 64;
const SNIPPET = 120;

/** What a block says, as text: its words, a table's cells, a file's name, the title of what it points at. */
function blockText(block: Block, blocks: BlockMap, children: ChildIndex, label: (target: BlockTarget) => string): string {
  if (RICH_KINDS.has(block.kind)) return markupToPlain(block.text, label, dateWords);
  switch (block.kind) {
    case 'code':
      return block.text;
    case 'table': {
      const lines = [block.columns.map(column => column.name).join(' · ')];
      for (const rowId of children[block.id] ?? []) {
        const row = blocks[rowId];
        if (row?.kind === 'row') lines.push(block.columns.map(column => cellText(row.cells[column.id], column)).filter(Boolean).join(' · '));
      }
      return lines.join('\n');
    }
    case 'image':
    case 'video':
    case 'pdf':
    case 'file':
      return block.fileName || block.url || '';
    case 'bookmark':
    case 'embed':
      return block.target ? label(block.target) : '';
    default:
      return '';
  }
}

export interface PageBlockText {
  readonly blockId: string;
  readonly kind: BlockKind;
  /** What the block says, its caption after it. */
  readonly text: string;
}

/** A page's own blocks as text, in reading order (a sub-page's words are its own), and its last change, its blocks' included. */
export function pageContent(page: Block, blocks: BlockMap, children: ChildIndex, label: (target: BlockTarget) => string): { readonly parts: readonly PageBlockText[]; readonly editedAt: number } {
  const parts: PageBlockText[] = [];
  let editedAt = page.editedAt;
  const walk = (parent: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    for (const id of children[parent] ?? []) {
      const block = blocks[id];
      if (!block || block.deletedAt !== null || block.kind === 'page') continue;
      editedAt = Math.max(editedAt, block.editedAt);
      const text = [blockText(block, blocks, children, label), CAPTION_KINDS.has(block.kind) ? block.caption : ''].filter(Boolean).join('\n').trim();
      if (text) parts.push({ blockId: block.id, kind: block.kind, text });
      // A table's rows were read with it; anything else may hold blocks (a toggle, a column, a nested item).
      if (block.kind !== 'table') walk(block.id, depth + 1);
    }
  };
  walk(page.id, 0);
  return { parts, editedAt };
}

/** Every live page as a search document, in no particular order. */
export function buildPageDocuments(blocks: BlockMap, children: ChildIndex, label: (target: BlockTarget) => string): PageSearchDocument[] {
  const documents: PageSearchDocument[] = [];
  for (const page of Object.values(blocks)) {
    if (page.kind !== 'page' || page.deletedAt !== null || isInBin(blocks, page.id)) continue;
    const content = pageContent(page, blocks, children, label);
    const parts: PagePart[] = content.parts.map(part => ({ blockId: part.blockId, text: part.text, folded: foldText(part.text) }));
    documents.push({ pageId: page.id, title: foldText(page.text), rest: parts.map(part => part.folded).join('\n'), parts, editedAt: content.editedAt });
  }
  return documents;
}

/** A few words of `text` around `at`, cut at word boundaries, with an ellipsis where it was cut. */
function excerpt(text: string, at: number): string {
  const flat = text.replace(/\s+/g, ' ');
  if (flat.length <= SNIPPET) return flat;
  let start = Math.max(0, at - 36);
  if (start > 0) {
    const space = flat.indexOf(' ', start);
    start = space !== -1 && space < at ? space + 1 : start;
  }
  let end = Math.min(flat.length, start + SNIPPET);
  if (end < flat.length) {
    const space = flat.lastIndexOf(' ', end);
    if (space > at) end = space;
  }
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}

/** Pages matching every term, best first (then the most recently changed). An empty query matches nothing. */
export function searchPageDocuments(documents: readonly PageSearchDocument[], query: string): PageSearchHit[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const hits: (PageSearchHit & { editedAt: number })[] = [];
  for (const doc of documents) {
    const score = scoreTerms(doc.title, doc.rest, terms);
    if (score === null) continue;
    // The block to show: the first holding a term the title does not. When the title holds them all,
    // the page opens at its head and its first words stand for it.
    const wanted = terms.filter(term => !doc.title.includes(term));
    let blockId: string | null = null;
    let snippet = wanted.length === 0 && doc.parts[0] ? excerpt(doc.parts[0].text, 0) : '';
    if (wanted.length > 0) {
      for (const part of doc.parts) {
        const term = wanted.find(candidate => part.folded.includes(candidate));
        if (term === undefined) continue;
        blockId = part.blockId;
        // Folding keeps lengths (bar a ligature), so the folded index finds the match in the text as written.
        snippet = excerpt(part.text, part.folded.replace(/\s+/g, ' ').indexOf(term));
        break;
      }
    }
    hits.push({ pageId: doc.pageId, score, blockId, snippet, editedAt: doc.editedAt });
  }
  hits.sort((a, b) => b.score - a.score || b.editedAt - a.editedAt);
  return hits.map(({ pageId, score, blockId, snippet }) => ({ pageId, score, blockId, snippet }));
}
