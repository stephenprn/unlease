/**
 * Carnet's ephemeral interface state shared across its screens: the capture dialog, the transfer
 * panel, the new collection's dialog, where the next editor puts the caret, Claude's sorting, the
 * collections being deleted. Nothing here is persisted. The snackbar and the drawer are the shell's
 * (`@shared/app/store/ui`).
 */
import { create } from 'zustand';

/** A link on its way to a collection: what the transfer panel is showing. */
export interface Transfer {
  readonly linkId: string;
  readonly startedAt: number;
  /** Tracking parameters taken off the shared address. */
  readonly cleaned: number;
}

/** A share without a link, until the person makes it a note (`readShare`). */
export interface SharedNote {
  readonly title: string;
  readonly body: string;
}

export interface NotesUiState {
  readonly captureOpen: boolean;
  /** Text to prefill the capture dialog with (a paste, the clipboard, a share). */
  readonly captureText: string;
  /** The page title a share sent beside its link: the link's title if the text is filed as it came. */
  readonly captureTitle: string;
  /** A share without a link, asking to become a note. */
  readonly sharedNote: SharedNote | null;
  readonly transfers: readonly Transfer[];
  readonly newLineOpen: boolean;
  /** Where the next editor puts the caret: a new note starts in its body or first item. */
  readonly editorFocus: 'body' | 'check' | null;
  /** Claude is sorting links: one sort at a time, so no answer's slip hides another's "Annuler". */
  readonly sorting: boolean;
  /** Notes being deleted with collections holding links among them: the app asks where those go (the ids stay after it closes). */
  readonly deleteLines: { readonly ids: readonly string[]; readonly open: boolean };
}

const INITIAL: NotesUiState = {
  captureOpen: false,
  captureText: '',
  captureTitle: '',
  sharedNote: null,
  transfers: [],
  newLineOpen: false,
  editorFocus: null,
  sorting: false,
  deleteLines: { ids: [], open: false },
};

export const useNotesUiStore = create<NotesUiState>(() => INITIAL);

/** Links added (some new: done) or all saved already (news): the package's, the same on the phone. Kept here for Pages' table. */
export { addedTone } from '@unlease/notes/services/savedLinks';

export function openCapture(text = '', title = ''): void {
  useNotesUiStore.setState({ captureOpen: true, captureText: text, captureTitle: title });
}

export function closeCapture(): void {
  useNotesUiStore.setState({ captureOpen: false, captureText: '', captureTitle: '' });
}

/** A share without a link: the app asks before making it a note. */
export function askSharedNote(shared: SharedNote): void {
  useNotesUiStore.setState({ sharedNote: shared });
}

export function closeSharedNote(): void {
  useNotesUiStore.setState({ sharedNote: null });
}

export function startTransfer(linkId: string, cleaned = 0, now: number = Date.now()): void {
  useNotesUiStore.setState(s => ({ transfers: [...s.transfers.filter(t => t.linkId !== linkId), { linkId, startedAt: now, cleaned }] }));
}

export function endTransfer(linkId: string): void {
  useNotesUiStore.setState(s => ({ transfers: s.transfers.filter(t => t.linkId !== linkId) }));
}

export function setNewLineOpen(open: boolean): void {
  useNotesUiStore.setState({ newLineOpen: open });
}

export function setSorting(sorting: boolean): void {
  useNotesUiStore.setState({ sorting });
}

/** From the selection bar's "Supprimer" or the "#" key. */
export function askDeleteLines(ids: readonly string[]): void {
  useNotesUiStore.setState({ deleteLines: { ids, open: true } });
}

export function closeDeleteLines(): void {
  useNotesUiStore.setState(s => ({ deleteLines: { ...s.deleteLines, open: false } }));
}

export function setEditorFocus(focus: NotesUiState['editorFocus']): void {
  useNotesUiStore.setState({ editorFocus: focus });
}

/** Read once by the editor that opens next. */
export function takeEditorFocus(): NotesUiState['editorFocus'] {
  const focus = useNotesUiStore.getState().editorFocus;
  if (focus) useNotesUiStore.setState({ editorFocus: null });
  return focus;
}

export const selectCaptureOpen = (s: NotesUiState): boolean => s.captureOpen;
export const selectCaptureText = (s: NotesUiState): string => s.captureText;
export const selectCaptureTitle = (s: NotesUiState): string => s.captureTitle;
export const selectSharedNote = (s: NotesUiState): SharedNote | null => s.sharedNote;
export const selectTransfers = (s: NotesUiState): readonly Transfer[] => s.transfers;
export const selectNewLineOpen = (s: NotesUiState): boolean => s.newLineOpen;
export const selectSorting = (s: NotesUiState): boolean => s.sorting;
export const selectDeleteLines = (s: NotesUiState): NotesUiState['deleteLines'] => s.deleteLines;

/** Test seam. */
export function resetNotesUi(): void {
  useNotesUiStore.setState(INITIAL, true);
}
