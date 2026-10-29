/**
 * The containers' outlines: a sheet with the continuous corner (`shapes.ts`) at its kind's radius,
 * the same at every size and for every item, so a hundred cards read as one calm wall. A sheet
 * standing on a screen edge keeps those corners square (the bottom sheet, a side sheet).
 *
 * The web clips a container to `outlinePath` and draws its edge along it; the phone draws the same
 * corners in its native view (`Organic` with `outline`).
 */
import { RADII, SHAPES, squirclePath, type Corners } from './shapes';

const R = RADII;

/** Each kind of container's corners. */
export const OUTLINES = {
  /** A note on the wall, a collection's tile. */
  card: SHAPES.card,
  /** A settings group, a notice, a facts table. */
  panel: SHAPES.panel,
  /** The info card: a panel whose corner by its pointer is tight, so the pointer stands on a straight edge. */
  bubble: [R.panel, R.detail, R.panel, R.panel],
  /** A collection's link row (on the web). */
  row: SHAPES.card,
  /** A confirmation, a centred sheet. */
  dialog: SHAPES.dialog,
  /** A menu or a popover. */
  menu: SHAPES.menu,
  /** The bottom sheet: its two top corners; the sides and foot run off the screen. */
  sheet: SHAPES.sheet,
  /** A sheet standing on the right edge (a link's details on a wide screen): its two open corners. */
  sideSheet: [R.dialog, 0, 0, R.dialog],
  /** A picture's frame. */
  frame: SHAPES.frame,
} as const satisfies Record<string, Corners>;

export type OutlineKind = keyof typeof OUTLINES;

/** A container's outline for its box as an SVG path, drawn `offset` in (a stroke's or a clip's own inset; negative: out, for a ring). */
export function outlinePath(kind: OutlineKind, width: number, height: number, offset = 0): string {
  return squirclePath(width, height, OUTLINES[kind], offset);
}
