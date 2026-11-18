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
      /** Its ink lines; none, a sheet turned over on its blank back. */
      readonly lines: number;
      /** A ticked box before the lines: a list. */
      readonly check?: boolean;
    }
  | {
      /**
       * Wallet's: a card the shape of the thing (ID-1, 85.6 by 54, its height from its width), or a
       * passport upright. A loyalty card in its pigment's wash with a band and a barcode; an identity
       * card on paper with a portrait in the pigment; a passport in the pigment with its globe.
       */
      readonly kind: 'card';
      readonly face: 'loyalty' | 'id' | 'passport';
      readonly ink: LineColor;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly rotate: number;
    };

export type CollageScene = 'notes' | 'reminders' | 'archive' | 'trash' | 'label' | 'welcome' | 'search' | 'cards' | 'papers' | 'documents';

/** What a card's shapes are painted with, each client mapping it to its theme: the paper, its edge, the inks, the pigment and its wash. */
export type CollagePaint = 'paper' | 'outline' | 'ink' | 'inkMuted' | 'fill' | 'tint' | 'on';

export type CollageShape =
  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rx: number; readonly fill?: CollagePaint; readonly stroke?: CollagePaint; readonly strokeWidth?: number }
  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number; readonly fill?: CollagePaint; readonly stroke?: CollagePaint; readonly strokeWidth?: number };

type CardPiece = Extract<CollagePiece, { kind: 'card' }>;

/** A card's height: ID-1's ratio, or a passport's (125 by 88, upright). */
export const cardHeight = (piece: Pick<CardPiece, 'face' | 'width'>): number => (piece.face === 'passport' ? piece.width * (125 / 88) : piece.width * (54 / 85.6));

/** A card's shapes, back to front, unturned: both clients draw them as they are. */
export function cardShapes(piece: CardPiece): CollageShape[] {
  const { x, y, width: w, face } = piece;
  const h = cardHeight(piece);
  if (face === 'passport') {
    const r = w * 0.24;
    return [
      { kind: 'rect', x, y, width: w, height: h, rx: 7, fill: 'fill', stroke: 'outline', strokeWidth: 1.5 },
      { kind: 'circle', cx: x + w / 2, cy: y + h * 0.4, r, stroke: 'on', strokeWidth: 3 },
      { kind: 'rect', x: x + w / 2 - 1.25, y: y + h * 0.4 - r, width: 2.5, height: r * 2, rx: 1.25, fill: 'on' },
      { kind: 'rect', x: x + w / 2 - r, y: y + h * 0.4 - 1.25, width: r * 2, height: 2.5, rx: 1.25, fill: 'on' },
      { kind: 'circle', cx: x + w / 2, cy: y + h * 0.4, r: r * 0.45, stroke: 'on', strokeWidth: 2 },
      { kind: 'rect', x: x + w * 0.24, y: y + h * 0.74, width: w * 0.52, height: 5, rx: 2.5, fill: 'on' },
    ];
  }
  if (face === 'id') {
    const head = h * 0.13;
    return [
      { kind: 'rect', x, y, width: w, height: h, rx: 9, fill: 'paper', stroke: 'outline', strokeWidth: 1.5 },
      { kind: 'rect', x: x + w * 0.08, y: y + h * 0.2, width: w * 0.3, height: h * 0.6, rx: 6, fill: 'tint' },
      { kind: 'circle', cx: x + w * 0.23, cy: y + h * 0.4, r: head, fill: 'fill' },
      { kind: 'rect', x: x + w * 0.13, y: y + h * 0.56, width: w * 0.2, height: h * 0.2, rx: 7, fill: 'fill' },
      { kind: 'rect', x: x + w * 0.46, y: y + h * 0.26, width: w * 0.42, height: 6, rx: 3, fill: 'ink' },
      { kind: 'rect', x: x + w * 0.46, y: y + h * 0.44, width: w * 0.34, height: 5, rx: 2.5, fill: 'inkMuted' },
      { kind: 'rect', x: x + w * 0.46, y: y + h * 0.6, width: w * 0.38, height: 5, rx: 2.5, fill: 'inkMuted' },
    ];
  }
  const bars = [3, 1.5, 1.5, 3, 1.5, 3, 1.5, 1.5, 3, 1.5];
  let at = x + w * 0.5;
  const barcode: CollageShape[] = bars.map(width => {
    const bar: CollageShape = { kind: 'rect', x: at, y: y + h * 0.58, width, height: h * 0.26, rx: 0.5, fill: 'ink' };
    at += width + 2;
    return bar;
  });
  return [
    { kind: 'rect', x, y, width: w, height: h, rx: 9, fill: 'tint', stroke: 'outline', strokeWidth: 1.5 },
    { kind: 'rect', x: x + w * 0.09, y: y + h * 0.18, width: w * 0.28, height: h * 0.2, rx: 4, fill: 'fill' },
    { kind: 'rect', x: x + w * 0.09, y: y + h * 0.62, width: w * 0.3, height: 5, rx: 2.5, fill: 'inkMuted' },
    ...barcode,
  ];
}

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
  /** Wallet's cards: three loyalty cards fanned as in a hand, a leaf behind, a star and a sun pinned around. */
  cards: [
    { kind: 'emblem', emblem: 'feuille', ink: 'leaf', x: 0, y: 14, size: 90, rotate: -18 },
    { kind: 'card', face: 'loyalty', ink: 'orange', x: 40, y: 64, width: 98, rotate: -16 },
    { kind: 'card', face: 'loyalty', ink: 'sky', x: 72, y: 44, width: 98, rotate: -3 },
    { kind: 'card', face: 'loyalty', ink: 'green', x: 106, y: 36, width: 98, rotate: 11 },
    { kind: 'emblem', emblem: 'etoile', ink: 'red', x: 196, y: 2, size: 34, rotate: 12 },
    { kind: 'emblem', emblem: 'soleil', ink: 'yellow', x: 196, y: 104, size: 38, rotate: 0 },
  ],
  /** Wallet's papers: a passport upright beside an identity card, a cloud and a pebble around. */
  papers: [
    { kind: 'emblem', emblem: 'nuage', ink: 'lilac', x: 168, y: 0, size: 64, rotate: 6 },
    { kind: 'card', face: 'passport', ink: 'blue', x: 34, y: 18, width: 66, rotate: -9 },
    { kind: 'card', face: 'id', ink: 'pink', x: 96, y: 56, width: 108, rotate: 6 },
    { kind: 'emblem', emblem: 'galet', ink: 'green', x: 4, y: 96, size: 46, rotate: 0 },
    { kind: 'emblem', emblem: 'etoile', ink: 'yellow', x: 116, y: 12, size: 26, rotate: -10 },
  ],
  /** Wallet's documents: sheets in a little pile, a leaf and a drop pinned beside them. */
  documents: [
    { kind: 'emblem', emblem: 'goutte', ink: 'sky', x: 18, y: 86, size: 46, rotate: -8 },
    { kind: 'sheet', x: 54, y: 36, width: 82, height: 96, rotate: -10, lines: 2 },
    { kind: 'sheet', x: 86, y: 22, width: 86, height: 104, rotate: 4, lines: 3 },
    { kind: 'emblem', emblem: 'feuille', ink: 'leaf', x: 166, y: 34, size: 70, rotate: 22 },
    { kind: 'emblem', emblem: 'etoile', ink: 'orange', x: 22, y: 10, size: 34, rotate: -8 },
  ],
  /**
   * An app's search with nothing found: sheets fanned as if leafed through, the front one turned
   * over on its blank back, a pebble's ring for the glass that looked.
   */
  search: [
    { kind: 'emblem', emblem: 'nuage', ink: 'lilac', x: 0, y: 2, size: 72, rotate: -8 },
    { kind: 'sheet', x: 26, y: 40, width: 76, height: 90, rotate: -17, lines: 2 },
    { kind: 'sheet', x: 70, y: 26, width: 80, height: 98, rotate: -4, lines: 3 },
    { kind: 'sheet', x: 120, y: 32, width: 76, height: 92, rotate: 11, lines: 0 },
    { kind: 'emblem', emblem: 'galet', ink: 'sky', x: 170, y: 88, size: 54, rotate: -6 },
    { kind: 'emblem', emblem: 'etoile', ink: 'yellow', x: 194, y: 6, size: 30, rotate: 12 },
  ],
};

