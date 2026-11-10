/** A calendar file read and waiting to be confirmed on the import screen (an `.ics` shared or opened, one picked). */
import { create } from 'zustand';

import type { IcsCalendar } from '@unlease/calendar/services/ics';

export interface PendingImport {
  readonly calendar: IcsCalendar;
  /** The file's name or the share's subject. */
  readonly name: string;
}

export const useImportStore = create<{ readonly pending: PendingImport | null }>(() => ({ pending: null }));

export function setPendingImport(pending: PendingImport | null): void {
  useImportStore.setState({ pending });
}
