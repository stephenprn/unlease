/**
 * Text with the search terms marked, so the board shows *why* a note matched.
 * Ranges come from core's `matchRanges`, which folds accents the way search does,
 * or are given already worked out (the spotlight's, which knows typos and word starts).
 */
import { memo } from 'react';

import { matchRanges } from '@unlease/core/services/search';

function HighlightComponent({ text, query = '', ranges }: { text: string; query?: string; ranges?: readonly (readonly [number, number])[] }) {
  const marked = ranges ?? (query.trim() ? matchRanges(text, query) : []);
  if (marked.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  marked.forEach(([start, end], index) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(<mark key={index}>{text.slice(start, end)}</mark>);
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export const Highlight = memo(HighlightComponent);
