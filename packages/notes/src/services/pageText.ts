/**
 * Pages to and from plain text: a paste becomes blocks (one per line, Markdown's headings, lists,
 * tasks, fences, tables and inline marks understood), and copied blocks become Markdown.
 */
import { CAPTION_KINDS, TABLE_LIMITS, type BlockKind, type BlockTarget, type CellValue, type TableColumn, type TargetType } from '../models/blocks';
import { languageFromFence } from './code';
import { cellText } from './table';
import { dateWords } from '@unlease/core/services/dates';
import { concatRich, parseRich, richFromPlain, richToPlain, serializeRich, setFlag, setValue, type DateLabel, type Run } from '@unlease/core/services/richText';

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

/** One line's Markdown marks as rich text: bold, italic, strikethrough, code, keys (`<kbd>`), links (bare ones too). */
export function richFromMarkdown(line: string): Run[] {
  const runs: Run[] = [];
  let at = 0;
  for (const match of line.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > at) runs.push(...richFromPlain(line.slice(at, index)));
    const [whole, bold, strike, code, label, href, italic, bare, keys] = match;
    const piece = (value: string): Run[] => richFromPlain(value);
    if (bold !== undefined) runs.push(...setFlag(piece(bold), 0, bold.length, 'b', true));
    else if (strike !== undefined) runs.push(...setFlag(piece(strike), 0, strike.length, 's', true));
    else if (code !== undefined) runs.push(...setFlag(piece(code), 0, code.length, 'c', true));
    else if (label !== undefined && href !== undefined) runs.push(...setValue(piece(label), 0, label.length, 'a', href));
    else if (italic !== undefined) runs.push(...setFlag(piece(italic), 0, italic.length, 'i', true));
    else if (bare !== undefined) runs.push(...setValue(piece(bare), 0, bare.length, 'a', bare));
    else if (keys !== undefined) runs.push(...setFlag(piece(keys), 0, keys.length, 'k', true));
    at = index + whole.length;
  }
  if (at < line.length) runs.push(...richFromPlain(line.slice(at)));
  return concatRich(runs);
}

const LINE_KINDS: readonly { readonly pattern: RegExp; readonly kind: BlockKind; readonly checked?: boolean }[] = [
  { pattern: /^####\s+(.*)$/, kind: 'h4' },
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

/** Pasted text as blocks: a block per line, list items nested by their indentation, fenced code kept whole. */
export function blocksFromText(source: string): BlockDraft[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const top: Mutable[] = [];
  // The list items still open at each indentation, to hang deeper ones under.
  const open: { readonly indent: number; readonly block: Mutable }[] = [];
  for (let at = 0; at < lines.length; at += 1) {
    const raw = lines[at]!;
    const fence = /^\s*```\s*([\w+#-]*)\s*$/.exec(raw);
    if (fence) {
      const body: string[] = [];
      at += 1;
      while (at < lines.length && !/^\s*```\s*$/.test(lines[at]!)) {
        body.push(lines[at]!);
        at += 1;
      }
      top.push({ kind: 'code', text: body.join('\n'), language: languageFromFence(fence[1] ?? '') ?? 'plain', children: [] });
      open.length = 0;
      continue;
    }
    if (TABLE_ROW.test(raw) && TABLE_RULE.test(lines[at + 1] ?? '')) {
      const rows = [markdownCells(raw)];
      for (at += 2; at < lines.length && TABLE_ROW.test(lines[at]!); at += 1) rows.push(markdownCells(lines[at]!));
      at -= 1;
      const table = tableDraft(rows);
      if (table) top.push(mutable(table));
      open.length = 0;
      continue;
    }
    if (!raw.trim() || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) {
      if (!raw.trim()) open.length = 0;
      continue;
    }
    const indent = raw.replace(/\t/g, '    ').search(/\S/);
    const line = raw.trim();
    const shape = LINE_KINDS.find(entry => entry.pattern.test(line));
    const content = shape ? (shape.pattern.exec(line)?.[1] ?? '') : line;
    const block: Mutable = { kind: shape?.kind ?? 'text', text: serializeRich(richFromMarkdown(content)), ...(shape?.checked !== undefined ? { checked: shape.checked } : {}), children: [] };
    while (open.length > 0 && open[open.length - 1]!.indent >= indent) open.pop();
    const parent = LIST_KINDS.has(block.kind) ? open[open.length - 1]?.block : undefined;
    if (parent) parent.children.push(block);
    else top.push(block);
    if (LIST_KINDS.has(block.kind)) open.push({ indent, block });
    else open.length = 0;
  }
  const freeze = (blocks: readonly Mutable[]): BlockDraft[] =>
    blocks.map(({ children, ...rest }) => (children.length > 0 ? { ...rest, children: freeze(children) } : rest));
  return freeze(top);
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
    // A table of contents is the page's headings, already written; a drawing has no words.
    if (block.kind === 'toc') continue;
    if (block.kind === 'drawing') {
      // Written out as a picture where a backup keeps it as a file (`extra.url`).
      const url = typeof block.extra?.url === 'string' ? block.extra.url : '';
      if (url) lines.push(`${indent}![${caption}](${url})`);
      else if (caption) lines.push(`${indent}*${caption}*`);
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
