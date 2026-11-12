/**
 * The proportions of the pictures a mosaic has shown (width over height), kept for the visit: a
 * collection opened again lays each piece at its height at once, never 4:5 first. A picture far
 * taller or wider than a page's photo is cut to the bounds, so one banner or one long screenshot
 * never takes a column. The phone keeps its own (`mobile/notes`' `pictureRatios`).
 */
export const RATIO_BOUNDS = { tallest: 0.5, widest: 1.8 } as const;

const ratios = new Map<string, number>();

/** Kept, within the bounds; the same number back. */
export function rememberRatio(src: string, ratio: number): number {
  const bounded = Math.min(RATIO_BOUNDS.widest, Math.max(RATIO_BOUNDS.tallest, ratio));
  if (ratios.size > 2000) ratios.clear();
  ratios.set(src, bounded);
  return bounded;
}

export const pictureRatio = (src: string): number | null => ratios.get(src) ?? null;
