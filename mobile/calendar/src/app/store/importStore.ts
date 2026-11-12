/** Calendar files read and waiting for the import wizard (`.ics` shared or opened with Agenda): it takes them on its preview. */
import { create } from 'zustand';

import type { ImportFile } from '@unlease/calendar/services/importing';

export interface PendingImport {
  readonly files: readonly ImportFile[];
}

export const useImportStore = create<{ readonly pending: PendingImport | null }>(() => ({ pending: null }));

export function setPendingImport(pending: PendingImport | null): void {
  useImportStore.setState({ pending });
}
