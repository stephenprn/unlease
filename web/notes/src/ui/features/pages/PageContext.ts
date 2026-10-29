/** The page a block is drawn in, and whether it can be changed (a page in the bin reads as it is). */
import { createContext, useContext } from 'react';

export interface PageContextValue {
  readonly page: string;
  readonly readOnly: boolean;
}

export const PageContext = createContext<PageContextValue>({ page: '', readOnly: true });

export function usePageContext(): PageContextValue {
  return useContext(PageContext);
}
