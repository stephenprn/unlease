/**
 * What is open in Agenda's views, never stored: the event shown in its popover (and where it was
 * clicked), the new event being drawn on the grid with its quick form (its times, which the span
 * drawn under it follows), what that form hands « Plus d'options », the question « which of a
 * series' events? » waiting for its answer, and the file an import reads.
 */
import { create } from 'zustand';

import type { EditScope, EventDraft } from '@unlease/calendar/services/editing';

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
  /** The slot drawn, where the form stands beside. */
  readonly anchor: Anchor;
  /** Which opening this is: its times change in place, the form and what is typed in it stay. */
  readonly id: number;
}

interface ScopeAsk {
  readonly title: string;
  readonly resolve: (scope: EditScope | null) => void;
}

export interface CalendarUiState {
  readonly peek: PeekTarget | null;
  readonly quick: QuickDraft | null;
  /** The quick form's draft as « Plus d'options » leaves it, for the new event's form to open on. */
  readonly handed: EventDraft | null;
  readonly scopeAsk: ScopeAsk | null;
  /** Calendar files given anywhere (dropped on Agenda): the import reads them at once. */
  readonly importFiles: readonly File[] | null;
  readonly askOpen: boolean;
}

const INITIAL: CalendarUiState = { peek: null, quick: null, handed: null, scopeAsk: null, importFiles: null, askOpen: false };

let quickOpenings = 0;

export const useCalendarUi = create<CalendarUiState>(() => INITIAL);

export const anchorOf = (element: Element): Anchor => {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};

export const openPeek = (key: string, anchor: Anchor): void => useCalendarUi.setState({ peek: { key, anchor }, quick: null });
export const closePeek = (): void => useCalendarUi.setState({ peek: null });
export const openQuick = (draft: Omit<QuickDraft, 'id'>): void => useCalendarUi.setState({ quick: { ...draft, id: (quickOpenings += 1) }, peek: null });
/** The quick form's day or hours changed: the span drawn on the grid follows. */
export const setQuickTimes = (start: string, end: string): void => useCalendarUi.setState(state => (state.quick ? { quick: { ...state.quick, start, end } } : {}));
export const closeQuick = (): void => useCalendarUi.setState({ quick: null });
/** What « Plus d'options » carries to the new event's form (null once it has taken it). */
export const handDraft = (draft: EventDraft | null): void => useCalendarUi.setState({ handed: draft });
export const setImportFiles = (importFiles: readonly File[] | null): void => useCalendarUi.setState({ importFiles });
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
