/**
 * What is in hand: the tool, each tool's size and the ink last chosen, kept for the session, so the
 * next drawing starts with them. Choosing a size or an ink while erasing goes back to drawing.
 */
import { create } from 'zustand';

import type { DrawingInk, DrawingSize, DrawingTool } from '@unlease/notes/models/drawing';

export type DrawingMode = DrawingTool | 'eraser';

export const DRAWING_MODES: readonly DrawingMode[] = ['pen', 'marker', 'highlighter', 'eraser'];

export interface Pen {
  /** What a press does: draw with `tool`, or erase. */
  readonly mode: DrawingMode;
  /** The drawing tool, kept while erasing. */
  readonly tool: DrawingTool;
  readonly sizes: Readonly<Record<DrawingTool, DrawingSize>>;
  readonly ink: DrawingInk;
}

const FIRST: Pen = { mode: 'pen', tool: 'pen', sizes: { pen: 1, marker: 1, highlighter: 1 }, ink: 'ink' };

export const usePen = create<Pen>(() => FIRST);

export function chooseMode(mode: DrawingMode): void {
  usePen.setState(mode === 'eraser' ? { mode } : { mode, tool: mode });
}

export function chooseSize(size: DrawingSize): void {
  usePen.setState(pen => ({ mode: pen.tool, sizes: { ...pen.sizes, [pen.tool]: size } }));
}

export function chooseInk(ink: DrawingInk): void {
  usePen.setState(pen => ({ mode: pen.tool, ink }));
}

/** Test seam. */
export function resetPen(): void {
  usePen.setState(FIRST, true);
}
