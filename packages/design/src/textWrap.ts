/**
 * How many lines a text takes in a box, from Signika's own advance widths (`design/advances`):
 * greedy breaks at spaces and after hyphens, dashes and question marks, and a word too long for a
 * line (a URL: slashes are no break) cut where it overflows. Android's simple break strategy and browsers
 * break the same way, so the board sizes its cards without measuring them.
 */
import { ADVANCES, type AdvanceWeight } from './advances';

/** A character the fonts lack (a script outside Latin): about a figure's width. */
const UNKNOWN = 560;
/** An emoji or any other astral character is drawn about one em wide. */
const ASTRAL = 1000;
/** Kerning tightens running text by about 0.4% (measured with HarfBuzz on French copy). */
const KERNING = 0.996;
/** Break opportunities after these, inside a word (a URL's query breaks after its "?"): `-`, `?`, `!`, the hyphen and the dashes. */
const breaksAfter = (code: number): boolean => code === 0x2d || code === 0x3f || code === 0x21 || code === 0x2010 || code === 0x2013 || code === 0x2014;
const SPACE = 0x20;
const TAB = 0x09;

/**
 * A weight's advances by code point. What running text is made of (Latin, its accents, its
 * punctuation) is read from an array: a wall sizes every note it holds as it opens, a character at
 * a time.
 */
interface Advances {
  readonly near: Float64Array;
  readonly far: Map<number, number>;
}

/** The code points kept in the array. */
const NEAR = 0x250;

const TABLES = new Map<AdvanceWeight, Advances>();

function table(weight: AdvanceWeight): Advances {
  let found = TABLES.get(weight);
  if (!found) {
    const near = new Float64Array(NEAR).fill(UNKNOWN);
    const far = new Map<number, number>();
    for (const [start, widths] of ADVANCES[weight]) {
      widths.forEach((width, index) => {
        const code = start + index;
        if (code < NEAR) near[code] = width;
        else far.set(code, width);
      });
    }
    found = { near, far };
    TABLES.set(weight, found);
  }
  return found;
}

/** A code point's advance, in thousandths of an em. */
function advanceOf(widths: Advances, code: number): number {
  return code < NEAR ? widths.near[code]! : (widths.far.get(code) ?? (code > 0xffff ? ASTRAL : UNKNOWN));
}

/** The code point at `index` of `text`, a character outside the first plane read whole (it takes two places). */
function codeAt(text: string, index: number): number {
  const code = text.charCodeAt(index);
  if (code < 0xd800 || code > 0xdbff || index + 1 >= text.length) return code;
  const low = text.charCodeAt(index + 1);
  return low >= 0xdc00 && low <= 0xdfff ? (code - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000 : code;
}

/** The width of `text` at `size`, in the unit `size` is given in. */
export function textWidth(text: string, size: number, weight: AdvanceWeight = 'regular'): number {
  const widths = table(weight);
  let total = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = codeAt(text, index);
    if (code > 0xffff) index += 1;
    total += advanceOf(widths, code);
  }
  return (total * size * KERNING) / 1000;
}

/** One paragraph's lines, counting no further than `max`. */
function paragraphLines(paragraph: string, room: number, scale: number, widths: Advances, max: number): number {
  let lines = 1;
  // The current line's width, the spaces waiting after its last word, the word being read.
  let line = 0;
  let spaces = 0;
  let word = 0;
  const lay = () => {
    if (word === 0) return;
    if (line > 0 && line + spaces + word > room) {
      lines += 1;
      line = 0;
    } else {
      line += spaces;
    }
    // Too long for any line: cut where it overflows, line after line.
    while (word > room) {
      word -= room;
      lines += 1;
    }
    line += word;
    word = 0;
    spaces = 0;
  };
  for (let index = 0; index < paragraph.length; index += 1) {
    if (lines > max) break;
    const code = codeAt(paragraph, index);
    if (code > 0xffff) index += 1;
    const advance = advanceOf(widths, code) * scale;
    if (code === SPACE || code === TAB) {
      lay();
      spaces += advance;
      continue;
    }
    word += advance;
    if (breaksAfter(code)) lay();
  }
  lay();
  return lines;
}

const cache = new Map<string, number>();
const CACHE_LIMIT = 4000;

