/**
 * The fourteen pigments: a collection's emblem, a label's tag and a note's wash. A note may
 * also wear a gradient instead, and a paper (dots, grid, lines) under either.
 * A stored colour is a key, never a hex, and keys sync: every list here is append-only.
 */
import { localized, tx } from '@unlease/core/i18n';

export const LINE_COLORS = [
  'yellow',
  'orange',
  'red',
  'pink',
  'magenta',
  'lilac',
  'violet',
  'blue',
  'sky',
  'green',
  'olive',
  'ochre',
  'brown',
  'grey',
] as const;

export type LineColor = (typeof LINE_COLORS)[number];

/** habits-garden's pigments, named for what they now are (the keys stay). */
export const LINE_COLOR_NAMES: Record<LineColor, string> = localized({
  yellow: tx('Saffron'),
  orange: tx('Burnt orange'),
  red: tx('Red'),
  pink: tx('Raspberry'),
  magenta: tx('Burgundy'),
  lilac: tx('Lavender'),
  violet: tx('Violet'),
  blue: tx('Blue'),
  sky: tx('Teal'),
  green: tx('Green'),
  olive: tx('Olive'),
  ochre: tx('Ochre'),
  brown: tx('Brown'),
  grey: tx('Sage'),
});

export function isLineColor(value: unknown): value is LineColor {
  return typeof value === 'string' && (LINE_COLORS as readonly string[]).includes(value);
}

/** Washes a note (never a collection or a label) can wear instead of a pigment. */
export const NOTE_GRADIENTS = ['aube', 'lagon', 'matcha', 'abricot', 'lavande', 'nacre', 'sousbois', 'terre'] as const;

export type NoteGradient = (typeof NOTE_GRADIENTS)[number];

export const NOTE_GRADIENT_NAMES: Record<NoteGradient, string> = localized({
  aube: tx('Dawn'),
  lagon: tx('Lagoon'),
  matcha: tx('Matcha latte'),
  abricot: tx('Apricot'),
  lavande: tx('Lavender mist'),
  nacre: tx('Mother-of-pearl'),
  sousbois: tx('Undergrowth'),
  terre: tx('Terracotta'),
});

export function isNoteGradient(value: unknown): value is NoteGradient {
  return typeof value === 'string' && (NOTE_GRADIENTS as readonly string[]).includes(value);
}

/** A note's colour: a pigment's wash or a gradient. */
export type NoteColor = LineColor | NoteGradient;

export function isNoteColor(value: unknown): value is NoteColor {
  return isLineColor(value) || isNoteGradient(value);
}

/** The pigment of a colour, or null for a gradient (a collection never wears one). */
export function asLineColor(value: NoteColor | null): LineColor | null {
  return isLineColor(value) ? value : null;
}

/** The paper under a note's colour: three in its ink, then four in a pigment's. */
export const NOTE_PATTERNS = ['dots', 'grid', 'lines', 'seyes', 'millimetre', 'iso', 'speckle'] as const;

export type NotePattern = (typeof NOTE_PATTERNS)[number];

export const NOTE_PATTERN_NAMES: Record<NotePattern, string> = localized({
  dots: tx('Dotted'),
  grid: tx('Squared'),
  lines: tx('Ruled'),
  seyes: tx('Seyès'),
  millimetre: tx('Graph paper'),
  iso: tx('Isometric'),
  speckle: tx('Speckled'),
});

/** Papers ruled under the text they rule (the editor lays them on each block of text, aligned on its lines). */
export function isRuledPattern(pattern: NotePattern | null): boolean {
  return pattern === 'lines' || pattern === 'seyes';
}

export function isNotePattern(value: unknown): value is NotePattern {
  return typeof value === 'string' && (NOTE_PATTERNS as readonly string[]).includes(value);
}

/** The first unused colour, in palette order. Grey is skipped: it belongs to "Non classé". */
export function nextLineColor(used: readonly (LineColor | null)[]): LineColor {
  const taken = new Set(used);
  const free = LINE_COLORS.find(color => color !== 'grey' && !taken.has(color));
  if (free) return free;
  const count = used.filter(color => color !== 'grey').length;
  return LINE_COLORS[count % (LINE_COLORS.length - 1)] ?? 'blue';
}
