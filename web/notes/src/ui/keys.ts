/**
 * Carnet's keys and clipboard on its pages (the shell routes them here, `platform/ui/shortcuts`):
 * on the board, X picks the card with the focus, E archives and # bins what is picked (or that
 * card), Escape ends a selection; a paste outside any field files the links it holds, or makes a
 * photo note of an image on the board; pictures dropped on the board become a note too.
 */
import { t } from '@unlease/core/i18n';
import { INBOX_ID } from '@unlease/notes/models/entities';
import { collectionsWithLinks } from '@unlease/notes/services/sorting';

import { setArchived, trashNotes } from '../app/store/actions';
import { clearSelection, selectSelection, toggleSelected, useBoardStore } from '../app/store/board';
import { useLibraryStore } from '../app/store/library';
import { askDeleteLines } from '../app/store/notesUi';
import { showUndo } from '@shared/app/store/ui';
import type { Route } from '@shared/ui/router';
import { fileLinks, newPhotoNote } from './commands';

function focusedCard(): string | null {
  const active = document.activeElement;
  return active instanceof HTMLElement ? (active.dataset.cardLink ?? null) : null;
}

/** The cards on the board in reading order (Tab's), those fading out left aside. */
function boardCards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-card-link]')].filter(link => !link.closest('[data-leaving]'));
}

function archiveOrTrash(ids: readonly string[], action: 'archive' | 'trash'): void {
  const { notes, linksByNote } = useLibraryStore.getState();
  const live = ids.filter(id => notes[id] && notes[id]!.trashedAt === null);
  if (live.length === 0) return;
  if (action === 'trash' && collectionsWithLinks(live, notes, linksByNote).length > 0) {
    // As the selection bar's "Supprimer": the app asks where the links go, and keeps the selection until then.
    askDeleteLines(live.filter(id => id !== INBOX_ID));
    return;
  }
  if (action === 'trash') {
    showUndo(live.length > 1 ? t('Notes moved to the bin') : t('Note moved to the bin'), trashNotes(live));
  } else {
    const archiving = !notes[live[0]!]!.archived;
    const undos = live.map(id => setArchived(id, archiving));
    showUndo(archiving ? (live.length > 1 ? t('Notes archived') : t('Note archived')) : t('Note unarchived'), () => undos.forEach(undo => undo()));
  }
  clearSelection();
}

/** As `archiveOrTrash`; a focused card that leaves hands the focus to the next card, the one before, or the board. */
function leaveWithFocus(ids: readonly string[], action: 'archive' | 'trash', card: string | null): void {
  const cards = boardCards();
  const at = card && ids.includes(card) ? cards.findIndex(link => link.dataset.cardLink === card) : -1;
  const staying = (link: HTMLElement): boolean => !ids.includes(link.dataset.cardLink ?? '');
  const heir = at < 0 ? undefined : (cards.slice(at + 1).find(staying) ?? cards.slice(0, at).reverse().find(staying));
  archiveOrTrash(ids, action);
  if (at < 0) return;
  // Once the board has drawn it: a card still shown (a search, the reminders) or a dialog keeps the focus.
  requestAnimationFrame(() => {
    if (boardCards().some(link => link.dataset.cardLink === card)) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && active.isConnected && !active.closest('[inert]')) return;
    if (heir?.isConnected && !heir.closest('[data-leaving]')) heir.focus();
    else document.getElementById('main')?.focus({ preventScroll: true });
  });
}

/** A key of Carnet's own, on one of its pages: true when it took it. */
export function onNotesKey(event: KeyboardEvent, _route: Route): boolean {
  if (event.key === 'Escape') {
    if (useBoardStore.getState().selection.size === 0) return false;
    clearSelection();
    return true;
  }
  const selection = selectSelection(useBoardStore.getState());
  const card = focusedCard();
  switch (event.key) {
    case 'x':
    case 'X':
      if (!card) return false;
      toggleSelected(card);
      return true;
    case 'e':
    case 'E':
      if (selection.size > 0) leaveWithFocus([...selection], 'archive', card);
      else if (card) leaveWithFocus([card], 'archive', card);
      else return false;
      return true;
    case '#':
      if (selection.size > 0) leaveWithFocus([...selection], 'trash', card);
      else if (card) leaveWithFocus([card], 'trash', card);
      else return false;
      return true;
    default:
      return false;
  }
}

/** A paste outside any field, on a page of Carnet's: an image on the board becomes a photo note; links are filed. */
export function onNotesPaste(data: DataTransfer, route: Route): boolean {
  if (route.name === 'labels') return false;
  const images = [...data.files].filter(file => file.type.startsWith('image/'));
  if (images.length > 0 && route.name === 'board') {
    void newPhotoNote(images);
    return true;
  }
  return fileLinks(data.getData('text/plain'));
}

/** Pictures dropped on the board: a photo note. */
export function onNotesDrop(files: readonly File[], route: Route): boolean {
  const images = files.filter(file => file.type.startsWith('image/'));
  if (images.length === 0 || route.name !== 'board') return false;
  void newPhotoNote(images);
  return true;
}
