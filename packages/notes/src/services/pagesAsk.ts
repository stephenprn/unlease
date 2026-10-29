/**
 * "Demander à Claude" on the pages, what both apps share: which pages a question reads (this page,
 * its sub-pages, or the pages closest to the question), each as the blocks Claude may cite, within
 * what the Administration lets one question send; what a question may cost; and the answer's words
 * as the apps show, copy and lay them back into a page.
 */
import { t, tx } from '@unlease/core/i18n';
import { CAPTION_KINDS, RICH_KINDS, UNTITLED_PAGE, type Block, type BlockTarget } from '../models/blocks';
import type { CheckItem, LinkItem, Note } from '../models/entities';
import type { AskBlock, AskPage, PageScope, PagesAnswerPart, PagesAskResponse, PagesCitation } from '../sync/pagesAsk';
import { PAGES_ASK_LIMITS } from '../sync/pagesAsk';
import { isInBin, listNumber, subPages, type BlockMap, type ChildIndex } from './blocks';
import { formatNumber } from '@unlease/core/services/format';
import { pageContent } from './pageSearch';
import { blocksFromText, richToMarkdown, type BlockDraft } from './pageText';
import { dateForReading } from '@unlease/core/services/dates';
import { bodyMarkdown } from './noteBody';
import { serializeRich, type Run } from '@unlease/core/services/richText';
import { buildIndex, parseQuery, search, type SearchDoc } from '@unlease/core/services/searchIndex';
import { linkTitle } from './spotlight';
import { cellText } from './table';

/** The Administration's « how it works » for the questions on the pages, the same on both apps. */
export const PAGES_ASK_INFO = tx(
  'Une question sur une page, ses sous-pages ou toutes vos pages : l’appareil envoie leur texte à Claude par votre serveur, avec la clé et le budget de la lecture des liens. Claude répond d’après elles et cite les passages ; rien n’est gardé sur le serveur. Une page « gardée hors de Claude » n’est jamais envoyée, ni ses sous-pages.',
);

/** The library as a question reads it: the pages, and what they embed or point at. */
export interface AskLibrary {
  readonly blocks: BlockMap;
  readonly blocksByParent: ChildIndex;
  readonly notes: Readonly<Record<string, Note>>;
  readonly checks: Readonly<Record<string, CheckItem>>;
  readonly links: Readonly<Record<string, LinkItem>>;
  readonly checksByNote: Readonly<Record<string, readonly string[]>>;
  readonly linksByNote: Readonly<Record<string, readonly string[]>>;
}

/** Deeper than any real page: a cycle a merge could make stops here. */
const MAX_DEPTH = 64;
/** What an embedded note or collection brings with it at most. */
const EMBED_CHARS = 3000;
const EMBED_LINKS = 40;

const live = (block: Block | undefined): block is Block => !!block && block.deletedAt === null;

/** Whether a page is kept away from Claude: it, or a page above it, is private. */
export function isPrivatePage(blocks: BlockMap, pageId: string): boolean {
  let id: string | null = pageId;
  for (let depth = 0; id && depth < MAX_DEPTH; depth += 1) {
    const block: Block | undefined = blocks[id];
    if (!block) return false;
    if (block.kind === 'page' && block.private) return true;
    id = block.parentId;
  }
  return false;
}

/** A page's title as the conversation shows it. */
export const askTitle = (page: Block | undefined): string => page?.text.trim() || t(UNTITLED_PAGE);

/** A page's title as Claude reads it: nothing sent to Claude is translated. */
const sentTitle = (page: Block | undefined): string => page?.text.trim() || 'Untitled';

/** Where a page sits, its own title last: « Voyages › Lisbonne » (`title` names each page: as shown, or as sent). */
export function pagePath(blocks: BlockMap, pageId: string, title: (page: Block) => string = askTitle): string {
  const titles: string[] = [];
  let id: string | null = pageId;
  for (let depth = 0; id && depth < MAX_DEPTH; depth += 1) {
    const block: Block | undefined = blocks[id];
    if (!block) break;
    if (block.kind === 'page') titles.unshift(title(block));
    id = block.parentId;
  }
  return titles.join(' › ');
}

const clip = (text: string, limit: number): string => (text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text);

