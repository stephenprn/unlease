/** An import read before its screen opened (a card shared to the app), waiting there on its preview. */
import { create } from 'zustand';

import type { ImportRead } from '../importing';

export type PendingImport = ImportRead;

export const useImportStore = create<{ readonly pending: PendingImport | null }>(() => ({ pending: null }));

export function setPendingImport(pending: PendingImport | null): void {
  useImportStore.setState({ pending });
}
