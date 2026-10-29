/**
 * The board's masonry wall: every card is exactly as tall as what it shows, computed from the
 * card's anatomy and Signika's own widths (`textWrap`), never measured, so the wall virtualises
 * without a layout pass. Both clients draw cards to these numbers.
 */
import type { NoteKind } from '../models/entities';
import { wrapLines, wrapRunLines, type WeightedRun } from '@unlease/design/textWrap';

export interface WallMetrics {
  readonly columnWidth: number;
  readonly gap: number;
  /** Inside a card, on every side. */
  readonly padding: number;
  /** The card's edge when it is a layout border (the phone's 1dp hairline); 0 on the web. */
  readonly border: number;
  /** Card text: Signika 15 on 21, both following the system's font size. */
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly checkRow: number;
  /** A collection card's count ("12 liens · 412 €"). */
  readonly metaLine: number;
  /** Labels or a reminder: a 24 chip with 4 above and 12 below. */
  readonly footer: number;
  /** Where a text note's body stops; checklists and collections are bounded by their rows. */
  readonly maxHeight: number;
}

/** What a card shows, reduced to what decides its height. */
export interface CardShape {
  readonly id: string;
  readonly kind: NoteKind;
  /** Trimmed, as the card shows it. */
  readonly title: string;
  /** A text note's body, trailing blanks dropped; empty otherwise. */
  readonly body: string;
  /** A formatted body's lines in their weights (`cardParagraphs`), which `body` then only spells; null for a plain one. */
  readonly paragraphs: readonly (readonly WeightedRun[])[] | null;
  /** A drawing note's sheet, height over width (`drawingRatio`); null for any other note or a drawing with nothing drawn. */
  readonly drawing: number | null;
  /** Open items with something written in them: an empty one is left off the card. */
  readonly openChecks: number;
  /** A "+ N cochés" line under the open checks. */
  readonly hasCheckedSummary: boolean;
  readonly hasPhoto: boolean;
  readonly hasThumbs: boolean;
  /** Labels or a reminder: a footer row. */
  readonly hasFooter: boolean;
}

export interface CardLayout {
  readonly height: number;
  /** Lines the title is cut to. */
  readonly title: number;
  /** Lines a text note's body is cut to. */
  readonly body: number;
}

export const MAX_CHECK_ROWS = 6;
export const MAX_TITLE_LINES = 3;
export const MAX_BODY_LINES = 16;
export const PHOTO_RATIO = 0.62;
/** A drawing taller than this (height over width) shows its top on a card. */
export const MAX_DRAWING_RATIO = 1.25;
export const THUMBS_PER_STRIP = 4;
/** A collection card's pictures stop growing here: on a wide card (the list layout) they stay thumbnails. */
export const MAX_THUMB = 64;
/** Under this text width a footer holding a reminder shows its labels as tags alone, their names in their tooltip. */
export const FOOTER_NAMES_MIN_WIDTH = 200;

/** A collection card: its emblem on its stone (the brand's pebble in its wash), the name beside it, then pictures and count under them. */
export const COLLECTION_CARD = {
  /** The stone, and the emblem lying on it. */
  stoneWidth: 44,
  stoneHeight: 40,
  emblem: 26,
  emblemGap: 10,
  titleLines: 2,
  /** Between the name and what follows. */
  summaryGap: 12,
  thumbGap: 4,
  /** Between the pictures and the count. */
  stripGap: 8,
} as const;

/** What a card shows of a body: blank lines at its end would only hold paper. */
export function cardBody(body: string): string {
  return body.slice(0, 1200).trimEnd();
}

/** The text box inside a card. */
export function cardInnerWidth(metrics: WallMetrics): number {
  return metrics.columnWidth - metrics.border * 2 - metrics.padding * 2;
}

export function photoHeight(metrics: WallMetrics): number {
  return Math.round(metrics.columnWidth * PHOTO_RATIO);
}