/** A note embedded in a page: its title, then its text or its list. */
function noteWords(library: AskLibrary, id: string): string {
  const note = library.notes[id];
  if (!note || note.deletedAt !== null) return '';
  if (note.kind === 'links') {
    const titles = (library.linksByNote[id] ?? []).flatMap(linkId => {
      const link = library.links[linkId];
      return link && link.deletedAt === null ? [`- ${linkTitle(link)}${link.done ? ' ✓' : ''}`] : [];
    });
    return [`Collection "${note.title.trim() || 'Inbox'}":`, ...titles.slice(0, EMBED_LINKS)].join('\n');
  }
  const head = note.title.trim() ? `Note "${note.title.trim()}":` : 'Note:';
  if (note.kind === 'checklist') {
    const items = (library.checksByNote[id] ?? []).flatMap(checkId => {
      const check = library.checks[checkId];
      return check && check.deletedAt === null && check.text.trim() ? [`${'  '.repeat(check.indent)}- [${check.checked ? 'x' : ' '}] ${check.text.trim()}`] : [];
    });
    return clip([head, ...items].join('\n'), EMBED_CHARS);
  }
  return clip(`${head}\n${bodyMarkdown(note).trim()}`, EMBED_CHARS);
}

/** A link pointed at or embedded: what its reading kept, and the person's own note on it. */
function linkWords(library: AskLibrary, id: string): string {
  const link = library.links[id];
  if (!link || link.deletedAt !== null) return '';
  const facts = link.attributes.slice(0, 6).map(fact => `${fact.label}: ${fact.value}`);
  const lines = [`Link "${linkTitle(link)}" (${link.url})`, link.summary.trim(), ...facts, link.comment.trim() ? `Their note: ${link.comment.trim()}` : ''];
  return clip(lines.filter(Boolean).join('\n'), EMBED_CHARS);
}

/** What a bookmark or an embed stands for. */
function targetWords(library: AskLibrary, target: BlockTarget, label: (target: BlockTarget) => string): string {
  switch (target.type) {
    case 'note':
      return noteWords(library, target.id);
    case 'link':
      return linkWords(library, target.id);
    case 'page':
      return `Page "${label(target)}"`;
    default:
      // A type a newer client added: nothing this build can read of it.
      return '';
  }
}

const RICH_PREFIX: Partial<Record<Block['kind'], string>> = { h1: '# ', h2: '## ', h3: '### ', h4: '#### ', bullet: '- ', toggle: '- ', callout: '> ' };

/** One block's words for Claude, Markdown on one piece; '' for a block that says nothing. */
function blockWords(library: AskLibrary, block: Block, siblings: readonly string[], index: number, depth: number, label: (target: BlockTarget) => string): string {
  const indent = '  '.repeat(depth);
  const caption = CAPTION_KINDS.has(block.kind) && block.caption.trim() ? `\n*${block.caption.trim()}*` : '';
  if (RICH_KINDS.has(block.kind)) {
    const words = richToMarkdown(block.text, label, dateForReading).trim();
    if (!words) return '';
    if (block.kind === 'todo') return `${indent}- [${block.checked ? 'x' : ' '}] ${words}`;
    if (block.kind === 'numbered') return `${indent}${listNumber(library.blocks, siblings, index)}. ${words}`;
    return `${indent}${RICH_PREFIX[block.kind] ?? ''}${words}`;
  }
  switch (block.kind) {
    case 'code':
      return block.text.trim() ? `\`\`\`${block.language}\n${block.text}\n\`\`\`${caption}` : '';
    case 'image':
    case 'video':
    case 'pdf':
    case 'file': {
      const name = block.fileName || block.url || '';
      return name || caption ? `[File: ${name}]${caption}` : '';
    }
    case 'bookmark':
    case 'embed':
      return block.target ? `${targetWords(library, block.target, label)}${caption}` : '';
    case 'page':
      return `Sub-page "${sentTitle(block)}"`;
    case 'drawing':
      return `[Drawing]${caption}`;
    default:
      return '';
  }
}

/** A table, a piece per row (so an answer cites the row), its columns named on each. */
function tableBlocks(library: AskLibrary, table: Block): AskBlock[] {
  const pieces: AskBlock[] = [];
  const named = table.columns.map(column => column.name.trim() || '·');
  pieces.push({ id: table.id, text: `Table${table.caption.trim() ? ` "${table.caption.trim()}"` : ''}: ${named.join(' | ')}` });
  for (const rowId of library.blocksByParent[table.id] ?? []) {
    const row = library.blocks[rowId];
    if (!live(row) || row.kind !== 'row') continue;
    const cells = table.columns.flatMap((column, at) => {
      const value = cellText(row.cells[column.id], column);
      return value ? [`${named[at]}: ${value}`] : [];
    });
    if (cells.length > 0) pieces.push({ id: row.id, text: cells.join(' | ') });
  }
  return pieces;
}

