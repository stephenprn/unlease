/**
 * What is open in Agenda's views, never stored: the event shown in its popover (and where it was
 * clicked), the new event being drawn on the grid with its quick form, the question « which of a
 * series' events? » waiting for its answer, and the file an import reads.
 */
import { create } from 'zustand';

import type { EditScope } from '@unlease/calendar/services/editing';

/** A rectangle on screen the popover stands beside. */
export interface Anchor {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PeekTarget {
  /** An occurrence's key (`<series>@<occurrence>`), or a layer's item (`birthday:…`, `reminder:…`, `page-date:…`). */
  readonly key: string;
  readonly anchor: Anchor;
}

export interface QuickDraft {
  readonly start: string;
  readonly end: string;
  readonly anchor: Anchor;
}

interface ScopeAsk {
  readonly title: string;
  readonly resolve: (scope: EditScope | null) => void;
}

export interface CalendarUiState {
  readonly peek: PeekTarget | null;
  readonly quick: QuickDraft | null;
  readonly scopeAsk: ScopeAsk | null;
  readonly importFile: File | null;
  readonly askOpen: boolean;
}

const INITIAL: CalendarUiState = { peek: null, quick: null, scopeAsk: null, importFile: null, askOpen: false };

export const useCalendarUi = create<CalendarUiState>(() => INITIAL);

export const anchorOf = (element: Element): Anchor => {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};

export const openPeek = (key: string, anchor: Anchor): void => useCalendarUi.setState({ peek: { key, anchor }, quick: null });
export const closePeek = (): void => useCalendarUi.setState({ peek: null });
export const openQuick = (draft: QuickDraft): void => useCalendarUi.setState({ quick: draft, peek: null });
export const closeQuick = (): void => useCalendarUi.setState({ quick: null });
export const setImportFile = (file: File | null): void => useCalendarUi.setState({ importFile: file });
export const setAskOpen = (askOpen: boolean): void => useCalendarUi.setState({ askOpen });

/** Asks which events of a series a change is for; null when the person cancels. */
export function askScope(title: string): Promise<EditScope | null> {
  return new Promise(resolve => {
    useCalendarUi.getState().scopeAsk?.resolve(null);
    useCalendarUi.setState({
      scopeAsk: {
        title,
        resolve: scope => {
          useCalendarUi.setState({ scopeAsk: null });
          resolve(scope);
        },
      },
    });
  });
}

/** Test seam. */
export function resetCalendarUi(): void {
  useCalendarUi.getState().scopeAsk?.resolve(null);
  useCalendarUi.setState(INITIAL, true);
}
