/**
 * A note's lines in a contenteditable: one block per line (a heading carries its level in
 * `data-heading`), marked words as spans (`data-b`, `data-i`, `data-u`), a mention of a person as a
 * chip that is not typed into (`data-mention`, its name drawn from `data-name`, one invisible
 * character inside so it counts one), an empty line holding a `<br>` to stand on. The browser types into it; reading it back forgives what it adds on its own
 * (its `<b>`, a stray `<br>`, text typed outside any line). Offsets are plain-text offsets, a line
 * break counting one, as `notes/services/noteBody` counts them.
 */
import { isFormatted, NOTE_FLAGS, type HeadingLevel, type NoteLine } from '@unlease/notes/services/noteBody';
import { normalizeRich, serializeRich, type Marks, type Run } from '@unlease/core/services/richText';
import type { Ref } from '@unlease/core/refs';
import { GLYPH_GRID, GLYPH_STROKE, GLYPHS } from '@unlease/design/glyphs';
import { mentionName } from '@unlease/notes/services/noteMentions';

import { nameOfMention } from '../../../app/mentions';
import { linesLength } from './lineEdits';

/** What a mention's chip holds: one character, so it counts one (as `noteBody` counts it), that shows nothing. */
export const MENTION_CHAR = '\u2060';

/** The reference a chip's `data-mention` names (`contact:<id>`). */
export function parseMention(value: string | undefined): Ref | null {
  const match = value ? /^([a-z]{1,20}):([A-Za-z0-9_-]{1,64})$/.exec(value) : null;
  return match ? { type: match[1]!, id: match[2]! } : null;
}

/** A mention's name now, and whether its subject is gone. */
function chipName(target: Ref): { readonly name: string; readonly gone: boolean } {
  const name = nameOfMention(target);
  return name === null ? { name: mentionName(target), gone: true } : { name, gone: false };
}

const SVG = 'http://www.w3.org/2000/svg';