/** A page's own blocks as Claude reads them, in reading order (a sub-page is named, its words are its own). */
export function askBlocks(library: AskLibrary, pageId: string, label: (target: BlockTarget) => string): AskBlock[] {
  const pieces: AskBlock[] = [];
  const walk = (parent: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    const siblings = library.blocksByParent[parent] ?? [];
    siblings.forEach((id, index) => {
      const block = library.blocks[id];
      if (!live(block)) return;
      if (block.kind === 'table') {
        pieces.push(...tableBlocks(library, block));
        return;
      }
      if (block.kind === 'page') {
        // A private sub-page is not even named.
        if (!block.private) pieces.push({ id: block.id, text: blockWords(library, block, siblings, index, depth, label) });
        return;
      }
      const text = blockWords(library, block, siblings, index, depth, label).slice(0, PAGES_ASK_LIMITS.block);
      if (text.trim()) pieces.push({ id: block.id, text });
      // Columns and their column, a toggle's or an item's nested blocks: read in place.
      walk(block.id, block.kind === 'columns' || block.kind === 'column' ? depth : depth + 1);
    });
  };
  walk(pageId, 0);
  return pieces;
}

/** What a question reads, and what it had to leave out. */
export interface AskContext {
  readonly pages: readonly AskPage[];
  /** Characters sent (the paths and the blocks). */
  readonly chars: number;
  /** Pages in the scope, read or not (the private ones aside). */
  readonly total: number;
  /** Pages of the scope left out for room, or read only in part. */
  readonly cut: number;
  /** Private pages of the scope, never sent. */
  readonly kept: number;
}

/** Every page under a page, at any depth, in the tree's reading order. */
function pageTree(library: AskLibrary, pageId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([pageId]);
  const walk = (id: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    for (const child of subPages(library.blocks, library.blocksByParent, id)) {
      if (seen.has(child)) continue;
      seen.add(child);
      out.push(child);
      walk(child, depth + 1);
    }
  };
  walk(pageId, 0);
  return out;
}

/** The pages under a page kept away from Claude (by themselves or by a page above them): said beside the scope. */
export function keptUnder(library: AskLibrary, pageId: string): number {
  return pageTree(library, pageId).filter(id => live(library.blocks[id]) && !isInBin(library.blocks, id) && isPrivatePage(library.blocks, id)).length;
}

/** Every live page that is not private, newest change first: what « Toutes les pages » may read. */
function askablePages(library: AskLibrary): Block[] {
  return Object.values(library.blocks)
    .filter(block => block.kind === 'page' && block.deletedAt === null && !isInBin(library.blocks, block.id) && !isPrivatePage(library.blocks, block.id))
    .sort((a, b) => b.editedAt - a.editedAt);
}

/** The pages closest to the question first (the search engine's own ranking), then the most recently changed. */
function closestPages(library: AskLibrary, question: string, label: (target: BlockTarget) => string): string[] {
  const pages = askablePages(library);
  const docs: SearchDoc<string>[] = pages.map(page => {
    const content = pageContent(page, library.blocks, library.blocksByParent, label);
    return { key: page.id, title: page.text, parts: content.parts.map(part => ({ text: part.text, role: 'body' as const, ref: part.blockId })), editedAt: content.editedAt, meta: page.id };
  });
  const ranked = search(buildIndex(docs), parseQuery(question)).hits.map(hit => hit.doc.meta);
  const seen = new Set(ranked);
  return [...ranked, ...pages.map(page => page.id).filter(id => !seen.has(id))];
}

/**
 * What a question about `pageId` reads, in `scope`, within `chars`: the page itself first, then its
 * sub-pages in the tree's order, or the pages closest to the question. Private pages (and what is
 * under them) and pages in the bin are never read; a page that does not fit is read in part, then
 * no more pages are.
 */
