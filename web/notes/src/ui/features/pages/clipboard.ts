/**
 * Blocks through the clipboard. Copied, they go out three ways: Markdown as plain text, simple HTML
 * for other editors, and the blocks themselves (a private type) so a paste in a page brings them
 * back whole, tables and files included. Pasted from elsewhere, HTML is read for its structure
 * (headings, lists, code, tables, pictures) and its marks. A whole page is exported as Markdown too.
 * Words copied inside a block holding a date or a mention go out as words that stay true (the day,
 * never « Demain »), and as HTML a page reads back with its chips.
 */
import type { ClipboardEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { CAPTION_KINDS, UNTITLED_PAGE, type BlockKind } from '@unlease/notes/models/blocks';
import { languageFromFence } from '@unlease/notes/services/code';
import { dateWords } from '@unlease/core/services/dates';
import { blocksToMarkdown, tableDraft, tableRows, type BlockDraft } from '@unlease/notes/services/pageText';
import { deleteRich, isAtom, parseRich, richFromPlain, richToPlain, serializeRich, sliceRich, type Run } from '@unlease/core/services/richText';

import { mentionLabel } from '../../../app/hooks/usePages';
import { getRecord, useLibraryStore } from '../../../app/store/library';
import type { RichHandle } from './editorStore';
import { readRich, selectionOffsets } from './richDom';

/** The blocks themselves, between pages of this app. */
export const BLOCKS_TYPE = 'application/x-carnet-blocks';

/** What a copy keeps of a block besides its kind and text: never its place, its dates or its bin. */
const KEPT = ['caption', 'drawing', 'checked', 'language', 'icon', 'color', 'columns', 'cells', 'fileId', 'fileName', 'mime', 'bytes', 'width', 'height', 'uploaded', 'url', 'targetType', 'targetId', 'view', 'viewColumns', 'showDone', 'ratio'];

/** A block and what it holds; `pagesByTitle` keeps a sub-page to its title (its content is its own), and leaves out one in the bin. */
function draftOf(id: string, depth = 0, pagesByTitle = false): BlockDraft | null {
  const { blocks, blocksByParent } = useLibraryStore.getState();
  const block = blocks[id];
  const record = getRecord('block', id);
  if (!block || !record || depth > 100) return null;
  if (pagesByTitle && block.kind === 'page') return block.trashedAt === null ? { kind: 'page', text: block.text.trim() || t(UNTITLED_PAGE) } : null;
  const extra: Record<string, unknown> = {};
  for (const field of KEPT) if (Object.hasOwn(record.fields, field)) extra[field] = record.fields[field];
  const children = (blocksByParent[id] ?? []).flatMap(child => draftOf(child, depth + 1, pagesByTitle) ?? []);
  return { kind: block.kind, text: block.text, extra, ...(children.length > 0 ? { children } : {}) };
}

const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);

/** Runs as simple HTML: a mention by its name, a date by its day, each in a span a page reads back as the chip (`readRich`). */
function runsToHtml(runs: readonly Run[]): string {
  return runs
    .map(run => {
      if (run.kind === 'mention') return `<span data-mention="${run.target.type}:${escapeHtml(run.target.id)}">${escapeHtml(mentionLabel(run.target))}</span>`;
      if (run.kind === 'date') return `<span data-date="${run.time ? `${run.date}T${run.time}` : run.date}">${escapeHtml(dateWords(run))}</span>`;
      let html = escapeHtml(run.text).replace(/\n/g, '<br>');
      if (run.marks.k) html = `<kbd>${html}</kbd>`;
      if (run.marks.c) html = `<code>${html}</code>`;
      if (run.marks.b) html = `<strong>${html}</strong>`;
      if (run.marks.i) html = `<em>${html}</em>`;
      if (run.marks.u) html = `<u>${html}</u>`;
      if (run.marks.s) html = `<s>${html}</s>`;
      if (run.marks.a) html = `<a href="${escapeHtml(run.marks.a)}">${html}</a>`;
      return html;
    })
    .join('');
}

