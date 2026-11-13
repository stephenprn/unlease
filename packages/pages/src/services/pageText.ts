/**
 * Pages to and from plain text: a paste becomes blocks (one per line, Markdown's headings, lists,
 * tasks, fences, tables and inline marks understood), and copied blocks become Markdown.
 */
import { CAPTION_KINDS, TABLE_LIMITS, type BlockKind, type BlockTarget, type CellValue, type TableColumn, type TargetType } from '../models/blocks';
import { languageFromFence } from './code';
import { cellText } from './table';
import { dateWords } from '@unlease/core/services/dates';
import { concatRich, parseRich, richFromPlain, richLength, richToPlain, serializeRich, setFlag, setValue, type DateLabel, type Run } from '@unlease/core/services/richText';
import { typedEmoji } from '@unlease/design/emojiSearch';
import { immichBlockWords } from './immichBlock';

/** A block to make, with what goes under it. */
export interface BlockDraft {
  readonly kind: BlockKind;
  /** Markup for the rich kinds, the source for code, the title for a page. */
  readonly text: string;
  readonly checked?: boolean;
  readonly language?: string;
  /** The other fields of a block copied whole (a table's columns, a row's cells, a picture's file, a bookmark's target). */
  readonly extra?: Readonly<Record<string, unknown>>;
  readonly children?: readonly BlockDraft[];
}

const INLINE = /\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|\*([^*\s][^*\n]*)\*|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"»])|<kbd>([^<\n]+)<\/kbd>/g;

/**
 * Markdown read from an export (`MarkdownReading`) knows more than a paste: any link (`[words](a
 * file.md)`, `<a path with spaces>`, a title after the address), a wiki link (`[[Page]]`,
 * `[[Page#Heading|words]]`), a picture inline (`![words](address)`), bold and italics with underscores.
 */
const READ_INLINE = new RegExp(
  String.raw`\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:\|([^\]\n]+))?\]\]|(!?)\[([^\]\n]*)\]\((<[^>\n]+>|(?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"\n]*")?\)|__([^_\n]+)__|(?<![\w])_([^_\s](?:[^_\n]*[^_\s])?)_(?![\w])|` + INLINE.source,
  'g',
);

/** How Markdown from elsewhere (an export: Notion's, a folder of notes) is read beyond a paste: what its links and pictures point at. */
export interface MarkdownReading {
  /**
   * A link: `[words](address)` (the address as written, `%20` and all), or a wiki link `[[name]]`
   * (`wiki`, the name as written). Its runs (a mention of what it points at), or null to keep it
   * as a paste does: a web address its link, anything else its words.
   */
  readonly link?: (label: string, href: string, wiki: boolean) => Run[] | null;
  /**
   * A line holding nothing but a picture (`![words](address)`, `![[name]]`: `picture`) or a link
   * (`[words](address)`): the block it makes there (a picture, a file, a sub-page in its place), or
   * null to read the line as text.
   */
  readonly alone?: (label: string, href: string, picture: boolean) => BlockDraft | null;
}

