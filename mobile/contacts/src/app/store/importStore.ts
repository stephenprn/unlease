/** An import read and waiting to be confirmed on the import screen (a card shared to the app, a file, the phone's contacts). */
import { create } from 'zustand';

import type { ImportedContact } from '@unlease/contacts/services/importing';

import type { ImportSource } from '../importing';

export interface PendingImport {
  readonly source: ImportSource;
  readonly contacts: readonly ImportedContact[];
  /** The file's name, when one was picked. */
  readonly name: string;
}

export const useImportStore = create<{ readonly pending: PendingImport | null }>(() => ({ pending: null }));

export function setPendingImport(pending: PendingImport | null): void {
  useImportStore.setState({ pending });
}