export function askContext(library: AskLibrary, pageId: string, scope: PageScope, question: string, chars: number, label: (target: BlockTarget) => string): AskContext {
  const blocks = library.blocks;
  const scoped = scope === 'page' ? [pageId] : scope === 'tree' ? [pageId, ...pageTree(library, pageId)] : [pageId, ...closestPages(library, question, label).filter(id => id !== pageId)];
  const inScope = scoped.filter(id => live(blocks[id]) && blocks[id]!.kind === 'page' && !isInBin(blocks, id));
  const askable = inScope.filter(id => !isPrivatePage(blocks, id));
  const kept = inScope.length - askable.length;
  const pages: AskPage[] = [];
  let used = 0;
  let cut = 0;
  for (const id of askable) {
    if (pages.length === PAGES_ASK_LIMITS.pages) {
      cut += 1;
      continue;
    }
    const path = pagePath(blocks, id, sentTitle);
    const room = chars - used - path.length;
    if (room <= 0) {
      cut += 1;
      continue;
    }
    const pieces: AskBlock[] = [];
    let size = 0;
    let whole = true;
    for (const piece of askBlocks(library, id, label)) {
      if (size + piece.text.length > room) {
        whole = false;
        break;
      }
      pieces.push(piece);
      size += piece.text.length;
    }
    if (!whole) cut += 1;
    pages.push({ id, path, blocks: pieces });
    used += path.length + size;
    if (!whole) {
      // Read in part: what comes after it would not fit either.
      cut += askable.length - askable.indexOf(id) - 1;
      break;
    }
  }
  return { pages, chars: used, total: askable.length, cut, kept };
}

/** About as many words as these characters, rounded as a person says them (« environ 12 000 mots »). */
export function askWords(chars: number): string {
  const words = chars / 6;
  const rounded = words < 1000 ? Math.max(10, Math.round(words / 10) * 10) : Math.round(words / 1000) * 1000;
  return formatNumber(rounded, 0);
}

/** An answer's words, its pieces joined, citation marks left out: what is copied, kept in the conversation or laid in a page. */
export function answerText(answer: Pick<PagesAskResponse, 'parts'>): string {
  return answer.parts
    .map(part => part.text)
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A piece of an answer's line: words, or a citation's mark (its number, and its index in `citations`). */
export type AnswerSegment = { readonly text: string } | { readonly cite: number; readonly index: number };

/** A run of an answer's paragraph: one line of text, or consecutive "- " lines as a list. */
export interface AnswerRun {
  readonly list: boolean;
  readonly lines: readonly (readonly AnswerSegment[])[];
}

const LIST_LINE = /^\s*[-•*]\s+/;
// The citation marks are control characters on purpose: no answer can contain them.
// eslint-disable-next-line no-control-regex
const MARK = /\u0001(\d+)\u0002/;

/**
 * An answer as both apps lay it out: paragraphs, each a few runs (a line, or a list), each line its
 * words with the marks of the citations they rest on, numbered in order of first use.
 */
export function answerLayout(parts: readonly PagesAnswerPart[]): AnswerRun[][] {
  const numbers = citationNumbers(parts);
  let marked = '';
  let last = -1;
  for (const part of parts) {
    const body = part.text.trimEnd();
    const tail = part.text.slice(body.length);
    marked += body;
    if (body.trim()) last = -1;
    for (const cite of part.cites) {
      // The same citation again with no words between: one mark.
      if (cite === last) continue;
      marked += `\u0001${cite}\u0002`;
      last = cite;
    }
    marked += tail;
  }
  return marked
    .split(/\n\s*\n/)
    .map(paragraph => {
      const runs: { list: boolean; lines: AnswerSegment[][] }[] = [];
      for (const raw of paragraph.split('\n')) {
        // eslint-disable-next-line no-control-regex
        if (!raw.replace(/\u0001\d+\u0002/g, '').trim()) {
          // A mark alone on its line belongs to the line before.
          const previous = runs[runs.length - 1]?.lines.at(-1);
          if (previous) previous.push(...segmentsOf(raw, numbers));
          continue;
        }
        const list = LIST_LINE.test(raw);
        const segments = segmentsOf(list ? raw.replace(LIST_LINE, '') : raw.trim(), numbers);
        const open = runs[runs.length - 1];
        if (open && list && open.list) open.lines.push(segments);
        else runs.push({ list, lines: [segments] });
      }
      return runs;
    })
    .filter(runs => runs.length > 0);
}

function segmentsOf(line: string, numbers: ReadonlyMap<number, number>): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  let rest = line;
  for (let match = MARK.exec(rest); match; match = MARK.exec(rest)) {
    if (match.index > 0) segments.push({ text: rest.slice(0, match.index) });
    const index = Number(match[1]);
    const cite = numbers.get(index);
    if (cite !== undefined) segments.push({ cite, index });
    rest = rest.slice(match.index + match[0].length);
  }
  if (rest) segments.push({ text: rest });
  return segments;
}

