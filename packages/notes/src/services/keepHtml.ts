/**
 * Google Keep's formatted text, as Takeout writes it (`textContentHtml`: paragraphs of spans whose
 * `style` says bold, italic or underline; headings as `<h1>`–`<h3>`, or `<b>`, `<i>`, `<u>`), read
 * into a note's formatted lines (`notes/services/noteBody`). No DOM: the packages run in Hermes and
 * Node too. The words always come from Keep's plain text (`textContent`); this only finds which of
 * them wear a mark, so a page Keep wrote differently from what this reader expects loses its
 * formatting, never a word.
 */
import { richFromPlain, type Marks, type Run } from '@unlease/core/services/richText';

import { carryMarks, isFormatted, plainLines, type HeadingLevel, type NoteLine } from './noteBody';

const BLOCKS = new Set(['p', 'div', 'li', 'ul', 'ol', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer', 'pre', 'tr']);
const VOID = new Set(['br', 'img', 'hr', 'meta', 'link', 'input', 'wbr']);

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** The marks a tag and its inline style put on what it holds. */
function marksOf(tag: string, attributes: string): Marks {
  const marks: { b?: true; i?: true; u?: true } = {};
  if (tag === 'b' || tag === 'strong') marks.b = true;
  if (tag === 'i' || tag === 'em') marks.i = true;
  if (tag === 'u' || tag === 'ins') marks.u = true;
  const style = /\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attributes);
  const css = decode(style?.[2] ?? style?.[3] ?? '').toLowerCase();
  if (css) {
    const weight = /font-weight\s*:\s*([a-z0-9]+)/.exec(css)?.[1];
    if (weight === 'bold' || weight === 'bolder' || (weight !== undefined && /^\d+$/.test(weight) && Number(weight) >= 600)) marks.b = true;
    if (/font-style\s*:\s*(italic|oblique)/.test(css)) marks.i = true;
    if (/text-decoration(-line)?\s*:[^;]*underline/.test(css)) marks.u = true;
  }
  return marks;
}

interface Open {
  readonly tag: string;
  readonly marks: Marks;
}

/** The HTML's own lines, marks and headings as it draws them. */
export function htmlLines(html: string): NoteLine[] {
  const lines: { heading: HeadingLevel; runs: Run[] }[] = [];
  let current: { heading: HeadingLevel; runs: Run[] } | null = null;
  const stack: Open[] = [];
  const heading = (): HeadingLevel => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const found = /^h([1-6])$/.exec(stack[i]!.tag);
      if (found) return Math.min(3, Number(found[1])) as HeadingLevel;
    }
    return 0;
  };
  const breakLine = (): void => {
    current = null;
  };
  const line = (): { heading: HeadingLevel; runs: Run[] } => {
    if (!current) {
      current = { heading: heading(), runs: [] };
      lines.push(current);
    }
    return current;
  };
  const write = (text: string): void => {
    const marks = Object.assign({}, ...stack.map(open => open.marks)) as Marks;
    text.split('\n').forEach((part, index) => {
      if (index > 0) {
        line();
        breakLine();
      }
      if (part) line().runs.push({ kind: 'text', text: part, marks });
    });
  };

  const tokens = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)|</g;
  for (const token of html.matchAll(tokens)) {
    const [whole, rawTag, attributes = '', text] = token;
    if (text !== undefined) {
      write(decode(text));
      continue;
    }
    if (!rawTag) {
      if (whole === '<') write('<');
      continue;
    }
    const tag = rawTag.toLowerCase();
    const closing = whole.startsWith('</');
    if (tag === 'br') {
      line();
      breakLine();
      continue;
    }
    if (tag === 'style' || tag === 'script') continue;
    if (closing) {
      const at = stack.map(open => open.tag).lastIndexOf(tag);
      if (at >= 0) stack.splice(at);
      if (BLOCKS.has(tag)) breakLine();
      continue;
    }
    if (BLOCKS.has(tag)) breakLine();
    if (VOID.has(tag) || whole.endsWith('/>')) continue;
    stack.push({ tag, marks: marksOf(tag, attributes) });
  }
  return lines.map(({ heading: level, runs }) => ({ heading: level, runs }));
}

const words = (text: string): string => text.replace(/\s+/g, '');

/**
 * Keep's plain text as a note's formatted lines, wearing the marks and headings its HTML gives
 * those words; null when the HTML adds nothing (the note stays plain) or does not hold the same
 * words (its formatting cannot be placed safely).
 */
export function keepFormattedLines(plain: string, html: string): NoteLine[] | null {
  if (!html.includes('<')) return null;
  const drawn = htmlLines(html);
  if (!isFormatted(drawn)) return null;
  const drawnText = drawn.map(line => line.runs.map(run => (run.kind === 'text' ? run.text : '')).join('')).join('\n');
  if (words(drawnText) !== words(plain)) return null;
  const lines = carryMarks(drawn, plain.length > 0 ? plainLines(plain) : [{ heading: 0, runs: richFromPlain('') }]);
  return isFormatted(lines) ? lines : null;
}
