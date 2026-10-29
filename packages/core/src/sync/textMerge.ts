/**
 * Three-way merge of typed text, for the fields two devices may edit at once (a note's body,
 * a checklist line). Diffed by words, so edits in different places both survive; when both
 * sides changed the same words, both versions are kept, the older first: nothing typed is lost.
 */
import { recordTypeSpec } from './schema';

/** The fields merged instead of overwritten: those a type declares `merged` (long text the person types, drawings stroke by stroke). */
export function isMergedTextField(type: string, field: string): boolean {
  const merged = recordTypeSpec(type)?.merged;
  return merged !== undefined && Object.hasOwn(merged, field);
}

/** Words: whitespace runs, runs of anything else but ASCII punctuation (words, accents, emoji), single punctuation marks. */
const WORDS = /\s+|[^\s!-/:-@[-`{-~]+|[!-/:-@[-`{-~]/g;
/** Lines with their line break: coarser, for texts whose words are too far apart to align. */
const LINES = /[^\n]*\n|[^\n]+/g;
/** Myers' work, in diagonal steps, and its depth (the trace is depth² integers): a fraction of a second on a phone. */
const BUDGET = 10_000_000;
const MAX_DEPTH = 2000;

interface Tokens {
  readonly text: readonly string[];
  readonly ids: Int32Array;
}

function tokenize(value: string, pattern: RegExp, vocabulary: Map<string, number>): Tokens {
  const text = value.match(pattern) ?? [];
  const ids = new Int32Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const token = text[i]!;
    let id = vocabulary.get(token);
    if (id === undefined) {
      id = vocabulary.size;
      vocabulary.set(token, id);
    }
    ids[i] = id;
  }
  return { text, ids };
}

/** Base tokens [oStart, oEnd) became side tokens [start, end). */
interface Hunk {
  readonly oStart: number;
  readonly oEnd: number;
  readonly start: number;
  readonly end: number;
  readonly side: 0 | 1;
}

/** Myers' O(ND) diff: matched index pairs, or null past the work budget (texts too different to align cheaply). */
function matches(a: Int32Array, aFrom: number, aTo: number, b: Int32Array, bFrom: number, bTo: number): [number, number][] | null {
  const n = aTo - aFrom;
  const m = bTo - bFrom;
  const max = n + m;
  const limit = Math.min(max, MAX_DEPTH, Math.max(256, Math.floor(BUDGET / (max + 1))));
  const offset = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= limit; d += 1) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[aFrom + x] === b[bFrom + y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, d, n, m, aFrom, bFrom);
    }
    trace.push(v.slice(offset - d, offset + d + 1));
  }
  return null;
}

function backtrack(trace: readonly Int32Array[], depth: number, n: number, m: number, aFrom: number, bFrom: number): [number, number][] {
  const pairs: [number, number][] = [];
  let x = n;
  let y = m;
  for (let d = depth; d > 0; d -= 1) {
    const previous = trace[d - 1]!;
    const at = (k: number) => previous[k + d - 1]!;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const previousK = down ? k + 1 : k - 1;
    const previousX = at(previousK);
    const snakeStart = down ? previousX : previousX + 1;
    while (x > snakeStart) {
      x -= 1;
      y -= 1;
      pairs.push([aFrom + x, bFrom + y]);
    }
    x = previousX;
    y = previousX - previousK;
  }
  while (x > 0 && y > 0) {
    x -= 1;
    y -= 1;
    pairs.push([aFrom + x, bFrom + y]);
  }
  return pairs.reverse();
}

