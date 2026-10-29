/** The page a block is drawn in (its gestures go to that page's undo), and whether it can be changed (not in the bin). */
import { createContext, useContext } from 'react';

import type { BlockTarget } from '@unlease/notes/models/blocks';

export interface PageContextValue {
  readonly page: string;
  readonly readOnly: boolean;
  /** Opens a note, a collection, a link or a page a block points at. */
  readonly openTarget: (target: BlockTarget) => void;
  /** Scrolls the page to one of its blocks and lights it a moment (a heading picked in a table of contents). */
  readonly jumpTo?: (block: string) => void;
}

export const PageContext = createContext<PageContextValue>({ page: '', readOnly: true, openTarget: () => {} });

export function usePageContext(): PageContextValue {
  return useContext(PageContext);
}
