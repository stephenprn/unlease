/**
 * A note's lines in a contenteditable: one block per line (a heading carries its level in
 * `data-heading`), marked words as spans (`data-b`, `data-i`, `data-u`), an empty line holding a
 * `<br>` to stand on. The browser types into it; reading it back forgives what it adds on its own
 * (its `<b>`, a stray `<br>`, text typed outside any line). Offsets are plain-text offsets, a line
 * break counting one, as `notes/services/noteBody` counts them.
 */
import { isFormatted, NOTE_FLAGS, type HeadingLevel, type NoteLine } from '@unlease/notes/services/noteBody';
import { normalizeRich, serializeRich, type Marks, type Run, type TextRun } from '@unlease/core/services/richText';

import { linesLength } from './lineEdits';

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
    // A note holds no mention; one met all the same stands as its one character.
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
    else if (nameOf(child) === 'SPAN') {
      const marks: MutableMarks = {};
      for (const flag of NOTE_FLAGS) if ((child as HTMLElement).dataset[flag] !== undefined) marks[flag] = true;
      runs.push({ kind: 'text', text: child.textContent ?? '', marks });
    }
  }
  const level = Number(element.dataset.heading ?? 0);
  return { heading: (level === 1 || level === 2 || level === 3 ? level : 0) as HeadingLevel, runs: normalizeRich(runs) };
}

const lineKey = (line: NoteLine): string => `${line.heading}|${serializeRich(line.runs)}`;

/** Draws lines into the editable, keeping the lines already drawn as they should be (the caret stays in them). */
export function renderLines(root: HTMLElement, lines: readonly NoteLine[]): void {
  const nodes = [...root.childNodes];
  const keys = nodes.map(node => (isCanonicalLine(node) ? lineKey(readCanonicalLine(node)) : null));
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
  const runs: TextRun[] = [];
  for (const run of line.runs) {
    if (run.kind !== 'text') continue;
    const marks: MutableMarks = {};
    for (const flag of NOTE_FLAGS) if (run.marks[flag] && !(flag === 'b' && line.heading > 0)) marks[flag] = true;
    runs.push({ kind: 'text', text: run.text, marks });
  }
  const first = runs[0];
  if (first) runs[0] = { ...first, text: first.text.replace(/^ +/, '') };
  const last = runs[runs.length - 1];
  if (last) runs[runs.length - 1] = { ...last, text: last.text.replace(/ +$/, '') };
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

/** The DOM position of an offset: at a boundary between two runs, the end of the one before (its marks go on). */
function positionAt(root: HTMLElement, target: number): { readonly node: Node; readonly offset: number } {
  const lines = root.childNodes;
  let left = Math.max(0, target);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const length = textOf(line).length;
    if (left <= length || index === lines.length - 1) {
      let rest = Math.min(left, length);
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode() as Text | null; text; text = walker.nextNode() as Text | null) {
        if (rest <= text.data.length) return { node: text, offset: rest };
        rest -= text.data.length;
      }
      return { node: line, offset: 0 };
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
