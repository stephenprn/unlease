/**
 * A drawing: a note of kind `drawing`, or a page's `drawing` block. Its strokes live in the record's
 * `drawing` field as text, one stroke per line (`notes/services/drawing`), so two devices drawing at
 * once both keep their strokes: the field merges stroke by stroke, never as a whole.
 *
 * Coordinates are units of a sheet `DRAWING_WIDTH` wide, whatever the screen, so a drawing made on
 * the phone keeps its proportions on the web; the sheet is as tall as what is drawn on it.
 */
import { LINE_COLOR_NAMES, type LineColor } from '@unlease/design/colors';
import { localized, t, tx } from '@unlease/core/i18n';

/** The sheet's width in drawing units. */
export const DRAWING_WIDTH = 1000;
/** A new drawing's sheet: 4:3, before anything is drawn lower down. */
export const DRAWING_MIN_HEIGHT = 750;

export const DRAWING_TOOLS = ['pen', 'marker', 'highlighter'] as const;

/** What a stroke was drawn with (the eraser takes strokes away and is never stored). */
export type DrawingTool = (typeof DRAWING_TOOLS)[number];

export const DRAWING_TOOL_NAMES: Record<DrawingTool | 'eraser', string> = localized({
  pen: tx('Stylo'),
  marker: tx('Feutre'),
  highlighter: tx('Surligneur'),
  eraser: tx('Gomme'),
});

/** Thin, medium, thick. */
export type DrawingSize = 0 | 1 | 2;

export const DRAWING_SIZES: readonly DrawingSize[] = [0, 1, 2];

/** Each size's name, in French: translate it where it is shown (`t(DRAWING_SIZE_NAMES[size])`). */
export const DRAWING_SIZE_NAMES: readonly [string, string, string] = [tx('Fin'), tx('Moyen'), tx('Épais')];

/** Each tool's three widths, in drawing units (a thousandth of the sheet's width). */
export const STROKE_WIDTHS: Readonly<Record<DrawingTool, readonly [number, number, number]>> = {
  pen: [3, 5.5, 9],
  marker: [10, 16, 24],
  highlighter: [24, 36, 52],
};

/** A highlighter lies over what it marks, see-through. */
export const HIGHLIGHTER_OPACITY = 0.38;

/** How far the eraser reaches around its point, in drawing units, and never less than this on screen. */
export const ERASER_RADIUS = 14;
export const ERASER_MIN_PX = 10;

/** The inks a stroke can take: the writing ink (light at night), then pigments. Stored as keys: an unknown one draws in ink. */
export const DRAWING_INKS = ['ink', 'red', 'orange', 'yellow', 'green', 'sky', 'blue', 'violet', 'pink', 'brown'] as const;

export type DrawingInk = 'ink' | LineColor;

export const INK_NAME = tx('Encre');

/** An ink's name in the interface's language, as a swatch's label says it. */
export function drawingInkName(ink: DrawingInk): string {
  return ink === 'ink' ? t(INK_NAME) : LINE_COLOR_NAMES[ink];
}

export interface Stroke {
  /** Sorts by when it was drawn (`newStrokeId`): the order strokes lie in, the last on top. */
  readonly id: string;
  readonly tool: DrawingTool;
  readonly size: DrawingSize;
  /** `ink` or a pigment key. */
  readonly ink: DrawingInk;
  /** x, y, x, y… in drawing units, whole numbers. */
  readonly points: readonly number[];
}

/** The most a drawing may hold (the schema refuses a longer field). */
export const DRAWING_LIMITS = { chars: 300_000, points: 4000 } as const;
