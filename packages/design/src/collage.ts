/**
 * The empty-state pictures: a few cut-outs pinned around a sheet, as data so the phone and the
 * web draw the same collage. Pieces draw in order, back to front, on a 240 by 150 board; an
 * emblem's box is its 100 grid scaled to `size`, turned `rotate` degrees about its centre.
 */
import type { LineColor } from './colors';
import type { CollectionEmblem } from './emblems';

/** A gouache, or the matcha of the leaf role. */
export type CollageInk = LineColor | 'leaf';

export type CollagePiece =
  | {
      readonly kind: 'emblem';
      readonly emblem: CollectionEmblem;
      readonly ink: CollageInk;
      readonly x: number;
      readonly y: number;
      readonly size: number;
      readonly rotate: number;
    }
  | {
      /** A note: a paper sheet with a few ink lines, the first one a title. */
      readonly kind: 'sheet';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly rotate: number;
      readonly lines: number;
      /** A ticked box before the lines: a list. */
      readonly check?: boolean;
    };

export type CollageScene = 'notes' | 'reminders' | 'archive' | 'trash' | 'label' | 'welcome';

export const COLLAGE_SIZE = { width: 240, height: 150 } as const;

const NOTES: readonly CollagePiece[] = [
  { kind: 'emblem', emblem: 'feuille', ink: 'leaf', x: 4, y: 10, size: 106, rotate: -16 },
  { kind: 'emblem', emblem: 'vague', ink: 'blue', x: 138, y: 70, size: 86, rotate: -4 },
  { kind: 'sheet', x: 80, y: 24, width: 90, height: 104, rotate: 5, lines: 3, check: true },
  { kind: 'emblem', emblem: 'etoile', ink: 'red', x: 174, y: 4, size: 52, rotate: 14 },
  { kind: 'emblem', emblem: 'soleil', ink: 'yellow', x: 22, y: 100, size: 40, rotate: 0 },
];

export const SCENES: Record<CollageScene, readonly CollagePiece[]> = {
  notes: NOTES,
  reminders: [
    { kind: 'emblem', emblem: 'lune', ink: 'yellow', x: 18, y: 14, size: 96, rotate: -10 },
    { kind: 'emblem', emblem: 'nuage', ink: 'lilac', x: 146, y: 86, size: 74, rotate: 0 },
    { kind: 'sheet', x: 92, y: 28, width: 88, height: 100, rotate: -4, lines: 2 },
    { kind: 'emblem', emblem: 'etoile', ink: 'sky', x: 178, y: 10, size: 34, rotate: 10 },
    { kind: 'emblem', emblem: 'etoile', ink: 'yellow', x: 204, y: 52, size: 22, rotate: -12 },
  ],
  archive: [
    { kind: 'emblem', emblem: 'galet', ink: 'green', x: 16, y: 70, size: 66, rotate: 0 },
    { kind: 'sheet', x: 70, y: 40, width: 88, height: 96, rotate: -8, lines: 2 },
    { kind: 'sheet', x: 90, y: 26, width: 88, height: 100, rotate: 4, lines: 3 },
    { kind: 'emblem', emblem: 'feuille', ink: 'leaf', x: 170, y: 28, size: 72, rotate: 22 },
  ],
  trash: [
    { kind: 'emblem', emblem: 'bac', ink: 'grey', x: 26, y: 26, size: 72, rotate: -12 },
    { kind: 'emblem', emblem: 'bac', ink: 'grey', x: 146, y: 64, size: 62, rotate: 18 },
    { kind: 'sheet', x: 84, y: 30, width: 80, height: 94, rotate: -6, lines: 2 },
    { kind: 'emblem', emblem: 'etoile', ink: 'red', x: 186, y: 12, size: 32, rotate: 0 },
  ],
  label: [
    { kind: 'emblem', emblem: 'trefle', ink: 'pink', x: 18, y: 20, size: 88, rotate: -10 },
    { kind: 'sheet', x: 92, y: 26, width: 90, height: 102, rotate: 4, lines: 3 },
    { kind: 'emblem', emblem: 'goutte', ink: 'sky', x: 178, y: 78, size: 52, rotate: 12 },
  ],
  welcome: NOTES,
};

// ── laying the collage down ────────────────────────────────────────────────

/** Each piece is laid this long after the one under it (drawing order), each in `COLLAGE_LAY` ms. */
export const COLLAGE_STAGGER = 70;
export const COLLAGE_LAY = 420;

/** A piece's box on the board, unturned: a sheet's own, an emblem's square. */
export function pieceBox(piece: CollagePiece): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return piece.kind === 'sheet' ? { x: piece.x, y: piece.y, width: piece.width, height: piece.height } : { x: piece.x, y: piece.y, width: piece.size, height: piece.size };
}

/** Where a piece starts as it is laid: offset (board units), turned a little more, a touch smaller, and when. */
export interface PieceEntrance {
  readonly dx: number;
  readonly dy: number;
  /** Degrees added to its resting turn at the start. */
  readonly turn: number;
  /** Its scale at the start: never under 0.9, nothing grows from nothing. */
  readonly scale: number;
  readonly delay: number;
}

/**
 * How each piece of a scene is laid down, as a hand lays paper on a board: the cut-outs drift in
 * from just outside their place and turn into it; a sheet slides up a little from below and
 * settles from a steeper angle. In drawing order, the back first.
 */
export function collageEntrances(scene: CollageScene): PieceEntrance[] {
  const centre = { x: COLLAGE_SIZE.width / 2, y: COLLAGE_SIZE.height / 2 };
  return SCENES[scene].map((piece, index) => {
    const box = pieceBox(piece);
    const away = { x: box.x + box.width / 2 - centre.x, y: box.y + box.height / 2 - centre.y };
    const length = Math.hypot(away.x, away.y) || 1;
    const side = index % 2 === 0 ? -1 : 1;
    if (piece.kind === 'sheet') return { dx: (away.x / length) * 6, dy: 14, turn: side * 7, scale: 0.97, delay: index * COLLAGE_STAGGER };
    return { dx: (away.x / length) * 10, dy: (away.y / length) * 10, turn: side * 12, scale: 0.92, delay: index * COLLAGE_STAGGER };
  });
}