const TAGS: Partial<Record<BlockKind, string>> = { h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4' };

/** A block's caption, in italics under it. */
function captionHtml(draft: BlockDraft): string {
  const caption = draft.extra?.caption;
  return CAPTION_KINDS.has(draft.kind) && typeof caption === 'string' && caption.trim() ? `<p><em>${escapeHtml(caption.trim())}</em></p>` : '';
}

function draftsToHtml(drafts: readonly BlockDraft[]): string {
  let html = '';
  let list: 'ul' | 'ol' | null = null;
  for (const draft of drafts) {
    const wanted = draft.kind === 'bullet' || draft.kind === 'todo' || draft.kind === 'toggle' ? 'ul' : draft.kind === 'numbered' ? 'ol' : null;
    if (list && wanted !== list) {
      html += `</${list}>`;
      list = null;
    }
    if (wanted && !list) {
      html += `<${wanted}>`;
      list = wanted;
    }
    if (draft.kind === 'table') {
      const table = tableRows(draft);
      if (table) html += `<table><tr>${table.head.map(name => `<th>${escapeHtml(name)}</th>`).join('')}</tr>${table.rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</table>`;
      html += captionHtml(draft);
      continue;
    }
    if (draft.kind === 'columns' || draft.kind === 'column') {
      html += draft.children ? draftsToHtml(draft.children) : '';
      continue;
    }
    // A table of contents is the page's headings, already there.
    if (draft.kind === 'toc') continue;
    const inner = draft.kind === 'code' || draft.kind === 'page' ? escapeHtml(draft.text) : runsToHtml(parseRich(draft.text));
    const nested = draft.children ? draftsToHtml(draft.children) : '';
    if (wanted) html += `<li>${draft.kind === 'todo' ? (draft.extra?.checked ? '☑ ' : '☐ ') : ''}${inner}${nested}</li>`;
    else if (draft.kind === 'code') html += `<pre><code>${inner}</code></pre>${captionHtml(draft)}${nested}`;
    else html += `<${TAGS[draft.kind] ?? 'p'}>${inner}</${TAGS[draft.kind] ?? 'p'}>${captionHtml(draft)}${nested}`;
  }
  if (list) html += `</${list}>`;
  return html;
}

/** Selected blocks onto a copy or cut event's clipboard. */
export function writeBlocks(ids: readonly string[], data: DataTransfer): void {
  const drafts = ids.flatMap(id => draftOf(id) ?? []);
  data.setData('text/plain', blocksToMarkdown(drafts, mentionLabel));
  data.setData('text/html', draftsToHtml(drafts));
  data.setData(BLOCKS_TYPE, JSON.stringify(drafts));
}

/** Blocks copied from a page of this app, if that is what the clipboard holds. */
export function readBlocks(data: DataTransfer): BlockDraft[] | null {
  const raw = data.getData(BLOCKS_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as BlockDraft[]) : null;
  } catch {
    return null;
  }
}

/**
 * Words selected in a block, copied (or cut) when they hold a date or a mention: as plain words that
 * stay true (« 29 oct. 2026 », not the « Demain » shown), and as HTML a page reads back with its
 * chips. Words alone are left to the browser.
 */
export function copyWords(event: ClipboardEvent<HTMLElement>, handle: RichHandle, cut: boolean): void {
  const selection = selectionOffsets(handle.element);
  if (!selection || selection.start === selection.end) return;
  const runs = handle.runs();
  const words = sliceRich(runs, selection.start, selection.end);
  if (!words.some(isAtom)) return;
  event.preventDefault();
  event.clipboardData.setData('text/plain', richToPlain(words, mentionLabel, dateWords));
  event.clipboardData.setData('text/html', runsToHtml(words));
  if (cut) handle.write(deleteRich(runs, selection.start, selection.end), { start: selection.start });
}

/** A block's or a selection's Markdown, for the menu's « Copier le texte ». */
export async function copyBlocks(ids: readonly string[]): Promise<void> {
  const drafts = ids.flatMap(id => draftOf(id) ?? []);
  await navigator.clipboard?.writeText(blocksToMarkdown(drafts, mentionLabel)).catch(() => undefined);
}

const LIST_KINDS: ReadonlySet<BlockKind> = new Set(['bullet', 'numbered', 'todo', 'toggle']);

/** Columns read one after the other, as in a document. */
const unColumned = (drafts: readonly BlockDraft[]): BlockDraft[] => drafts.flatMap(draft => (draft.kind === 'columns' || draft.kind === 'column' ? unColumned(draft.children ?? []) : [draft]));

/**
 * A whole page as a Markdown file: its title, then its blocks, a blank line between them (a list's
 * items stay together, so it stays one list). A sub-page is its title alone.
 */
export function pageMarkdown(pageId: string): string {
  const { blocks, blocksByParent } = useLibraryStore.getState();
  const title = blocks[pageId]?.text.trim() || t(UNTITLED_PAGE);
  const groups: BlockDraft[][] = [];
  for (const draft of unColumned((blocksByParent[pageId] ?? []).flatMap(id => draftOf(id, 0, true) ?? []))) {
    const group = groups[groups.length - 1];
    if (group && LIST_KINDS.has(draft.kind) && group[group.length - 1]!.kind === draft.kind) group.push(draft);
    else groups.push([draft]);
  }
  const body = groups.map(group => blocksToMarkdown(group, mentionLabel)).filter(text => text.trim() !== '');
  return `${[`# ${title}`, ...body].join('\n\n')}\n`;
}

