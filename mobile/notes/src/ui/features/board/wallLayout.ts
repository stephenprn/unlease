/**
 * Core's masonry wall fed with React Native's measurements. Card text follows the system font
 * scale (taller cards, never clipped ones).
 */
import { useMemo } from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';

import { GEOMETRY } from '@unlease/design/palette';
import { shownTitle } from '@unlease/notes/models/entities';
import { cardBody, MAX_CHECK_ROWS, layoutCard, packWall, type CardShape, type WallMetrics } from '@unlease/notes/services/wall';
import { noteDrawingRatio } from '@unlease/notes/services/drawing';
import { linesText, noteCardLines, noteCardParagraphs } from '@unlease/notes/services/noteBody';
import type { LibraryState } from '@app/store/libraryStore';

export const PAGE_PADDING = 12;
export const SECTION_HEIGHT = 40;

export function useWallMetrics(columns: number): WallMetrics {
  const { width } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();
  return useMemo(() => {
    const columnWidth = (width - PAGE_PADDING * 2 - GEOMETRY.gap * (columns - 1)) / columns;
    return {
      columnWidth,
      gap: GEOMETRY.gap,
      padding: GEOMETRY.cardPadding,
      // The sheet's hairline is a border here: it takes room inside the card.
      border: 1,
      fontSize: 15 * fontScale,
      lineHeight: 21 * fontScale,
      checkRow: 24 * fontScale,
      metaLine: 18 * fontScale,
      // A 24 tag with 4 above and 12 below: the card's bottom edge never touches it.
      footer: 40 * fontScale,
      maxHeight: columns === 1 ? 328 : 384,
    };
  }, [width, columns, fontScale]);
}

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

export function layoutWall(
  sections: readonly { key: string; title: string | null; ids: readonly string[] }[],
  state: LibraryState,
  metrics: WallMetrics,
  columns: number,
): WallLayout {
  const items: WallItem[] = [];
  // Untitled first cards would touch the header: give them the page's own margin.
  let top = sections[0]?.title ? 0 : PAGE_PADDING;
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
        left: PAGE_PADDING + placement.column * (metrics.columnWidth + metrics.gap),
        top: top + placement.top,
        width: metrics.columnWidth,
        height: placement.height,
      });
    }
    top += packed.height + (section.title ? 8 : 0);
  }
  return { items, height: top };
}