/** The person glyph, drawn in the chip (an SVG holds no text: the chip still counts one). */
function chipGlyph(glyph: 'person' | 'calendar'): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${GLYPH_GRID} ${GLYPH_GRID}`);
  svg.setAttribute('aria-hidden', 'true');
  const { stroke, fill } = GLYPHS[glyph].line;
  if (stroke) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', stroke);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', String(GLYPH_STROKE));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  }
  if (fill) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', fill);
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('fill-rule', 'evenodd');
    svg.append(path);
  }
  return svg;
}

/** A mention's chip: the glyph, its one character, and its name (`data-name`, which the stylesheet draws after it). */
function mentionElement(target: Ref): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.contentEditable = 'false';
  chip.dataset.mention = `${target.type}:${target.id}`;
  const { name, gone } = chipName(target);
  chip.dataset.name = name;
  if (gone) chip.dataset.gone = '';
  chip.setAttribute('role', 'link');
  chip.setAttribute('aria-label', name);
  chip.append(chipGlyph(target.type === 'event' ? 'calendar' : 'person'), document.createTextNode(MENTION_CHAR));
  return chip;
}

const isChip = (node: Node): node is HTMLElement => node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).dataset?.mention !== undefined;

type MutableMarks = { -readonly [K in keyof Marks]: Marks[K] };

const FLAG_ATTRIBUTES = new Set(NOTE_FLAGS.map(flag => `data-${flag}`));
const BLOCKS = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL']);
/** What a paste never brings in. */
const SKIPPED = new Set(['HEAD', 'IFRAME', 'NOSCRIPT', 'OBJECT', 'SCRIPT', 'STYLE', 'SVG', 'TEMPLATE', 'TITLE']);

const isText = (node: Node): node is Text => node.nodeType === Node.TEXT_NODE;
const isElement = (node: Node): node is HTMLElement => node.nodeType === Node.ELEMENT_NODE;
const nameOf = (node: Node): string => node.nodeName.toUpperCase();

// ── drawing ───────────────────────────────────────────────────────────────

/** One line's element, as the editor draws it. */
export function lineElement(line: NoteLine): HTMLDivElement {
  const element = document.createElement('div');
  if (line.heading > 0) element.dataset.heading = String(line.heading);
  for (const run of line.runs) {
    if (run.kind === 'mention') {
      element.append(mentionElement(run.target));
      continue;
    }
    // A date (Pages' alone) met all the same stands as its one character.
    const text = run.kind === 'text' ? run.text : '￼';
    const flags = run.kind === 'text' ? NOTE_FLAGS.filter(flag => run.marks[flag]) : [];
    if (flags.length === 0) {
      element.append(document.createTextNode(text));
      continue;
    }
    const span = document.createElement('span');
    for (const flag of flags) span.dataset[flag] = '';
    span.textContent = text;
    element.append(span);
  }
  if (line.runs.length === 0) element.append(document.createElement('br'));
  return element;
}

/** Exactly what `lineElement` draws (a `<br>` the browser leaves at a line's end aside). */
function isCanonicalLine(node: Node): node is HTMLDivElement {
  if (nameOf(node) !== 'DIV') return false;
  const element = node as HTMLDivElement;
  for (const attribute of element.attributes) if (attribute.name !== 'data-heading' || !['1', '2', '3'].includes(attribute.value)) return false;
  const children = element.childNodes;
  if (children.length === 0) return false;
  if (children.length === 1 && nameOf(children[0]!) === 'BR') return (children[0] as Element).attributes.length === 0;
  for (const child of children) {
    if (isText(child)) {
      if (!child.data || child.data.includes('\n')) return false;
      continue;
    }
    const name = nameOf(child);
    if (name === 'BR') {
      if (child !== element.lastChild || (child as Element).attributes.length > 0) return false;
      continue;
    }
    if (isChip(child)) {
      if (!parseMention(child.dataset.mention) || child.textContent !== MENTION_CHAR) return false;
      continue;
    }
    if (name !== 'SPAN') return false;
    const span = child as HTMLSpanElement;
    if (span.attributes.length === 0) return false;
    for (const attribute of span.attributes) if (!FLAG_ATTRIBUTES.has(attribute.name)) return false;
    const inner = span.firstChild;
    if (span.childNodes.length !== 1 || !inner || !isText(inner) || !inner.data || inner.data.includes('\n')) return false;
  }
  return true;
}

/** The editable holds nothing but what `renderLines` draws. */
export function isCanonical(root: HTMLElement): boolean {
  if (root.childNodes.length === 0) return false;
  for (const child of root.childNodes) if (!isCanonicalLine(child)) return false;
  return true;
}

/** A line drawn by `lineElement`, read back. */
function readCanonicalLine(element: HTMLDivElement): NoteLine {
  const runs: Run[] = [];
  for (const child of element.childNodes) {
    if (isText(child)) runs.push({ kind: 'text', text: child.data, marks: {} });
    else if (isChip(child)) {
      const target = parseMention(child.dataset.mention);
      if (target) runs.push({ kind: 'mention', target });
    } else if (nameOf(child) === 'SPAN') {
      const marks: MutableMarks = {};
      for (const flag of NOTE_FLAGS) if ((child as HTMLElement).dataset[flag] !== undefined) marks[flag] = true;
      runs.push({ kind: 'text', text: child.textContent ?? '', marks });
    }
  }
  const level = Number(element.dataset.heading ?? 0);
  return { heading: (level === 1 || level === 2 || level === 3 ? level : 0) as HeadingLevel, runs: normalizeRich(runs) };
}

/** A line as drawn: its marks, and the names its mentions show now (a rename draws it again). */
const lineKey = (line: NoteLine): string => {
  const names = line.runs.flatMap(run => (run.kind === 'mention' ? [`${chipName(run.target).name}${chipName(run.target).gone ? '!' : ''}`] : []));
  return `${line.heading}|${serializeRich(line.runs)}|${names.join('|')}`;
};

/** The key of a line drawn in the editable: its runs read back, and the names its chips show. */
function drawnKey(node: HTMLDivElement): string {
  const names = [...node.childNodes].filter(isChip).map(chip => `${chip.dataset.name ?? ''}${chip.dataset.gone !== undefined ? '!' : ''}`);
  const line = readCanonicalLine(node);
  return `${line.heading}|${serializeRich(line.runs)}|${names.join('|')}`;
}

/** Draws lines into the editable, keeping the lines already drawn as they should be (the caret stays in them). */
export function renderLines(root: HTMLElement, lines: readonly NoteLine[]): void {
  const nodes = [...root.childNodes];
  const keys = nodes.map(node => (isCanonicalLine(node) ? drawnKey(node) : null));
  const wanted = lines.map(lineKey);
  let head = 0;
  while (head < nodes.length && head < wanted.length && keys[head] === wanted[head]) head += 1;
  let tail = 0;
  while (tail < nodes.length - head && tail < wanted.length - head && keys[nodes.length - 1 - tail] === wanted[wanted.length - 1 - tail]) tail += 1;
  const before = nodes[nodes.length - tail] ?? null;
  for (const node of nodes.slice(head, nodes.length - tail)) node.remove();
  const fragment = document.createDocumentFragment();
  for (const line of lines.slice(head, lines.length - tail)) fragment.append(lineElement(line));
  root.insertBefore(fragment, before);
}

// ── reading ───────────────────────────────────────────────────────────────

function headingOf(element: HTMLElement): HeadingLevel | null {
  const level = element.dataset?.heading;
  if (level === '1' || level === '2' || level === '3') return Number(level) as HeadingLevel;
  const name = nameOf(element);
  if (name === 'H1') return 1;
  if (name === 'H2') return 2;
  if (name === 'H3' || name === 'H4' || name === 'H5' || name === 'H6') return 3;
  return null;
}

/** The marks an element adds: ours (data attributes) and the browser's tags; a paste's inline styles too. */
function marksOf(element: HTMLElement, inherited: Marks, pasted: boolean): Marks {
  const next: MutableMarks = { ...inherited };
  const name = nameOf(element);
  const data = element.dataset ?? {};
  let light = false;
  if (pasted && element.style) {
    const { fontWeight, fontStyle } = element.style;
    const weight = Number(fontWeight);
    // A light weight unsets bold, even on a <b>: Google Docs wraps a whole copy in <b style="font-weight:normal">.
    light = fontWeight === 'normal' || fontWeight === 'lighter' || (weight > 0 && weight < 600);
    if (light) delete next.b;
    if (weight >= 600 || fontWeight === 'bold' || fontWeight === 'bolder') next.b = true;
    if (fontStyle === 'italic' || fontStyle === 'oblique') next.i = true;
    else if (fontStyle === 'normal') delete next.i;
    const decoration = `${element.style.textDecorationLine ?? ''} ${element.style.textDecoration ?? ''}`;
    if (decoration.includes('underline')) next.u = true;
  }
  if (((name === 'B' || name === 'STRONG') && !light) || data.b !== undefined) next.b = true;
  if (name === 'I' || name === 'EM' || data.i !== undefined) next.i = true;
  if (name === 'U' || name === 'INS' || data.u !== undefined) next.u = true;
  return next;
}

interface Building {
  readonly heading: HeadingLevel;
  readonly runs: Run[];
}

/**
 * What a node holds, as lines: each block a line (or more, at its `<br>`s), text outside any block
 * a line of its own, an empty block an empty line. `pasted` reads HTML from elsewhere: its spaces
 * collapse as a page shows them and its inline styles count (bold, italic, underline).
 */
export function readLines(root: Node, pasted = false): NoteLine[] {
  const out: Building[] = [];
  let open: Building | null = null;
  const take = (heading: HeadingLevel): Building => {
    if (!open) {
      open = { heading, runs: [] };
      out.push(open);
    }
    return open;
  };
  const walk = (node: Node, marks: Marks, heading: HeadingLevel, pre: boolean): void => {
    for (const child of node.childNodes) {
      if (isText(child)) {
        let value = child.data;
        if (pasted && !pre) {
          value = value.replace(/[ \t\n\r\f]+/g, ' ');
          if (!open && !value.trim()) continue;
        }
        value.split('\n').forEach((part, index) => {
          if (index > 0) {
            take(heading);
            open = null;
          }
          if (part) take(heading).runs.push({ kind: 'text', text: part, marks });
        });
        continue;
      }
      if (!isElement(child)) continue;
      if (child.dataset?.mention !== undefined) {
        // A chip (ours, or one copied from a note or a page): a person stays a mention; anything else is left out.
        const target = parseMention(child.dataset.mention);
        if (target && (!pasted || target.type === 'contact')) take(heading).runs.push({ kind: 'mention', target });
        continue;
      }
      const name = nameOf(child);
      if (SKIPPED.has(name)) continue;
      if (name === 'BR') {
        take(heading);
        open = null;
        continue;
      }
      if (!BLOCKS.has(name)) {
        walk(child, marksOf(child, marks, pasted), heading, pre);
        continue;
      }
      const level = headingOf(child) ?? heading;
      open = null;
      const before = out.length;
      walk(child, marksOf(child, marks, pasted), level, pre || name === 'PRE');
      if (out.length === before && !(pasted && name === 'HR')) out.push({ heading: level, runs: [] });
      open = null;
    }
  };
  walk(root, {}, 0, false);
  const lines = out.map(line => ({ heading: line.heading, runs: normalizeRich(line.runs) }));
  return lines.length > 0 ? lines : [{ heading: 0, runs: [] }];
}

/** A pasted line's words: the note's marks alone (a heading's own weight is the heading's), no spaces at its ends. */
function pastedRuns(line: NoteLine): Run[] {
  const runs: Run[] = [];
  for (const run of line.runs) {
    if (run.kind === 'mention') {
      runs.push(run);
      continue;
    }
    if (run.kind !== 'text') continue;
    const marks: MutableMarks = {};
    for (const flag of NOTE_FLAGS) if (run.marks[flag] && !(flag === 'b' && line.heading > 0)) marks[flag] = true;
    runs.push({ kind: 'text', text: run.text, marks });
  }
  const first = runs[0];
  if (first?.kind === 'text') runs[0] = { ...first, text: first.text.replace(/^ +/, '') };
  const last = runs[runs.length - 1];
  if (last?.kind === 'text') runs[runs.length - 1] = { ...last, text: last.text.replace(/ +$/, '') };
  return normalizeRich(runs);
}

/** A paste's HTML as lines, when it holds marks or headings worth keeping; null for words alone (their plain text is pasted). */
export function linesFromHtml(html: string): NoteLine[] | null {
  if (typeof DOMParser === 'undefined') return null;
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const lines = readLines(body, true).map(line => ({ heading: line.heading, runs: pastedRuns(line) }));
  while (lines.length > 1 && lines[0]!.runs.length === 0) lines.shift();
  while (lines.length > 1 && lines[lines.length - 1]!.runs.length === 0) lines.pop();
  return isFormatted(lines) ? lines : null;
}

// ── offsets ───────────────────────────────────────────────────────────────

const textOf = (node: Node): string => node.textContent ?? '';

/** The plain-text offset of a DOM position, the editable holding lines as drawn. */
function offsetAt(root: HTMLElement, node: Node, offset: number): number {
  if (node === root) {
    let at = 0;
    const children = root.childNodes;
    for (let index = 0; index < children.length; index += 1) {
      if (index === offset) return at;
      at += textOf(children[index]!).length + 1;
    }
    return Math.max(0, at - 1);
  }
  let top: Node | null = node;
  while (top && top.parentNode !== root) top = top.parentNode;
  if (!top) return 0;
  let at = 0;
  for (let sibling = top.previousSibling; sibling; sibling = sibling.previousSibling) at += textOf(sibling).length + 1;
  const range = document.createRange();
  range.setStart(top, 0);
  try {
    range.setEnd(node, offset);
  } catch {
    return at;
  }
  return at + range.toString().length;
}

/** The same, whatever the browser left in the editable: what lies before the position, read as lines. */
function looseOffsetAt(root: HTMLElement, node: Node, offset: number): number {
  if (node === root) return offsetAt(root, node, offset);
  const range = document.createRange();
  range.setStart(root, 0);
  try {
    range.setEnd(node, offset);
  } catch {
    return 0;
  }
  return linesLength(readLines(range.cloneContents()));
}

export interface TextSelection {
  readonly start: number;
  readonly end: number;
  /** The focus is before the anchor. */
  readonly backward: boolean;
}

/** The selection inside the editable, as offsets; null when it lies elsewhere. `loose`: the browser may have left its own nodes. */
export function selectionOffsets(root: HTMLElement, loose = false): TextSelection | null {
  const selection = typeof window === 'undefined' ? null : window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !selection.focusNode) return null;
  if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  const measure = loose ? looseOffsetAt : offsetAt;
  const anchor = measure(root, selection.anchorNode, selection.anchorOffset);
  const focus = selection.focusNode === selection.anchorNode && selection.focusOffset === selection.anchorOffset ? anchor : measure(root, selection.focusNode, selection.focusOffset);
  return { start: Math.min(anchor, focus), end: Math.max(anchor, focus), backward: focus < anchor };
}

/** The position `rest` characters into a line's children: a chip is one, never entered (the caret stands before or after it). */
function positionIn(container: Node, rest: number): { readonly node: Node; readonly offset: number; readonly left: number } {
  const children = container.childNodes;
  let left = rest;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]!;
    if (isText(child)) {
      if (left <= child.data.length) return { node: child, offset: left, left: -1 };
      left -= child.data.length;
    } else if (isChip(child)) {
      if (left === 0) return { node: container, offset: index, left: -1 };
      left -= 1;
      if (left === 0) return { node: container, offset: index + 1, left: -1 };
    } else if (nameOf(child) !== 'BR') {
      const found = positionIn(child, left);
      if (found.left < 0) return found;
      left = found.left;
    }
  }
  return { node: container, offset: children.length, left };
}

/** The DOM position of an offset: at a boundary between two runs, the end of the one before (its marks go on). */
function positionAt(root: HTMLElement, target: number): { readonly node: Node; readonly offset: number } {
  const lines = root.childNodes;
  let left = Math.max(0, target);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const length = textOf(line).length;
    if (left <= length || index === lines.length - 1) {
      const found = positionIn(line, Math.min(left, length));
      return found.left < 0 ? found : { node: line, offset: 0 };
    }
    left -= length + 1;
  }
  return { node: root, offset: 0 };
}

/** Puts the caret at `start` (a selection to `end`) inside the editable. */
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

/** The selection lies on the editable itself, between its lines (a click where nothing is laid out, a select-all): it belongs in a line. */
export function caretOnRoot(root: HTMLElement): boolean {
  const selection = window.getSelection();
  return !!selection && selection.rangeCount > 0 && (selection.anchorNode === root || selection.focusNode === root);
}

// ── copying ───────────────────────────────────────────────────────────────

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Lines as HTML for the clipboard: headings, marks, and each mention as a chip naming its person (`readLines` reads it back). */
export function linesHtml(lines: readonly NoteLine[]): string {
  return lines
    .map(line => {
      const words = line.runs
        .map(run => {
          if (run.kind === 'mention') return `<span data-mention="${escapeHtml(`${run.target.type}:${run.target.id}`)}">${escapeHtml(chipName(run.target).name)}</span>`;
          if (run.kind !== 'text') return '';
          let html = escapeHtml(run.text);
          if (run.marks.b) html = `<b>${html}</b>`;
          if (run.marks.i) html = `<i>${html}</i>`;
          if (run.marks.u) html = `<u>${html}</u>`;
          return html;
        })
        .join('');
      const tag = line.heading > 0 ? `h${line.heading}` : 'div';
      return `<${tag}>${words || '<br>'}</${tag}>`;
    })
    .join('');
}
