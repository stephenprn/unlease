/**
 * The board's geometry in a browser: core's masonry wall (`notes/services/wall`)
 * fed with this page's measurements.
 *
 * Columns follow the width: about 240 px each on a desktop (the wall fills the
 * width rather than leaving a margin), 12 apart; two on a phone, 8 apart, as the Android app has.
 * Card heights are computed from what each card shows and Signika's own widths,
 * never measured, so every card's box is known before any card renders and the
 * wall can render only what is on screen.
 */
import { GEOMETRY } from '@unlease/design/palette';
import { shownTitle } from '@unlease/notes/models/entities';
import { cardBody, MAX_CHECK_ROWS, layoutCard, packWall, type CardShape, type WallMetrics } from '@unlease/notes/services/wall';
import { noteDrawingRatio } from '@unlease/notes/services/drawing';
import { linesText, noteCardLines, noteCardParagraphs } from '@unlease/notes/services/noteBody';

import type { BoardSection } from '../../../app/hooks/useBoard';
import type { LibraryState } from '../../../app/store/library';

/** A section heading's band ("Épinglées"). */
export const SECTION_HEIGHT = 40;
/** Room above an untitled first row (the phone's page margin). */
export const WALL_TOP = 12;
/** The list layout's single column. */
export const LIST_WIDTH = 640;

export interface WallGeometry {
  readonly metrics: WallMetrics;
  readonly columns: number;
  /** The wall's own width: the columns and the gaps between them. */
  readonly width: number;
}

/** Between cards from 720px: a desktop's wider cards breathe a little more than the phone's 8. */
export const WIDE_GAP = 12;

export function wallGeometry(available: number, layout: 'wall' | 'list'): WallGeometry {
  const width = Math.max(160, available);
  const gap = width >= 720 ? WIDE_GAP : GEOMETRY.gap;
  let columns = 1;
  let columnWidth = Math.min(width, LIST_WIDTH);
  if (layout === 'wall') {
    // Narrow screens take two phone-width columns; desktops take ~240 px ones.
    const minColumn = width < 600 ? 160 : 232;
    columns = Math.max(1, Math.floor((width + gap) / (minColumn + gap)));
    columnWidth = (width - gap * (columns - 1)) / columns;
  }
  return {
    columns,
    width: columns * columnWidth + gap * (columns - 1),
    metrics: {
      columnWidth,
      gap,
      padding: GEOMETRY.cardPadding,
      // The sheet's edge is painted, not a border: it takes no room.
      border: 0,
      fontSize: 15,
      lineHeight: 21,
      checkRow: 24,
      metaLine: 18,
      footer: 40,
      maxHeight: columns === 1 ? 328 : 384,
    },
  };
}

/** What decides a card's height, read from the library (the phone's `shapeOf`). */
export function shapeOf(state: LibraryState, id: string): CardShape | null {
  const note = state.notes[id];
  if (!note) return null;
  const checks = (state.checksByNote[id] ?? []).map(cid => state.checks[cid]).filter(c => !!c);
  const open = checks.filter(c => !c!.checked).length;
  // An open item with nothing written in it is left off the card: a bare box says nothing.
  const written = checks.filter(c => !c!.checked && c!.text.trim() !== '').length;
  const links = state.linksByNote[id] ?? [];
  const lines = noteCardLines(note);
  return {
    id,
    kind: note.kind,
    title: shownTitle(note).trim(),
    body: note.kind === 'text' ? (lines ? linesText(lines) : cardBody(note.body)) : '',
    paragraphs: noteCardParagraphs(note),
    drawing: noteDrawingRatio(note),
    openChecks: Math.min(MAX_CHECK_ROWS, written),
    hasCheckedSummary: checks.length > open,
    hasPhoto: note.kind !== 'links' && (state.attachmentsByNote[id]?.length ?? 0) > 0,
    hasThumbs: note.kind === 'links' && links.some(lid => (state.links[lid]?.imageIds.length ?? 0) > 0 && !state.links[lid]?.done),
    hasFooter: note.labelIds.length > 0 || note.reminderAt !== null,
  };
}

export type WallItem =
  | { readonly kind: 'section'; readonly key: string; readonly title: string; readonly top: number }
  | {
      readonly kind: 'card';
      readonly key: string;
      readonly id: string;
      readonly left: number;
      readonly top: number;
      readonly width: number;
      readonly height: number;
    };

export interface WallLayout {
  readonly items: readonly WallItem[];
  readonly height: number;
}

export function layoutWall(sections: readonly BoardSection[], state: LibraryState, geometry: WallGeometry): WallLayout {
  const { metrics, columns } = geometry;
  const items: WallItem[] = [];
  // Untitled first cards would touch what is above the wall (the header on a phone).
  let top = sections[0]?.title ? 0 : WALL_TOP;
  for (const section of sections) {
    if (section.title) {
      items.push({ kind: 'section', key: `s-${section.key}`, title: section.title, top });
      top += SECTION_HEIGHT;
    }
    const cards = section.ids
      .map(id => {
        const shape = shapeOf(state, id);
        return shape ? { id, height: layoutCard(shape, metrics).height } : null;
      })
      .filter((card): card is { id: string; height: number } => card !== null);
    const packed = packWall(cards, columns, metrics.gap);
    for (const placement of packed.placements) {
      items.push({
        kind: 'card',
        key: placement.id,
        id: placement.id,
        left: placement.column * (metrics.columnWidth + metrics.gap),
        top: top + placement.top,
        width: metrics.columnWidth,
        height: placement.height,
      });
    }
    top += packed.height + (section.title ? 8 : 0);
  }
  return { items, height: Math.max(0, top - metrics.gap) };
}
