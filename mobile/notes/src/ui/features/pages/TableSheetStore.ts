/** Which sheet a table asked for: a cell's, a column's or a row's (`TableSheetHost` shows it). */
import { create } from 'zustand';

import { t, tc } from '@unlease/core/i18n';
import { deleteBlocks } from '@app/store/pages';
import { commit } from '@app/store/pageHistory';
import { showSnack } from '@app/store/uiStore';

export type TableSheetRequest =
  | { readonly kind: 'cell'; readonly page: string; readonly table: string; readonly row: string; readonly column: string }
  | { readonly kind: 'column'; readonly page: string; readonly table: string; readonly column: string }
  | { readonly kind: 'row'; readonly page: string; readonly table: string; readonly row: string };

export const useTableSheets = create<{ readonly request: TableSheetRequest | null }>(() => ({ request: null }));

export function openTableSheet(request: TableSheetRequest): void {
  useTableSheets.setState({ request });
}

export function closeTableSheet(): void {
  useTableSheets.setState({ request: null });
}

/** A row gone, with the way back. */
export function deleteRowWithUndo(page: string, row: string): void {
  deleteBlocks(page, [row]);
  showSnack(t('Ligne supprimée'), { label: tc('undo', 'Annuler'), run: () => commit(page, [{ type: 'block', id: row, patch: { deletedAt: null } }]) }, { tone: 'success' });
}