/** The pages an answer cites, each once, in order of first use. */
export function citedPages(answer: Pick<PagesAskResponse, 'parts' | 'citations'>): string[] {
  const pages: string[] = [];
  for (const [index] of [...citationNumbers(answer.parts)].sort((a, b) => a[1] - b[1])) {
    const pageId = answer.citations[index]?.pageId;
    if (pageId && !pages.includes(pageId)) pages.push(pageId);
  }
  return pages;
}

/** An answer as copied: its words, then the pages it rests on and the web pages it read. */
export function answerCopy(answer: PagesAskResponse, title: (pageId: string) => string): string {
  const pages = citedPages(answer).map(title);
  const lines = [answerText(answer)];
  if (pages.length > 0) lines.push(t('Sources : {pages}', { pages: pages.join(', ') }));
  for (const source of answer.sources) lines.push(`${source.title} : ${source.url}`);
  return lines.join('\n\n');
}

/**
 * An answer laid in a page: a toggle titled with the question, the answer's paragraphs and lists
 * under it, then the pages it rests on as mentions (the web's as links), so the page keeps where
 * each claim came from.
 */
export function answerDraft(question: string, answer: PagesAskResponse): BlockDraft {
  const children = blocksFromText(answerText(answer));
  const pages = citedPages(answer);
  if (pages.length > 0) {
    const runs: Run[] = [{ kind: 'text', text: t('Sources : '), marks: { i: true } }];
    pages.forEach((id, at) => {
      if (at > 0) runs.push({ kind: 'text', text: ', ', marks: {} });
      runs.push({ kind: 'mention', target: { type: 'page', id } });
    });
    children.push({ kind: 'text', text: serializeRich(runs) });
  }
  for (const source of answer.sources) children.push({ kind: 'bullet', text: serializeRich([{ kind: 'text', text: source.title, marks: { a: source.url } }]) });
  return { kind: 'toggle', text: serializeRich([{ kind: 'text', text: question, marks: {} }]), children };
}

/** A cited block's words as the person reads them: the Markdown it was sent as, its marks and list signs left out. */
export function quoteText(markdown: string): string {
  return markdown
    .replace(/^\s*(?:#{1,6}\s+|[-*•]\s+\[[ x]\]\s+|[-*•]\s+|\d+\.\s+|>\s+)/gm, '')
    .replace(/\[([^\]]*)\]\([^)\s]*\)/g, '$1')
    .replace(/\*\*|~~|`/g, '')
    .replace(/(^|[\s(«"])\*(\S[^*]*?)\*(?=$|[\s.,;:!?)»"])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Where a citation leads: its page, and the first block it rests on. */
export const citationTarget = (citation: PagesCitation): { readonly pageId: string; readonly blockId: string | null } => ({ pageId: citation.pageId, blockId: citation.blockIds[0] ?? null });

/** A citation's place in what the person reads: numbered in order of first use, 1 up. */
export function citationNumbers(parts: readonly PagesAnswerPart[]): Map<number, number> {
  const numbers = new Map<number, number>();
  for (const part of parts) for (const cite of part.cites) if (!numbers.has(cite)) numbers.set(cite, numbers.size + 1);
  return numbers;
}

/** Questions to start from, by scope: what people ask of their own notes. */
const STARTERS: Readonly<Record<PageScope, readonly string[]>> = {
  page: [tx('Résume cette page en quelques points'), tx('Quelles tâches restent à faire ?'), tx('Qu’est-ce qui manque ou se contredit ?')],
  tree: [tx('Résume ces pages en quelques points'), tx('Quelles décisions ont été prises ?'), tx('Quelles tâches restent à faire ?')],
  all: [tx('Qu’ai-je écrit sur ce sujet ?'), tx('Quelles tâches restent à faire ?'), tx('Quelles idées reviennent souvent ?')],
};

/** "Demander à Claude": questions to start from, for a scope, in the interface's language. */
export function askStarters(scope: PageScope): readonly string[] {
  return STARTERS[scope].map(text => t(text));
}