/** One line's Markdown marks as rich text: bold, italic, strikethrough, code, keys (`<kbd>`), links (bare ones too); read from an export (`reading`), its own links too. */
export function richFromMarkdown(line: string, reading?: MarkdownReading | null): Run[] {
  const runs: Run[] = [];
  let at = 0;
  const inner = (value: string): Run[] => richFromMarkdown(value, reading);
  const pattern = reading ? READ_INLINE : INLINE;
  pattern.lastIndex = 0;
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > at) runs.push(...richFromPlain(line.slice(at, index)));
    const whole = match[0];
    // An export's own pieces first; the paste's after them, at the same places in both patterns' groups.
    const groups = reading ? match.slice(8) : match.slice(1);
    const [bold, strike, code, label, href, italic, bare, keys] = groups;
    if (reading && match[1] !== undefined) {
      const name = match[1].trim();
      const words = (match[2] ?? name).trim();
      runs.push(...(reading.link?.(words, name, true) ?? richFromPlain(words)));
    } else if (reading && match[4] !== undefined && match[5] !== undefined) {
      const words = match[4];
      const address = match[5].replace(/^<|>$/g, '');
      const linked = (): Run[] => {
        const piece = inner(words || address);
        return setValue(piece, 0, richLength(piece), 'a', address);
      };
      // A picture amid words keeps its words; it is a block only on a line of its own.
      if (match[3]) runs.push(...richFromPlain(words));
      else runs.push(...(reading.link?.(words, address, false) ?? (/^https?:\/\//i.test(address) ? linked() : inner(words))));
    } else if (reading && match[6] !== undefined) {
      const piece = inner(match[6]);
      runs.push(...setFlag(piece, 0, richLength(piece), 'b', true));
    } else if (reading && match[7] !== undefined) {
      const piece = inner(match[7]);
      runs.push(...setFlag(piece, 0, richLength(piece), 'i', true));
    } else if (bold !== undefined) {
      const piece = inner(bold);
      runs.push(...setFlag(piece, 0, richLength(piece), 'b', true));
    } else if (strike !== undefined) {
      const piece = inner(strike);
      runs.push(...setFlag(piece, 0, richLength(piece), 's', true));
    } else if (code !== undefined) runs.push(...setFlag(richFromPlain(code), 0, code.length, 'c', true));
    else if (label !== undefined && href !== undefined) runs.push(...setValue(richFromPlain(label), 0, label.length, 'a', href));
    else if (italic !== undefined) {
      const piece = inner(italic);
      runs.push(...setFlag(piece, 0, richLength(piece), 'i', true));
    } else if (bare !== undefined) runs.push(...setValue(richFromPlain(bare), 0, bare.length, 'a', bare));
    else if (keys !== undefined) runs.push(...setFlag(richFromPlain(keys), 0, keys.length, 'k', true));
    at = index + whole.length;
  }
  if (at < line.length) runs.push(...richFromPlain(line.slice(at)));
  return concatRich(runs);
}

const LINE_KINDS: readonly { readonly pattern: RegExp; readonly kind: BlockKind; readonly checked?: boolean }[] = [
  { pattern: /^#{4,6}\s+(.*)$/, kind: 'h4' },
  { pattern: /^###\s+(.*)$/, kind: 'h3' },
  { pattern: /^##\s+(.*)$/, kind: 'h2' },
  { pattern: /^#\s+(.*)$/, kind: 'h1' },
  { pattern: /^[-*+]\s+\[\s\]\s+(.*)$/, kind: 'todo', checked: false },
  { pattern: /^[-*+]\s+\[[xX]\]\s+(.*)$/, kind: 'todo', checked: true },
  { pattern: /^\[\s?\]\s+(.*)$/, kind: 'todo', checked: false },
  { pattern: /^[-*+•]\s+(.*)$/, kind: 'bullet' },
  { pattern: /^\d+[.)]\s+(.*)$/, kind: 'numbered' },
  { pattern: /^>\s?(.*)$/, kind: 'text' },
];

interface Mutable {
  kind: BlockKind;
  text: string;
  checked?: boolean;
  language?: string;
  extra?: Readonly<Record<string, unknown>>;
  children: Mutable[];
}

/** Rows of text as a table: the first names its columns (text columns), the others are its rows. */
export function tableDraft(rows: readonly (readonly string[])[]): BlockDraft | null {
  const [head, ...body] = rows;
  const width = Math.min(TABLE_LIMITS.columns, rows.reduce((most, row) => Math.max(most, row.length), 0));
  if (!head || width === 0) return null;
  const columns: TableColumn[] = Array.from({ length: width }, (_, index) => ({ id: `c${index}`, name: (head[index] ?? '').slice(0, TABLE_LIMITS.name) || `Colonne ${index + 1}`, type: 'text' }));
  return {
    kind: 'table',
    text: '',
    extra: { columns },
    children: body.map(row => ({ kind: 'row', text: '', extra: { cells: Object.fromEntries(columns.map((column, index) => [column.id, (row[index] ?? '').slice(0, TABLE_LIMITS.cellText)])) } })),
  };
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

/** A Markdown table row's cells as plain text: the outer pipes dropped, `\|` read as a pipe. */
function markdownCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return inner.split(/(?<!\\)\|/).map(cell => richToPlain(richFromMarkdown(cell.trim().replace(/\\\|/g, '|'))));
}

const mutable = (draft: BlockDraft): Mutable => ({ ...draft, children: (draft.children ?? []).map(mutable) });

const LIST_KINDS: ReadonlySet<BlockKind> = new Set(['bullet', 'numbered', 'todo']);

/** A line that is a picture or a link alone: `![words](address)`, `![[name]]`, `[words](address)`. */
const ALONE = /^(!?)\[([^\]\n]*)\]\((<[^>\n]+>|(?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"\n]*")?\)$|^!\[\[([^\]\n|#]+)(?:\|[^\]\n]*)?\]\]$/;

/** The lines from `at` up to the one closing `tag` (nested ones counted): the lines inside, and the line after the closing one. */
function enclosed(lines: readonly string[], at: number, tag: string): { readonly inner: string[]; readonly next: number } {
  const open = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'gi');
  const close = new RegExp(`</${tag}>`, 'gi');
  const inner: string[] = [];
  let depth = 0;
  for (let index = at; index < lines.length; index += 1) {
    const line = lines[index]!;
    depth += (line.match(open)?.length ?? 0) - (line.match(close)?.length ?? 0);
    inner.push(line);
    if (depth <= 0) {
      // What surrounds the tags on their own lines stays: `<aside>💡 Idée</aside>` holds « 💡 Idée ».
      const joined = inner.join('\n').replace(new RegExp(`^\\s*<${tag}(?:\\s[^>]*)?>`, 'i'), '').replace(new RegExp(`</${tag}>\\s*$`, 'i'), '');
      return { inner: joined.split('\n'), next: index + 1 };
    }
  }
  return { inner: inner.join('\n').replace(new RegExp(`^\\s*<${tag}(?:\\s[^>]*)?>`, 'i'), '').split('\n'), next: lines.length };
}

/** A callout read from `<aside>`: its emoji first (Notion's way) as its icon, its first paragraph its words, the rest under it. */
function calloutOf(content: readonly Mutable[]): Mutable {
  const blocks = [...content];
  let icon: string | null = null;
  const first = blocks[0];
  if (first?.kind === 'text') {
    const runs = parseRich(first.text);
    const lead = runs[0]?.kind === 'text' ? runs[0].text : '';
    const emoji = typedEmoji(lead.slice(0, 16));
    if (emoji && lead.startsWith(emoji)) {
      icon = emoji;
      const rest = serializeRich(concatRich(richFromPlain(lead.slice(emoji.length).replace(/^\s+/, '')), runs.slice(1)));
      if (rest) blocks[0] = { ...first, text: rest };
      else blocks.shift();
    }
  }
  const head = blocks[0]?.kind === 'text' && blocks[0].children.length === 0 ? blocks.shift()! : null;
  return { kind: 'callout', text: head?.text ?? '', ...(icon ? { extra: { icon } } : {}), children: blocks };
}

/** Lines as blocks; read from an export when `reading` is given (`blocksFromMarkdown`). */
function readMarkdown(source: string, reading: MarkdownReading | null): Mutable[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const top: Mutable[] = [];
  // The list items still open at each indentation, to hang deeper ones under.
  const open: { readonly indent: number; readonly block: Mutable }[] = [];
  // The paragraph a next line joins (an export's lines run on until an empty one).
  let paragraph: { readonly indent: number; readonly block: Mutable } | null = null;
  let start = 0;
  // An Obsidian note's properties (YAML between two `---` at its very top) are no words of it.
  if (reading && /^---\s*$/.test(lines[0] ?? '')) {
    const end = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
    if (end > 0) start = end + 1;
  }
  /** A block at the top, or under the list item it is indented under (an export's paragraphs too). */
  const place = (block: Mutable, indent: number): void => {
    while (open.length > 0 && open[open.length - 1]!.indent >= indent) open.pop();
    const parent = LIST_KINDS.has(block.kind) || reading ? open[open.length - 1]?.block : undefined;
    if (parent) parent.children.push(block);
    else top.push(block);
  };
  for (let at = start; at < lines.length; at += 1) {
    const raw = lines[at]!;
    const indent = raw.replace(/\t/g, '    ').search(/\S/);
    const fence = /^\s*(```|~~~)\s*([\w+#-]*)\s*$/.exec(raw) ?? (reading && /^\s*\$\$\s*$/.test(raw) ? ['', '$$', 'latex'] : null);
    if (fence) {
      const closing = fence[1]!;
      const body: string[] = [];
      at += 1;
      while (at < lines.length && lines[at]!.trim() !== closing) {
        body.push(lines[at]!);
        at += 1;
      }
      const code: Mutable = { kind: 'code', text: body.join('\n'), language: languageFromFence(fence[2] ?? '') ?? 'plain', children: [] };
      paragraph = null;
      if (reading && indent > 0) place(code, indent);
      else {
        top.push(code);
        open.length = 0;
      }
      continue;
    }
    if (TABLE_ROW.test(raw) && TABLE_RULE.test(lines[at + 1] ?? '')) {
      const rows = [markdownCells(raw)];
      for (at += 2; at < lines.length && TABLE_ROW.test(lines[at]!); at += 1) rows.push(markdownCells(lines[at]!));
      at -= 1;
      const table = tableDraft(rows);
      if (table) top.push(mutable(table));
      open.length = 0;
      paragraph = null;
      continue;
    }
    const line = raw.trim();
    if (reading && /^<(aside|details)(?:\s[^>]*)?>/i.test(line)) {
      const tag = /^<(aside|details)/i.exec(line)![1]!.toLowerCase();
      const { inner, next } = enclosed(lines, at, tag);
      at = next - 1;
      paragraph = null;
      if (tag === 'aside') {
        place(calloutOf(readMarkdown(inner.join('\n'), reading)), indent);
        continue;
      }
      // `<details><summary>Titre</summary>…</details>`: a toggle, its summary its words.
      const text = inner.join('\n');
      const summary = /<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>/i.exec(text);
      const body = summary ? text.slice(0, summary.index) + text.slice(summary.index + summary[0].length) : text;
      place({ kind: 'toggle', text: serializeRich(richFromMarkdown((summary?.[1] ?? '').replace(/\s+/g, ' ').trim(), reading)), children: readMarkdown(body, reading) }, indent);
      continue;
    }
    if (reading && /^<!--.*-->$/.test(line)) continue;
    if (!line || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) {
      if (!line && !reading) open.length = 0;
      paragraph = null;
      continue;
    }
    if (reading?.alone) {
      const alone = ALONE.exec(line);
      const made = alone ? (alone[4] !== undefined ? reading.alone('', alone[4].trim(), true) : reading.alone(alone[2] ?? '', alone[3]!.replace(/^<|>$/g, ''), alone[1] === '!')) : null;
      if (made) {
        place(mutable(made), indent);
        paragraph = null;
        continue;
      }
    }
    const shape = LINE_KINDS.find(entry => entry.pattern.test(line));
    const content = shape ? (shape.pattern.exec(line)?.[1] ?? '') : line;
    const text = serializeRich(richFromMarkdown(content, reading));
    // An export's paragraph runs on over its lines: they are one block, its lines kept.
    if (reading && paragraph && (!shape || shape.kind === 'text') && paragraph.indent === indent) {
      paragraph.block.text = serializeRich(concatRich(parseRich(paragraph.block.text), richFromPlain('\n'), parseRich(text)));
      continue;
    }
    const block: Mutable = { kind: shape?.kind ?? 'text', text, ...(shape?.checked !== undefined ? { checked: shape.checked } : {}), children: [] };
    if (reading) place(block, indent);
    else {
      while (open.length > 0 && open[open.length - 1]!.indent >= indent) open.pop();
      const parent = LIST_KINDS.has(block.kind) ? open[open.length - 1]?.block : undefined;
      if (parent) parent.children.push(block);
      else top.push(block);
    }
    if (LIST_KINDS.has(block.kind)) open.push({ indent, block });
    else if (!reading) open.length = 0;
    paragraph = block.kind === 'text' ? { indent, block } : null;
  }
  return top;
}

const freeze = (blocks: readonly Mutable[]): BlockDraft[] => blocks.map(({ children, ...rest }) => (children.length > 0 ? { ...rest, children: freeze(children) } : rest));

/** Pasted text as blocks: a block per line, list items nested by their indentation, fenced code kept whole. */
export function blocksFromText(source: string): BlockDraft[] {
  return freeze(readMarkdown(source, null));
}

/**
 * Markdown from an export (Notion's, an Obsidian vault) as blocks: what a paste reads, and a
 * paragraph's lines kept together, what is indented under a list item nested in it, Notion's
 * callouts (`<aside>`) and toggles (`<details>`), `~~~` and `$$` blocks as code, the properties at a
 * note's top left out, and its links and pictures as `reading` says.
 */
export function blocksFromMarkdown(source: string, reading: MarkdownReading): BlockDraft[] {
  return freeze(readMarkdown(source, reading));
}

/** Rich text as Markdown: bold, italic, strikethrough, code, keys and links; a mention as `label` names it, a date as `dateLabel` writes it (its day). */
export function richToMarkdown(markup: string, label: (target: BlockTarget) => string, dateLabel: DateLabel = dateWords): string {
  let out = '';
  for (const run of parseRich(markup)) {
    if (run.kind === 'mention') {
      out += label(run.target);
      continue;
    }
    if (run.kind === 'date') {
      out += dateLabel(run);
      continue;
    }
    let piece = run.text;
    if (run.marks.k) piece = `<kbd>${piece}</kbd>`;
    if (run.marks.c) piece = `\`${piece}\``;
    if (run.marks.b) piece = `**${piece}**`;
    if (run.marks.i) piece = `*${piece}*`;
    if (run.marks.s) piece = `~~${piece}~~`;
    if (run.marks.a) piece = `[${piece}](${run.marks.a})`;
    out += piece;
  }
  return out;
}

const PREFIX: Partial<Record<BlockKind, string>> = { h1: '# ', h2: '## ', h3: '### ', h4: '#### ', bullet: '- ', toggle: '- ', callout: '> ' };

/** A copied table's rows, as text cells under its columns' names. */
export function tableRows(draft: BlockDraft): { readonly head: string[]; readonly rows: string[][] } | null {
  const columns = draft.extra?.columns;
  if (!Array.isArray(columns)) return null;
  const typed = columns as TableColumn[];
  const rows = (draft.children ?? []).map(row => {
    const cells = (row.extra?.cells ?? {}) as Readonly<Record<string, CellValue>>;
    return typed.map(column => cellText(cells[column.id], column));
  });
  return { head: typed.map(column => column.name), rows };
}

/** What a picture, a file or a bookmark copies as: its address, its name, what it points at. */
function standIn(draft: BlockDraft, label: (target: BlockTarget) => string): string {
  const extra = draft.extra ?? {};
  if (draft.kind === 'bookmark' || draft.kind === 'embed') {
    const type = extra.targetType as TargetType | undefined;
    return type && typeof extra.targetId === 'string' ? label({ type, id: extra.targetId }) : '';
  }
  const name = typeof extra.fileName === 'string' ? extra.fileName : '';
  const url = typeof extra.url === 'string' ? extra.url : '';
  if (draft.kind === 'image') return url ? `![${name}](${url})` : name;
  return url ? `[${name || url}](${url})` : name;
}

const cell = (value: string): string => value.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** A block's caption (copied in `extra`), for the line in italics under it. */
function captionOf(draft: BlockDraft): string {
  const caption = draft.extra?.caption;
  return CAPTION_KINDS.has(draft.kind) && typeof caption === 'string' ? caption.trim() : '';
}

/** Blocks as Markdown, nested items indented by two spaces; tables as tables, columns one after the other. */
export function blocksToMarkdown(blocks: readonly BlockDraft[], label: (target: BlockTarget) => string, depth = 0): string {
  const lines: string[] = [];
  let number = 0;
  for (const block of blocks) {
    const indent = '  '.repeat(depth);
    number = block.kind === 'numbered' ? number + 1 : 0;
    if (block.kind === 'columns' || block.kind === 'column') {
      if (block.children && block.children.length > 0) lines.push(blocksToMarkdown(block.children, label, depth));
      continue;
    }
    const caption = captionOf(block);
    // A table of contents is the page's headings, already written; a calendar block is Agenda's events, a view; a drawing has no words.
    if (block.kind === 'toc' || block.kind === 'calendar') continue;
    if (block.kind === 'drawing') {
      // Written out as a picture where a backup keeps it as a file (`extra.url`).
      const url = typeof block.extra?.url === 'string' ? block.extra.url : '';
      if (url) lines.push(`${indent}![${caption}](${url})`);
      else if (caption) lines.push(`${indent}*${caption}*`);
      continue;
    }
    if (block.kind === 'immich') {
      const extra = block.extra ?? {};
      const assets = Array.isArray(extra.immichAssetIds) ? extra.immichAssetIds.filter((id): id is string => typeof id === 'string') : [];
      lines.push(`${indent}${immichBlockWords({ fileName: typeof extra.fileName === 'string' ? extra.fileName : '', immichAlbumId: typeof extra.immichAlbumId === 'string' ? extra.immichAlbumId : null, immichAssetIds: assets })}`);
      if (caption) lines.push(`${indent}*${caption}*`);
      continue;
    }
    if (block.kind === 'table') {
      const table = tableRows(block);
      if (table) lines.push(...[table.head, table.head.map(() => '---'), ...table.rows].map(row => `${indent}| ${row.map(cell).join(' | ')} |`));
      if (caption) lines.push(`${indent}*${caption}*`);
      continue;
    }
    if (block.kind === 'code') {
      lines.push(`${indent}\`\`\`${block.language && block.language !== 'plain' ? block.language : ''}`, ...block.text.split('\n').map(line => `${indent}${line}`), `${indent}\`\`\``);
    } else if (block.kind === 'image' || block.kind === 'video' || block.kind === 'pdf' || block.kind === 'file' || block.kind === 'bookmark' || block.kind === 'embed') {
      const text = standIn(block, label);
      if (text) lines.push(`${indent}${text}`);
    } else {
      const text = block.kind === 'page' ? block.text : richToMarkdown(block.text, label);
      const prefix = block.kind === 'numbered' ? `${number}. ` : block.kind === 'todo' ? `- [${block.checked ?? block.extra?.checked ? 'x' : ' '}] ` : (PREFIX[block.kind] ?? '');
      lines.push(`${indent}${prefix}${text}`);
    }
    if (caption) lines.push(`${indent}*${caption}*`);
    if (block.children && block.children.length > 0) lines.push(blocksToMarkdown(block.children, label, depth + 1));
  }
  return lines.join('\n');
}