/** A drawing at the card's top, edge to edge as a photo is, cut under `MAX_DRAWING_RATIO`. */
export function drawingCardHeight(metrics: WallMetrics, ratio: number): number {
  return Math.round(metrics.columnWidth * Math.min(ratio, MAX_DRAWING_RATIO));
}

export function thumbSize(metrics: WallMetrics): number {
  return Math.min(MAX_THUMB, Math.floor((cardInnerWidth(metrics) - (THUMBS_PER_STRIP - 1) * COLLECTION_CARD.thumbGap) / THUMBS_PER_STRIP));
}

/** Whether a card's footer has room for its labels' names beside a reminder chip (a narrow card shows the tags alone). */
export function footerShowsLabelNames(metrics: WallMetrics, hasReminder: boolean): boolean {
  return !hasReminder || cardInnerWidth(metrics) >= FOOTER_NAMES_MIN_WIDTH;
}

/** A card's height and the lines its title and body are cut to. */
export function layoutCard(shape: CardShape, metrics: WallMetrics): CardLayout {
  const inner = cardInnerWidth(metrics);
  const { fontSize, lineHeight, padding } = metrics;
  let height = metrics.border * 2 + (shape.hasFooter ? metrics.footer : 0);

  if (shape.kind === 'links') {
    const c = COLLECTION_CARD;
    const title = Math.min(c.titleLines, wrapLines(shape.title, inner - c.stoneWidth - c.emblemGap, fontSize, 'bold'));
    height += padding + Math.max(c.stoneHeight, title * lineHeight) + c.summaryGap;
    if (shape.hasThumbs) height += thumbSize(metrics) + c.stripGap;
    height += metrics.metaLine + padding;
    return { height: Math.ceil(height), title, body: 0 };
  }

  if (shape.hasPhoto) height += photoHeight(metrics);
  if (shape.drawing !== null) height += drawingCardHeight(metrics, shape.drawing);
  const title = Math.min(MAX_TITLE_LINES, wrapLines(shape.title, inner, fontSize, 'bold'));
  let text = title * lineHeight;
  if (shape.kind === 'checklist') text += (Math.min(MAX_CHECK_ROWS, shape.openChecks) + (shape.hasCheckedSummary ? 1 : 0)) * metrics.checkRow;
  let body = 0;
  if (shape.kind === 'text' && shape.body) {
    const room = Math.floor((metrics.maxHeight - height - padding * 2 - text) / lineHeight);
    const lines = shape.paragraphs ? wrapRunLines(shape.paragraphs, inner, fontSize, MAX_BODY_LINES) : wrapLines(shape.body, inner, fontSize, 'regular', MAX_BODY_LINES);
    body = Math.max(0, Math.min(room, lines));
    text += body * lineHeight;
  }
  // A photo or a drawing alone needs no paper under it; a note with nothing written keeps one line of room.
  if (text > 0 || !(shape.hasPhoto || shape.drawing !== null)) height += padding * 2 + Math.max(text, lineHeight);
  return { height: Math.ceil(height), title, body };
}

export interface Placement {
  readonly id: string;
  readonly column: number;
  readonly top: number;
  readonly height: number;
}

/** Each card goes to the shortest column, the leftmost on a tie; `height` ends one gap below the last card. */
export function packWall(
  cards: readonly { readonly id: string; readonly height: number }[],
  columns: number,
  gap: number,
): { placements: Placement[]; height: number } {
  const heights = new Array<number>(Math.max(1, columns)).fill(0);
  const placements: Placement[] = [];
  for (const card of cards) {
    let column = 0;
    for (let c = 1; c < heights.length; c += 1) {
      if (heights[c]! < heights[column]!) column = c;
    }
    const top = heights[column] ?? 0;
    placements.push({ id: card.id, column, top, height: card.height });
    heights[column] = top + card.height + gap;
  }
  return { placements, height: Math.max(0, ...heights) };
}
