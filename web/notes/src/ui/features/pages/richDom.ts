/**
 * Rich text in a contenteditable: runs drawn as DOM, the DOM read back as runs, and the caret as a
 * plain-text offset (a mention counts one, as in `core/services/richText`). The browser types into
 * the DOM; reading it back forgives what it adds on its own (a `<br>`, a `<b>`, an inline style).
 */
import { emblemShape, type CollectionEmblem } from '@unlease/design/emblems';
import { GLYPH_GRID, GLYPH_STROKE, GLYPHS, type GlyphName } from '@unlease/design/glyphs';
import type { BlockTarget, TargetType } from '@unlease/notes/models/blocks';
import { dateShown, dateWords } from '@unlease/core/services/dates';
import { dateRun, normalizeRich, type DateRun, type Marks, type Run } from '@unlease/core/services/richText';

import styles from './pages.module.css';

/** What a mention shows: its name, and its mark (a page's emoji, a collection's cut-out, or a glyph). */
export interface MentionLook {
  readonly title: string;
  readonly gone: boolean;
  readonly emoji: string | null;
  readonly emblem: { readonly shape: CollectionEmblem; readonly color: string } | null;
  readonly glyph: GlyphName;
}

const SVG = 'http://www.w3.org/2000/svg';
const KEY = /^[a-z]{1,20}$/;

/** Only what is safe to open: the web, mail, telephone, and the app's own addresses. */
export function safeHref(href: string): string {
  const value = href.trim();
  if (/^(https?:|mailto:|tel:)/i.test(value) || /^\/(?!\/)/.test(value)) return value;
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(value)) return `https://${value}`;
  return '#';
}

function glyphSvg(name: GlyphName): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${GLYPH_GRID} ${GLYPH_GRID}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'currentColor');
  const { stroke, fill } = GLYPHS[name].line;
  if (stroke) {
    const line = document.createElementNS(SVG, 'path');
    line.setAttribute('d', stroke);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', String(GLYPH_STROKE));
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    svg.append(line);
  }
  if (fill) {
    const solid = document.createElementNS(SVG, 'path');
    solid.setAttribute('d', fill);
    solid.setAttribute('fill-rule', 'evenodd');
    svg.append(solid);
  }
  return svg;
}

function emblemSvg(shape: CollectionEmblem, color: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  const { d, rule } = emblemShape(shape);
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.line = color;
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'var(--fill)');
  path.setAttribute('fill-rule', rule);
  svg.append(path);
  return svg;
}

function mentionNode(target: BlockTarget, look: MentionLook): HTMLElement {
  const chip = document.createElement('span');
  chip.contentEditable = 'false';
  chip.className = styles.mention!;
  chip.dataset.mention = `${target.type}:${target.id}`;
  if (look.gone) chip.dataset.gone = '';
  const mark = document.createElement('span');
  mark.className = styles.mentionMark!;
  if (look.emoji) mark.textContent = look.emoji;
  else mark.append(look.emblem ? emblemSvg(look.emblem.shape, look.emblem.color) : glyphSvg(look.glyph));
  const title = document.createElement('span');
  title.className = styles.mentionTitle!;
  title.textContent = look.title;
  chip.append(mark, title);
  return chip;
}

/** A date: its glyph and the words it reads today (« Demain »); `data-date` holds the day, `T` and the time when it has one. */
function dateNode(run: DateRun): HTMLElement {
  const chip = document.createElement('span');
  chip.contentEditable = 'false';
  chip.className = `${styles.mention} ${styles.date ?? ''}`;
  chip.dataset.date = run.time ? `${run.date}T${run.time}` : run.date;
  // Its words whatever the day, under the pointer (« Demain » is the 29 oct. 2026).
  chip.dataset.tip = dateWords(run);
  const mark = document.createElement('span');
  mark.className = styles.mentionMark!;
  mark.append(glyphSvg('calendar'));
  const title = document.createElement('span');
  title.className = styles.mentionTitle!;
  title.textContent = dateShown(run, Date.now());
  chip.append(mark, title);
  return chip;
}

/** The date a chip holds (`data-date`). */
export function parseDateData(value: string): DateRun | null {
  const [date, time] = value.split('T');
  return date ? dateRun(date, time ?? null) : null;
}

function textNode(text: string, marks: Marks): Node {
  if (Object.keys(marks).length === 0) return document.createTextNode(text);
  const element = marks.a ? document.createElement('a') : document.createElement('span');
  if (marks.a && element instanceof HTMLAnchorElement) {
    element.href = safeHref(marks.a);
    element.target = '_blank';
    element.rel = 'noopener noreferrer';
    element.dataset.href = marks.a;
  }
  for (const flag of ['b', 'i', 'u', 's', 'c', 'k'] as const) if (marks[flag]) element.dataset[flag] = '';
  if (marks.fg && KEY.test(marks.fg)) {
    element.dataset.fg = marks.fg;
    element.style.color = `var(--line-${marks.fg}-text)`;
  }
  if (marks.bg && KEY.test(marks.bg)) {
    element.dataset.bg = marks.bg;
    element.style.backgroundColor = `var(--line-${marks.bg}-tint)`;
  }
  element.textContent = text;
  return element;
}

