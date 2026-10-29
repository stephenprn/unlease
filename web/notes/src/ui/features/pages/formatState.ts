/**
 * The formatting bar's subject: a selection inside one block's text, as offsets, kept while the bar
 * asks for a link address (the selection itself is gone once its field has the focus).
 */
import { create } from 'zustand';

export interface FormatTarget {
  readonly block: string;
  readonly start: number;
  readonly end: number;
  /** The bar shows its link field. */
  readonly link: boolean;
}

export const useFormatStore = create<{ readonly target: FormatTarget | null }>(() => ({ target: null }));

export function openFormat(target: FormatTarget): void {
  useFormatStore.setState({ target });
}

export function closeFormat(): void {
  if (useFormatStore.getState().target) useFormatStore.setState({ target: null });
}