/** The changes from `base` to `side`, or null when they cannot be aligned within the budget. `slide`: for a merge (below). */
function hunks(base: Int32Array, side: Int32Array, which: 0 | 1, slide = true): Hunk[] | null {
  let prefix = 0;
  while (prefix < base.length && prefix < side.length && base[prefix] === side[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < base.length - prefix && suffix < side.length - prefix && base[base.length - 1 - suffix] === side[side.length - 1 - suffix]) suffix += 1;
  const oEnd = base.length - suffix;
  const end = side.length - suffix;
  if (prefix === oEnd && prefix === end) return [];
  const pairs = matches(base, prefix, oEnd, side, prefix, end);
  if (!pairs) return null;
  const out: Hunk[] = [];
  let o = prefix;
  let s = prefix;
  for (const [x, y] of pairs) {
    if (x > o || y > s) out.push({ oStart: o, oEnd: x, start: s, end: y, side: which });
    o = x + 1;
    s = y + 1;
  }
  if (o < oEnd || s < end) out.push({ oStart: o, oEnd, start: s, end, side: which });
  // An insertion that ends with the token before it is moved a token earlier, as far as it goes:
  // « Jean[ Dupont] lundi » and « Jean [Dupont ]lundi » are one edit, and both sides place it alike.
  for (let k = 0; slide && k < out.length; k += 1) {
    const hunk = out[k]!;
    if (hunk.oStart !== hunk.oEnd) continue;
    const floor = k > 0 ? out[k - 1]! : null;
    let { oStart, start, end } = hunk;
    while (oStart > (floor?.oEnd ?? 0) && start > (floor?.end ?? 0) && base[oStart - 1] === side[end - 1]) {
      oStart -= 1;
      start -= 1;
      end -= 1;
    }
    if (oStart !== hunk.oStart) out[k] = { oStart, oEnd: oStart, start, end, side: which };
  }
  return out;
}

/** Not a space and not ASCII punctuation: a word's letter, digit, accent or emoji. */
const WORD_CHAR = /[^\s!-/:-@[-`{-~]/;

/** `outer` holds `inner` word for word, spaces aside: « 15 € » does not hold « 5 € ». */
function holds(outer: string, inner: string): boolean {
  const needle = inner.replace(/\s+/g, ' ').trim();
  if (!needle) return true;
  const hay = outer.replace(/\s+/g, ' ');
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + 1)) {
    const before = hay[at - 1];
    const after = hay[at + needle.length];
    const clean = (edge: string | undefined, end: string) => edge === undefined || !(WORD_CHAR.test(edge) && WORD_CHAR.test(end));
    if (clean(before, needle[0]!) && clean(after, needle[needle.length - 1]!)) return true;
  }
  return false;
}

/**
 * `y` already holds every change from `base` to `x`: it is `x` with edits elsewhere (a merge of
 * `x` seen again, or an edit made on top of it). Merging `x` into it again would repeat them.
 */
function incorporated(base: string, x: string, y: string): boolean {
  const vocabulary = new Map<string, number>();
  const b = tokenize(base, WORDS, vocabulary);
  const xs = tokenize(x, WORDS, vocabulary);
  const ys = tokenize(y, WORDS, vocabulary);
  const own = hunks(b.ids, xs.ids, 0);
  const onward = own ? hunks(xs.ids, ys.ids, 1) : null;
  if (!own || !onward || own.length === 0) return false;
  return own.every(change => {
    if (change.start !== change.end) {
      // What `x` wrote is left as it is, the spaces at its edges aside.
      let from = change.start;
      let to = change.end;
      while (from < to && /^\s+$/.test(xs.text[from]!)) from += 1;
      while (to > from && /^\s+$/.test(xs.text[to - 1]!)) to -= 1;
      return from === to || onward.every(edit => edit.oEnd <= from || edit.oStart >= to);
    }
    // Where `x` deleted, nothing brings back a word it removed.
    const removed = new Set(b.text.slice(change.oStart, change.oEnd).filter(token => !/^\s+$/.test(token)));
    return onward.every(edit => edit.oEnd < change.start || edit.oStart > change.start || !ys.text.slice(edit.start, edit.end).some(token => removed.has(token)));
  });
}

const isInsertion = (hunk: Hunk): boolean => hunk.oStart === hunk.oEnd;

/**
 * Both versions of a passage, the first one first. Two additions at one place follow each other
 * (a space or a line break between); two rewrites of the same words on one line are alternatives,
 * « / » between them.
 */
function keepBoth(first: string, second: string, rewrites = false): string {
  if (!first) return second;
  if (!second) return first;
  const lines = first.includes('\n') || second.includes('\n');
  if (rewrites && !lines) {
    // The spaces around the passage stay where they were.
    const before = /^\s/.test(first) ? '' : (/^\s+/.exec(second)?.[0] ?? '');
    const after = /\s$/.test(second) ? '' : (/\s+$/.exec(first)?.[0] ?? '');
    return `${before}${first.trimEnd()} / ${second.trimStart()}${after}`;
  }
  // Where two additions meet, one space between them.
  if (/[ \t]$/.test(first) && /^[ \t]/.test(second)) return first + second.replace(/^[ \t]+/, '');
  if (/\s$/.test(first) || /^\s/.test(second)) return first + second;
  return first + (lines ? '\n' : ' ') + second;
}

/** Shared words that keep two rewritten passages one (the diff anchors on « à », « le », « de »). */
const NEAR_WORDS = 3;
const PUNCTUATION = /^[!-/:-@[-`{-~]$/;
const SENTENCE_END = /[.!?\n…]/;

/**
 * `ours` and `theirs` both started from `base`. `oursFirst` orders a passage both rewrote:
 * pass true when ours is the older edit. Merged by words; by lines when the words cannot be
 * aligned; when even the lines cannot (thousands of lines rewritten), both texts are kept whole.
 */
export function mergeText(base: string, ours: string, theirs: string, oursFirst = true): string {
  if (ours === theirs || theirs === base) return ours;
  if (ours === base) return theirs;
  if (incorporated(base, ours, theirs)) return theirs;
  if (incorporated(base, theirs, ours)) return ours;
  return mergeBy(WORDS, base, ours, theirs, oursFirst, false) ?? mergeBy(LINES, base, ours, theirs, oursFirst, true) ?? (oursFirst ? `${ours}\n\n${theirs}` : `${theirs}\n\n${ours}`);
}

/** One line both sides changed: merged by words, or both versions kept. */
function mergeLine(base: string, ours: string, theirs: string, oursFirst: boolean): string {
  if (ours === theirs || theirs === base) return ours;
  if (ours === base) return theirs;
  return mergeBy(WORDS, base, ours, theirs, oursFirst, false) ?? (oursFirst ? keepBoth(ours, theirs) : keepBoth(theirs, ours));
}

/** Lines paired by index (same count on all three sides), merged one by one. */
function pairwise(base: readonly string[], ours: readonly string[], theirs: readonly string[], oursFirst: boolean): string {
  let out = '';
  for (let i = 0; i < base.length; i += 1) out += mergeLine(base[i]!, ours[i]!, theirs[i]!, oursFirst);
  return out;
}

/**
 * Lines both sides rewrote (by lines, a word fixed on every line is a whole passage changed).
 * When both kept the base's line count, merged line by line. When one side changed it, that
 * side is aligned with the base by lines: what only it touched is taken, lines both changed in
 * place are merged one by one, and both versions are kept only of lines both rewrote. When both
 * changed the count, both versions are kept.
 */
function mergeLines(base: string, ours: string, theirs: string, oursFirst: boolean): string {
  const o = base.match(LINES) ?? [];
  const a = ours.match(LINES) ?? [];
  const b = theirs.match(LINES) ?? [];
  const both = (x: string, y: string): string => (oursFirst ? keepBoth(x, y) : keepBoth(y, x));
  if (a.length === o.length && b.length === o.length) return pairwise(o, a, b, oursFirst);
  if (a.length !== o.length && b.length !== o.length) return both(ours, theirs);
  // `kept` pairs with the base by index; `moved` changed the number of lines.
  const keptIsOurs = a.length === o.length;
  const kept = keptIsOurs ? a : b;
  const moved = keptIsOurs ? b : a;
  const vocabulary = new Map<string, number>();
  const ids = (lines: readonly string[]): Int32Array => Int32Array.from(lines, line => {
    let id = vocabulary.get(line);
    if (id === undefined) vocabulary.set(line, (id = vocabulary.size));
    return id;
  });
  const changes = hunks(ids(o), ids(moved), 1);
  if (!changes) return both(ours, theirs);
  const pair = (bases: readonly string[], mine: readonly string[], other: readonly string[]): string =>
    keptIsOurs ? pairwise(bases, mine, other, oursFirst) : pairwise(bases, other, mine, oursFirst);
  let out = '';
  let i = 0;
  for (const change of changes) {
    out += kept.slice(i, change.oStart).join('');
    const bases = o.slice(change.oStart, change.oEnd);
    const mine = kept.slice(change.oStart, change.oEnd);
    const other = moved.slice(change.start, change.end);
    if (mine.every((line, k) => line === bases[k])) out += other.join('');
    else if (bases.length === other.length) out += pair(bases, mine, other);
    else out += keptIsOurs ? both(mine.join(''), other.join('')) : both(other.join(''), mine.join(''));
    i = change.oEnd;
  }
  return out + kept.slice(i).join('');
}

/** `coarse`: the tokens are lines, and a passage both sides rewrote is merged line by line (`mergeLines`). */
function mergeBy(pattern: RegExp, base: string, ours: string, theirs: string, oursFirst: boolean, coarse: boolean): string | null {
  const vocabulary = new Map<string, number>();
  const o = tokenize(base, pattern, vocabulary);
  const sides = [tokenize(ours, pattern, vocabulary), tokenize(theirs, pattern, vocabulary)] as const;
  const mine = hunks(o.ids, sides[0].ids, 0);
  const others = mine ? hunks(o.ids, sides[1].ids, 1) : null;
  if (!mine || !others) return null;
  const all = [...mine, ...others].sort((p, q) => p.oStart - q.oStart || p.oEnd - q.oEnd || p.side - q.side);
  const baseText = (from: number, to: number): string => o.text.slice(from, to).join('');
  const sideText = (group: readonly Hunk[], which: 0 | 1, from: number, to: number): string => {
    let text = '';
    let at = from;
    for (const hunk of group) {
      if (hunk.side !== which) continue;
      text += baseText(at, hunk.oStart) + sides[which].text.slice(hunk.start, hunk.end).join('');
      at = hunk.oEnd;
    }
    return text + baseText(at, to);
  };

  // Changes grouped where they overlap: a change starting inside a group, or inserting where it also inserts.
  type Group = { start: number; end: number; hunks: Hunk[] };
  const groups: Group[] = [];
  for (let i = 0; i < all.length; ) {
    const group = { start: all[i]!.oStart, end: all[i]!.oEnd, hunks: [all[i]!] };
    i += 1;
    while (i < all.length && (all[i]!.oStart < group.end || (isInsertion(all[i]!) && group.hunks.some(h => isInsertion(h) && h.oStart === all[i]!.oStart)))) {
      group.end = Math.max(group.end, all[i]!.oEnd);
      group.hunks.push(all[i]!);
      i += 1;
    }
    groups.push(group);
  }
  const conflict = (group: { hunks: Hunk[] }): boolean => group.hunks.some(h => h.side === 0) && group.hunks.some(h => h.side === 1);
  // Both sides rewrote these words, each its own way: two versions to keep.
  const disputed = (group: Group): boolean => {
    if (!conflict(group)) return false;
    const a = sideText(group.hunks, 0, group.start, group.end);
    const b = sideText(group.hunks, 1, group.start, group.end);
    return !holds(a, b) && !holds(b, a);
  };
  // No line break or end of sentence between, and a few words at most.
  const near = (from: number, to: number): boolean => {
    let words = 0;
    for (let k = from; k < to; k += 1) {
      const token = o.text[k]!;
      if (SENTENCE_END.test(token)) return false;
      if (!/^\s+$/.test(token) && !PUNCTUATION.test(token) && (words += 1) > NEAR_WORDS) return false;
    }
    return true;
  };
  // Disputed words a few shared words apart in one sentence are one passage rewritten twice:
  // each version is kept whole, not interleaved word by word with the other.
  const merged: Group[] = [];
  for (let i = 0; i < groups.length; ) {
    let j = i;
    while (!coarse && j + 1 < groups.length && near(groups[j]!.end, groups[j + 1]!.start)) j += 1;
    const cluster = groups.slice(i, j + 1);
    const first = cluster.findIndex(disputed);
    const last = cluster.length - 1 - [...cluster].reverse().findIndex(disputed);
    if (first === -1 || first === last) merged.push(...cluster);
    else {
      const rewritten = cluster.slice(first, last + 1);
      merged.push(...cluster.slice(0, first), { start: rewritten[0]!.start, end: rewritten[rewritten.length - 1]!.end, hunks: rewritten.flatMap(g => g.hunks) }, ...cluster.slice(last + 1));
    }
    i = j + 1;
  }

  let out = '';
  let at = 0;
  let previousEnd = -1;
  for (const { start, end, hunks: group } of merged) {
    out += baseText(at, start);
    let piece: string;
    if (conflict({ hunks: group })) {
      const a = sideText(group, 0, start, end);
      const b = sideText(group, 1, start, end);
      // A version that already holds the other (a merge seen again, a word typed further) is kept alone.
      if (holds(b, a)) piece = b;
      else if (holds(a, b)) piece = a;
      else if (coarse) piece = mergeLines(baseText(start, end), a, b, oursFirst);
      else piece = oursFirst ? keepBoth(a, b, end > start) : keepBoth(b, a, end > start);
    } else {
      piece = sideText(group, group.some(h => h.side === 0) ? 0 : 1, start, end);
    }
    // Changes that meet with nothing of the base between never glue their words: the base's break before them stands between.
    if (!coarse && previousEnd === start && piece && WORD_CHAR.test(out.slice(-1)) && WORD_CHAR.test(piece[0]!)) out += (o.text[start - 1] ?? '').includes('\n') ? '\n' : ' ';
    out += piece;
    previousEnd = end;
    at = end;
  }
  return out + baseText(at, o.text.length);
}

/**
 * Where a caret at `at` in `before` belongs in `after` (the same field after an edit from
 * elsewhere): moved by what changed before it, at the end of what replaced it if it sat in text
 * that changed, kept before text inserted right at it.
 */
export function mapCaret(before: string, after: string, at: number): number {
  if (before === after) return at;
  const vocabulary = new Map<string, number>();
  const o = tokenize(before, WORDS, vocabulary);
  const n = tokenize(after, WORDS, vocabulary);
  // A caret keeps the diff's own placement: text inserted right at it goes after it.
  const changes = hunks(o.ids, n.ids, 1, false);
  if (!changes) return Math.min(at, after.length);
  const offsets = (tokens: readonly string[]): number[] => {
    const out = [0];
    for (const token of tokens) out.push(out[out.length - 1]! + token.length);
    return out;
  };
  const oAt = offsets(o.text);
  const nAt = offsets(n.text);
  let shift = 0;
  for (const change of changes) {
    const from = oAt[change.oStart]!;
    const to = oAt[change.oEnd]!;
    if (at < from || (at === from && change.oStart === change.oEnd)) break;
    if (at < to) return nAt[change.end]!;
    shift = nAt[change.end]! - to;
  }
  return Math.min(after.length, Math.max(0, at + shift));
}

/** `mergeText` for a field, or the type's own merge (a drawing's strokes): a merge longer than the field may hold keeps the newer text whole instead of cutting it. */
export function mergeField(type: string, field: string, base: string, ours: string, theirs: string, oursFirst: boolean): string {
  const merged = recordTypeSpec(type)?.merged;
  const spec = merged && Object.hasOwn(merged, field) ? merged[field] : undefined;
  const result = spec?.merge ? spec.merge(base, ours, theirs, oursFirst) : mergeText(base, ours, theirs, oursFirst);
  return spec !== undefined && result.length > spec.limit ? (oursFirst ? theirs : ours) : result;
}
