/**
 * What the toolbar buttons, the keyboard shortcuts and the empty states all
 * do, in one place: create, open, file. Screens call these rather than wiring
 * the store and the router each time.
 */
import { t } from '@unlease/core/i18n';
import { addedMessage } from '@unlease/notes/services/savedLinks';
import { extractUrls } from '@unlease/core/services/url';
import { INBOX_ID } from '@unlease/notes/models/entities';

import { classifyText } from '../app/capture';
import { attachFiles } from '../app/media/attach';
import { addCheck, addLinks, createNote, deleteForever } from '../app/store/actions';
import { useLibraryStore } from '../app/store/library';
import { addedTone, openCapture, setEditorFocus, showError, showSnack } from '../app/store/ui';
import { getLocation, navigate, parseRoute, paths } from './router';

/** The page under whatever is open: what an overlay opened now should sit on. */
export function currentPage(): string {
  const here = getLocation();
  const route = parseRoute(here.path);
  if (route.name === 'note' || route.name === 'link') return here.state.background ?? '/';
  return `${here.path}${here.search}`;
}

/** The label of the board view on screen, so a note made there wears it. */
function currentLabelIds(): string[] {
  const route = parseRoute(new URL(currentPage(), location.origin).pathname);
  return route.name === 'board' && route.view.startsWith('label:') ? [route.view.slice(6)] : [];
}

export function openNote(id: string): void {
  const note = useLibraryStore.getState().notes[id];
  if (note?.kind === 'links') navigate(paths.line(id));
  else navigate(paths.note(id), { background: currentPage() });
}

export function openLink(id: string): void {
  navigate(paths.link(id), { background: currentPage() });
}

function openNewNote(title: string): string {
  const id = createNote({ kind: 'text', title, labelIds: currentLabelIds() });
  setEditorFocus('body');
  navigate(paths.note(id), { background: currentPage() });
  return id;
}

export function newNote(): string {
  return openNewNote('');
}

/** A note already titled (the spotlight's « Créer la note »), its body ready for typing. */
export function newTitledNote(title: string): string {
  return openNewNote(title);
}

export function newChecklist(): string {
  const id = createNote({ kind: 'checklist', labelIds: currentLabelIds() });
  addCheck(id, '');
  setEditorFocus('check');
  navigate(paths.note(id), { background: currentPage() });
  return id;
}

/** A drawing note, opened on its empty sheet. */
export function newDrawing(): string {
  const id = createNote({ kind: 'drawing', labelIds: currentLabelIds() });
  navigate(paths.note(id), { background: currentPage() });
  return id;
}

/** A note made of photos: dropped, picked or pasted on the board. */
export async function newPhotoNote(files: readonly File[]): Promise<void> {
  const id = createNote({ kind: 'text', labelIds: currentLabelIds() });
  const outcome = await attachFiles(id, files);
  if (outcome.added === 0) {
    deleteForever([id]);
    showError(t('Ces fichiers ne sont pas des images que le serveur accepte.'));
    return;
  }
  setEditorFocus('body');
  navigate(paths.note(id), { background: currentPage() });
}

/**
 * Text that holds links, from a paste: on a line's page they join that line;
 * anywhere else they are filed by the server, with the transfer panel.
 */
export function fileLinks(text: string): boolean {
  const urls = extractUrls(text);
  if (urls.length === 0) return false;
  const route = parseRoute(new URL(currentPage(), location.origin).pathname);
  const line = route.name === 'line' ? useLibraryStore.getState().notes[route.id] : undefined;
  // A collection in the bin takes nothing: what is pasted there is filed as anywhere else.
  if (route.name === 'line' && route.id !== INBOX_ID && line && line.trashedAt === null) {
    const placed = addLinks(urls, { noteId: route.id });
    const message = addedMessage(placed, { into: route.id, announce: true }, useLibraryStore.getState().notes);
    if (message) showSnack(message, undefined, { tone: addedTone(placed) });
    return true;
  }
  classifyText(text);
  return true;
}

/** "v": classify what the clipboard holds, or open the dialog when it is not a link. */
export async function classifyClipboard(): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    if (fileLinks(text)) return;
    openCapture(text.trim().slice(0, 500));
  } catch {
    // Reading the clipboard needs permission; the dialog takes a normal paste.
    openCapture('');
  }
}