// ── HTML from elsewhere ───────────────────────────────────────────────────

const HEADINGS: Record<string, BlockKind> = { H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h4', H5: 'h4', H6: 'h4' };
const BLOCKISH = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'BLOCKQUOTE', 'FIGURE', 'UL', 'OL', 'PRE', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'IMG']);
const BLOCKISH_SELECTOR = [...BLOCKISH].map(tag => tag.toLowerCase()).join(', ');

/** HTML's own spacing: runs of spaces and line breaks in the source are one space. */
function collapsed(element: Element): Element {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) (node as Text).data = (node as Text).data.replace(/\s+/g, ' ');
  return element;
}

/** An element's inline content as markup, lists nested in it left out. */
function inline(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('ul, ol').forEach(nested => nested.remove());
  return serializeRich(readRich(collapsed(copy))).replace(/^\s+|\s+$/g, '');
}

function listItems(list: Element, depth: number): BlockDraft[] {
  const ordered = list.tagName === 'OL';
  return [...list.children]
    .filter(item => item.tagName === 'LI')
    .map(item => {
      const box = item.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null;
      const text = inline(item).replace(/^[☐☑]\s*/, '');
      const nested = depth < 8 ? [...item.children].filter(child => child.tagName === 'UL' || child.tagName === 'OL').flatMap(child => listItems(child, depth + 1)) : [];
      const checked = box ? box.checked : /^☑/.test(item.textContent?.trim() ?? '') ? true : /^☐/.test(item.textContent?.trim() ?? '') ? false : undefined;
      const kind: BlockKind = checked !== undefined ? 'todo' : ordered ? 'numbered' : 'bullet';
      return { kind, text, ...(checked !== undefined ? { checked } : {}), ...(nested.length > 0 ? { children: nested } : {}) };
    });
}

function htmlTable(table: HTMLTableElement): BlockDraft | null {
  return tableDraft([...table.rows].map(row => [...row.cells].map(cell => richToPlain(readRich(collapsed(cell.cloneNode(true) as Element))).trim())));
}

function walk(node: Element, out: BlockDraft[], depth: number): void {
  let loose = '';
  const flushLoose = (): void => {
    const text = loose.trim();
    if (text) out.push({ kind: 'text', text });
    loose = '';
  };
  for (const child of node.childNodes) {
    if (!(child instanceof Element)) {
      if (child.nodeType === Node.TEXT_NODE) loose += serializeRich(richFromPlain((child as Text).data.replace(/\s+/g, ' ')));
      continue;
    }
    const tag = child.tagName;
    // An inline element holding blocks (Google Docs wraps a whole copy in one <b>) is read through, block by block.
    if (!BLOCKISH.has(tag) && depth < 20 && child.querySelector(BLOCKISH_SELECTOR)) {
      flushLoose();
      walk(child, out, depth + 1);
      continue;
    }
    if (!BLOCKISH.has(tag)) {
      const wrapper = document.createElement('span');
      wrapper.append(child.cloneNode(true));
      loose += serializeRich(readRich(collapsed(wrapper)));
      continue;
    }
    flushLoose();
    if (HEADINGS[tag]) out.push({ kind: HEADINGS[tag]!, text: inline(child) });
    else if (tag === 'UL' || tag === 'OL') out.push(...listItems(child, 0));
    else if (tag === 'PRE') {
      const language = /language-([\w+#-]+)/.exec(child.querySelector('code')?.className ?? child.className)?.[1] ?? '';
      out.push({ kind: 'code', text: child.textContent?.replace(/\n$/, '') ?? '', language: languageFromFence(language) ?? 'plain' });
    } else if (tag === 'TABLE') {
      const table = htmlTable(child as HTMLTableElement);
      if (table) out.push(table);
    } else if (tag === 'IMG') {
      const src = (child as HTMLImageElement).src;
      if (/^https?:\/\//.test(src)) out.push({ kind: 'image', text: '', extra: { url: src, fileName: (child as HTMLImageElement).alt || '' } });
    } else if (tag === 'HR') {
      continue;
    } else if (depth < 20 && [...child.children].some(grand => BLOCKISH.has(grand.tagName))) {
      walk(child, out, depth + 1);
    } else {
      const text = inline(child);
      if (text) out.push({ kind: 'text', text });
    }
  }
  flushLoose();
}

/** HTML pasted from another page or app, as blocks. */
export function htmlToDrafts(html: string): BlockDraft[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: BlockDraft[] = [];
  walk(doc.body, out, 0);
  return out;
}
