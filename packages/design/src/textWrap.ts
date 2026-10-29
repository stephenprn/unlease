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
/** Break opportunities after these, inside a word (a URL's query breaks after its "?"). */
const BREAK_AFTER = new Set(['-', '?', '!', '\u2010', '\u2013', '\u2014']);

const TABLES = new Map<AdvanceWeight, Map<number, number>>();

function table(weight: AdvanceWeight): Map<number, number> {
  let found = TABLES.get(weight);
  if (!found) {
    const built = new Map<number, number>();
    for (const [start, widths] of ADVANCES[weight]) widths.forEach((width, index) => built.set(start + index, width));
    TABLES.set(weight, built);
    found = built;
  }
  return found;
}

/** A character's advance, in thousandths of an em. */
function advanceOf(widths: Map<number, number>, char: string): number {
  const code = char.codePointAt(0) ?? 32;
  return widths.get(code) ?? (code > 0xffff ? ASTRAL : UNKNOWN);
}

/** The width of `text` at `size`, in the unit `size` is given in. */
export function textWidth(text: string, size: number, weight: AdvanceWeight = 'regular'): number {
  const widths = table(weight);
  let total = 0;
  for (const char of text) total += advanceOf(widths, char);
  return (total * size * KERNING) / 1000;
}

/** One paragraph's lines, counting no further than `max`. */
function paragraphLines(paragraph: string, room: number, scale: number, widths: Map<number, number>, max: number): number {
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
  for (const char of paragraph) {
    if (lines > max) break;
    const advance = advanceOf(widths, char) * scale;
    if (char === ' ' || char === '\t') {
      lay();
      spaces += advance;
      continue;
    }
    word += advance;
    if (BREAK_AFTER.has(char)) lay();
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
    for (const char of run.text) {
      if (ends.length >= max) return ends.slice(0, max);
      const advance = advanceOf(widths, char) * scale;
      if (char === ' ' || char === '\t') {
        lay();
        spaces += advance;
        offset += char.length;
        wordStart = offset;
        continue;
      }
      if (word === 0) wordStart = offset;
      word += advance;
      offset += char.length;
      if (BREAK_AFTER.has(char)) {
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