// ── laying the collage down ────────────────────────────────────────────────

/** Each piece is laid this long after the one under it (drawing order), each in `COLLAGE_LAY` ms. */
export const COLLAGE_STAGGER = 70;
export const COLLAGE_LAY = 420;

/** How a cut-out is laid: from this far outside its place (board units), turned this many degrees more, from this scale. */
export const CUTOUT_LAY = { drift: 10, turn: 12, scale: 0.92 } as const;

/** A piece's box on the board, unturned: a sheet's own, an emblem's square. */
export function pieceBox(piece: CollagePiece): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  if (piece.kind === 'sheet') return { x: piece.x, y: piece.y, width: piece.width, height: piece.height };
  if (piece.kind === 'card') return { x: piece.x, y: piece.y, width: piece.width, height: cardHeight(piece) };
  return { x: piece.x, y: piece.y, width: piece.size, height: piece.size };
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
    if (piece.kind === 'sheet' || piece.kind === 'card') return { dx: (away.x / length) * 6, dy: 14, turn: side * 7, scale: 0.97, delay: index * COLLAGE_STAGGER };
    return { dx: (away.x / length) * CUTOUT_LAY.drift, dy: (away.y / length) * CUTOUT_LAY.drift, turn: side * CUTOUT_LAY.turn, scale: CUTOUT_LAY.scale, delay: index * COLLAGE_STAGGER };
  });
}

/**
 * A collection's ghost (the washed emblem behind its page's head) is laid as a cut-out, once each
 * time the page opens: from just beyond the corner it leaves by (up and to the right, in pixels),
 * upright, turning into its slant as it fades up to its wash, `COLLAGE_LAY` long.
 */
export const GHOST_ENTRANCE: PieceEntrance = {
  dx: CUTOUT_LAY.drift * Math.SQRT1_2,
  dy: -CUTOUT_LAY.drift * Math.SQRT1_2,
  turn: CUTOUT_LAY.turn,
  scale: CUTOUT_LAY.scale,
  delay: 0,
};