/** Draws runs into `root`, replacing what it held. */
export function renderRich(root: HTMLElement, runs: readonly Run[], look: (target: BlockTarget) => MentionLook): void {
  const fragment = document.createDocumentFragment();
  for (const run of runs) fragment.append(run.kind === 'mention' ? mentionNode(run.target, look(run.target)) : run.kind === 'date' ? dateNode(run) : textNode(run.text, run.marks));
  // A last empty line needs something to stand on.
  const last = runs[runs.length - 1];
  if (last?.kind === 'text' && last.text.endsWith('\n')) {
    const tail = document.createElement('br');
    tail.dataset.tail = '';
    fragment.append(tail);
  }
  root.replaceChildren(fragment);
}

type MutableMarks = { -readonly [K in keyof Marks]: Marks[K] };

function pigment(value: string, suffix: 'text' | 'tint'): string | null {
  const found = new RegExp(`--line-([a-z]+)-${suffix}`).exec(value);
  return found ? found[1]! : null;
}

/** The marks an element adds: ours (data attributes), the browser's tags, or an inline style it copied. */
function marksOf(element: HTMLElement, inherited: Marks): Marks {
  const next: MutableMarks = { ...inherited };
  const tag = element.tagName;
  const style = element.style;
  const weight = Number(style.fontWeight) || (style.fontWeight === 'bold' ? 700 : 0);
  // An inline weight under bold unsets it, even on a <b>: Google Docs wraps a whole copy in <b style="font-weight:normal">.
  const light = style.fontWeight === 'normal' || style.fontWeight === 'lighter' || (weight > 0 && weight < 600);
  if (light) delete next.b;
  if (((tag === 'B' || tag === 'STRONG') && !light) || element.dataset.b !== undefined || weight >= 600) next.b = true;
  if (tag === 'I' || tag === 'EM' || element.dataset.i !== undefined || style.fontStyle === 'italic') next.i = true;
  if (tag === 'U' || element.dataset.u !== undefined || style.textDecorationLine.includes('underline')) next.u = true;
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || element.dataset.s !== undefined || style.textDecorationLine.includes('line-through')) next.s = true;
  if (tag === 'CODE' || element.dataset.c !== undefined) next.c = true;
  if (tag === 'KBD' || element.dataset.k !== undefined) next.k = true;
  const fg = element.dataset.fg ?? pigment(style.color, 'text');
  if (fg) next.fg = fg;
  const bg = element.dataset.bg ?? pigment(style.backgroundColor, 'tint');
  if (bg) next.bg = bg;
  if (tag === 'A') {
    const href = element.dataset.href ?? element.getAttribute('href');
    if (href && href !== '#') next.a = href;
  }
  return next;
}

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BLOCKQUOTE']);

function parseMention(value: string): BlockTarget | null {
  const [type, id] = value.split(':');
  return (type === 'note' || type === 'link' || type === 'page') && id ? { type: type as TargetType, id } : null;
}

/** What a node (the editable, or a piece of it) holds, as runs. */
export function readRich(root: Node): Run[] {
  const runs: Run[] = [];
  const endsLine = (): boolean => {
    const last = runs[runs.length - 1];
    return !last || (last.kind === 'text' && last.text.endsWith('\n'));
  };
  const walk = (node: Node, marks: Marks): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        runs.push({ kind: 'text', text: (child as Text).data, marks });
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;
      const mention = child.dataset.mention;
      if (mention !== undefined) {
        const target = parseMention(mention);
        if (target) runs.push({ kind: 'mention', target });
        continue;
      }
      if (child.dataset.date !== undefined) {
        const date = parseDateData(child.dataset.date);
        if (date) runs.push(date);
        continue;
      }
      if (child.tagName === 'BR') {
        if (child.dataset.tail === undefined) runs.push({ kind: 'text', text: '\n', marks });
        continue;
      }
      if (BLOCK_TAGS.has(child.tagName) && !endsLine()) runs.push({ kind: 'text', text: '\n', marks });
      walk(child, marksOf(child, marks));
    }
  };
  walk(root, {});
  return normalizeRich(runs);
}

/** Holds nothing but what `renderRich` draws: text, one level of marked spans, mentions, the tail. */
export function isCanonical(root: HTMLElement): boolean {
  for (const child of root.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (!(child instanceof HTMLElement)) return false;
    if (child.dataset.mention !== undefined || child.dataset.date !== undefined) continue;
    if (child.tagName === 'BR') {
      if (child.dataset.tail === undefined || child !== root.lastChild) return false;
      continue;
    }
    if ((child.tagName !== 'SPAN' && child.tagName !== 'A') || child.attributes.length === 0 || child.childNodes.length !== 1 || child.firstChild?.nodeType !== Node.TEXT_NODE) return false;
  }
  return true;
}