/** Lines `text` takes in a box `width` wide at `size` (same unit), `max` at most. An empty text takes none. */
export function wrapLines(text: string, width: number, size: number, weight: AdvanceWeight = 'regular', max = Number.POSITIVE_INFINITY): number {
  if (!text) return 0;
  const key = `${weight}|${size}|${width}|${max}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const widths = table(weight);
  const scale = (size * KERNING) / 1000;
  let lines = 0;
  for (const paragraph of text.split(/\r?\n/)) {
    lines += paragraphLines(paragraph, width, scale, widths, max - lines);
    if (lines >= max) {
      lines = max;
      break;
    }
  }
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, lines);
  return lines;
}

/** A piece of a line in one weight. */
export interface WeightedRun {
  readonly text: string;
  readonly weight: AdvanceWeight;
}

/**
 * Where each line a paragraph of weighted runs breaks into ends (offsets in its text), as
 * `wrapLines` breaks (greedy, at spaces and after hyphens), `max` lines at most.
 */
function paragraphBreaks(runs: readonly WeightedRun[], room: number, size: number, max: number): number[] {
  const ends: number[] = [];
  let line = 0;
  let spaces = 0;
  let word = 0;
  let offset = 0;
  // Where the word being read starts, and where the line's last laid word ends.
  let wordStart = 0;
  let laidEnd = 0;
  const lay = (): void => {
    if (word === 0) return;
    if (line > 0 && line + spaces + word > room) {
      ends.push(laidEnd);
      line = 0;
    } else {
      line += spaces;
    }
    while (word > room) {
      word -= room;
      ends.push(wordStart);
    }
    line += word;
    laidEnd = offset;
    word = 0;
    spaces = 0;
  };
  for (const run of runs) {
    const widths = table(run.weight);
    const scale = (size * KERNING) / 1000;
    const text = run.text;
    for (let index = 0; index < text.length; index += 1) {
      if (ends.length >= max) return ends.slice(0, max);
      const code = codeAt(text, index);
      const length = code > 0xffff ? 2 : 1;
      index += length - 1;
      const advance = advanceOf(widths, code) * scale;
      if (code === SPACE || code === TAB) {
        lay();
        spaces += advance;
        offset += length;
        wordStart = offset;
        continue;
      }
      if (word === 0) wordStart = offset;
      word += advance;
      offset += length;
      if (breaksAfter(code)) {
        lay();
        wordStart = offset;
      }
    }
  }
  lay();
  ends.push(offset);
  return ends.slice(0, max);
}

const wrapped = new WeakMap<object, Map<string, number>>();

/** Lines paragraphs of weighted runs take in a box `width` wide at `size`, `max` at most. An empty paragraph takes one line. Kept per paragraphs and box. */
export function wrapRunLines(paragraphs: readonly (readonly WeightedRun[])[], width: number, size: number, max = Number.POSITIVE_INFINITY): number {
  const key = `${size}|${width}|${max}`;
  let known = wrapped.get(paragraphs);
  const hit = known?.get(key);
  if (hit !== undefined) return hit;
  let lines = 0;
  for (const paragraph of paragraphs) {
    lines += paragraphBreaks(paragraph, width, size, max - lines).length;
    if (lines >= max) {
      lines = max;
      break;
    }
  }
  if (!known) {
    known = new Map();
    wrapped.set(paragraphs, known);
  }
  known.set(key, lines);
  return lines;
}

/**
 * How far into the text (paragraphs joined by a line break each) the first `lines` lines reach:
 * marks drawn beyond it may fall on a line a cut text never lays out.
 */
export function textReach(paragraphs: readonly (readonly WeightedRun[])[], width: number, size: number, lines: number): number {
  let reach = 0;
  let left = lines;
  for (const paragraph of paragraphs) {
    if (left <= 0) return Math.max(0, reach - 1);
    const ends = paragraphBreaks(paragraph, width, size, left);
    const length = paragraph.reduce((total, run) => total + run.text.length, 0);
    if (ends.length >= left && ends[left - 1]! < length) return reach + ends[left - 1]!;
    left -= ends.length;
    reach += length + 1;
  }
  return Number.POSITIVE_INFINITY;
}