function plainLength(runs: readonly Run[]): number {
  let length = 0;
  for (const run of runs) length += run.kind === 'text' ? run.text.length : 1;
  return length;
}

/** The plain-text offset of a DOM position inside `root`. */
export function offsetAt(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(root, 0);
  try {
    range.setEnd(node, offset);
  } catch {
    return 0;
  }
  return plainLength(readRich(range.cloneContents()));
}

/** Where a mention or a date drawn in `root` stands, as an offset. */
export function atomOffset(root: HTMLElement, element: HTMLElement): number {
  const parent = element.parentNode;
  return parent ? offsetAt(root, parent, [...parent.childNodes].indexOf(element)) : 0;
}

/** The mention or date drawn at `offset` in `root`, if one stands there. */
export function atomElementAt(root: HTMLElement, offset: number): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>('[data-mention], [data-date]')) if (atomOffset(root, element) === offset) return element;
  return null;
}

/** The selection inside `root`, as offsets; null when it lies elsewhere. */
export function selectionOffsets(root: HTMLElement): { readonly start: number; readonly end: number; readonly backward: boolean } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !selection.focusNode) return null;
  if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  const anchor = offsetAt(root, selection.anchorNode, selection.anchorOffset);
  const focus = offsetAt(root, selection.focusNode, selection.focusOffset);
  return { start: Math.min(anchor, focus), end: Math.max(anchor, focus), backward: focus < anchor };
}

/** The DOM position of a plain-text offset: the end of the text before it when it falls between two runs. */
function positionAt(root: HTMLElement, target: number): { readonly node: Node; readonly offset: number } {
  let remaining = target;
  const visit = (node: Node): { node: Node; offset: number } | null => {
    const children = [...node.childNodes];
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index]!;
      if (child.nodeType === Node.TEXT_NODE) {
        const length = (child as Text).data.length;
        if (remaining <= length) return { node: child, offset: remaining };
        remaining -= length;
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;
      const atom = child.dataset.mention !== undefined || child.dataset.date !== undefined;
      if (atom || (child.tagName === 'BR' && child.dataset.tail === undefined)) {
        if (remaining === 0) return { node, offset: index };
        remaining -= 1;
        if (remaining === 0 && atom) return { node, offset: index + 1 };
        continue;
      }
      if (child.tagName === 'BR') continue;
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };
  return visit(root) ?? { node: root, offset: root.childNodes.length };
}

/** Puts the caret at `start` (a selection to `end`) inside `root`. */
export function setSelectionOffsets(root: HTMLElement, start: number, end: number = start, backward = false): void {
  const selection = window.getSelection();
  if (!selection) return;
  const from = positionAt(root, start);
  const to = end === start ? from : positionAt(root, end);
  try {
    if (backward) selection.setBaseAndExtent(to.node, to.offset, from.node, from.offset);
    else selection.setBaseAndExtent(from.node, from.offset, to.node, to.offset);
  } catch {
    // A node gone between reading and setting: the caret stays where the browser put it.
  }
}

/** The plain length of what `root` shows. */
export function richLengthOf(root: HTMLElement): number {
  return plainLength(readRich(root));
}

/** Where the caret is drawn: its rectangle, for menus to open at and for moving between lines. */
export function caretRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[rects.length - 1]!;
  // An empty line has no rectangle: its element's does.
  const node = range.startContainer;
  const element = node instanceof HTMLElement ? node : node.parentElement;
  return element ? element.getBoundingClientRect() : null;
}

/** The caret is on the first (or last) line drawn: arrows leave the block from there. */
export function caretOnEdgeLine(root: HTMLElement, edge: 'top' | 'bottom'): boolean {
  const caret = caretRect();
  if (!caret) return true;
  const box = root.getBoundingClientRect();
  const line = parseFloat(getComputedStyle(root).lineHeight) || 24;
  return edge === 'top' ? caret.top - box.top < line * 0.75 : box.bottom - caret.bottom < line * 0.75;
}

/** A caret at `x` on the first or last line of `root`, as near as the text allows. */
export function placeCaretAtX(root: HTMLElement, x: number, edge: 'top' | 'bottom'): boolean {
  const box = root.getBoundingClientRect();
  const line = parseFloat(getComputedStyle(root).lineHeight) || 24;
  const y = edge === 'top' ? box.top + line / 2 : box.bottom - line / 2;
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const position = doc.caretPositionFromPoint?.(x, y);
  const node = position?.offsetNode ?? document.caretRangeFromPoint?.(x, y)?.startContainer;
  const offset = position?.offset ?? document.caretRangeFromPoint?.(x, y)?.startOffset ?? 0;
  if (!node || !root.contains(node)) return false;
  const selection = window.getSelection();
  selection?.setBaseAndExtent(node, offset, node, offset);
  return true;
}
