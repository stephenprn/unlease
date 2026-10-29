/**
 * The keyboard and the clipboard, app-wide.
 *
 * Shortcuts are single keys, as in Keep, and only fire when no field has the
 * focus and no dialog is open (dialogs handle their own keys); ⌘P (Ctrl+P
 * elsewhere) and Ctrl+K (⌘K), the spotlight, work from anywhere. A paste outside
 * any field files the links it holds, or makes a photo note of an image.
 */
import { useEffect } from 'react';

import { t } from '@unlease/core/i18n';
import { INBOX_ID } from '@unlease/notes/models/entities';
import { collectionsWithLinks } from '@unlease/notes/services/sorting';

import { setArchived, trashNotes } from '../app/store/actions';
import { clearSelection, selectSelection, setQuery, toggleSelected, useBoardStore } from '../app/store/board';
import { useLibraryStore } from '../app/store/library';
import { askDeleteLines, openCapture, setShortcutsOpen, setSpotlightOpen, showUndo } from '../app/store/ui';
import { classifyClipboard, currentPage, fileLinks, newChecklist, newDrawing, newNote, newPhotoNote } from './commands';
import { hasOpenLayer } from './components/layers';
import { openNewPage } from './features/pages/PageTree';
import { isApple, isEditable } from './dom';
import { SEARCH_INPUT_ID } from './navigation/Header';
import { parseRoute } from './router';

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
    showUndo(live.length > 1 ? t('Notes placées dans la corbeille') : t('Note placée dans la corbeille'), trashNotes(live));
  } else {
    const archiving = !notes[live[0]!]!.archived;
    const undos = live.map(id => setArchived(id, archiving));
    showUndo(archiving ? (live.length > 1 ? t('Notes archivées') : t('Note archivée')) : t('Note désarchivée'), () => undos.forEach(undo => undo()));
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

export function useGlobalKeys(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing) return;
      // ⌘P (Ctrl+P elsewhere) searches from anywhere, and never prints the app: even over a dialog, it is taken.
      if ((isApple() ? event.metaKey : event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        if (!hasOpenLayer()) setSpotlightOpen(true);
        return;
      }
      // Ctrl+K (⌘K) too; in a page, with words selected, it stays the editor's link.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        const selection = document.getSelection();
        if (hasOpenLayer() || (isEditable(event.target) && selection && !selection.isCollapsed)) return;
        event.preventDefault();
        setSpotlightOpen(true);
        return;
      }
      if (event.defaultPrevented || hasOpenLayer()) return;
      // Windows reports AltGr as Ctrl+Alt: "#" typed with it (AZERTY) is still the bin's key.
      const altGr = !isApple() && event.ctrlKey && event.altKey && !event.metaKey && event.key === '#';
      if ((event.ctrlKey || event.metaKey || event.altKey) && !altGr) return;
      if (event.key === 'Escape') {
        if (useBoardStore.getState().selection.size > 0) clearSelection();
        else if (useBoardStore.getState().query && !isEditable(event.target)) setQuery('');
        return;
      }
      if (isEditable(event.target)) return;
      const key = event.key;
      const selection = selectSelection(useBoardStore.getState());
      const card = focusedCard();
      const run = (action: () => void): void => {
        event.preventDefault();
        action();
      };
      switch (key) {
        case '/':
          run(() => {
            const field = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
            field?.focus();
            field?.select();
          });
          break;
        case 'c':
        case 'C':
          run(newNote);
          break;
        case 'l':
        case 'L':
          run(newChecklist);
          break;
        case 'd':
        case 'D':
          run(newDrawing);
          break;
        case 'k':
        case 'K':
          run(() => openCapture(''));
          break;
        case 'v':
        case 'V':
          run(() => void classifyClipboard());
          break;
        case 'p':
        case 'P':
          run(() => openNewPage(null));
          break;
        case '?':
          run(() => setShortcutsOpen(true));
          break;
        case 'x':
        case 'X':
          if (card) run(() => toggleSelected(card));
          break;
        case 'e':
        case 'E':
          if (selection.size > 0) run(() => leaveWithFocus([...selection], 'archive', card));
          else if (card) run(() => leaveWithFocus([card], 'archive', card));
          break;
        case '#':
          if (selection.size > 0) run(() => leaveWithFocus([...selection], 'trash', card));
          else if (card) run(() => leaveWithFocus([card], 'trash', card));
          break;
      }
    };

    const onPaste = (event: ClipboardEvent): void => {
      if (event.defaultPrevented || hasOpenLayer() || isEditable(event.target) || !event.clipboardData) return;
      const route = parseRoute(new URL(currentPage(), location.origin).pathname);
      if (route.name === 'settings' || route.name === 'admin' || route.name === 'labels') return;
      const images = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));
      if (images.length > 0 && route.name === 'board') {
        event.preventDefault();
        void newPhotoNote(images);
        return;
      }
      if (fileLinks(event.clipboardData.getData('text/plain'))) event.preventDefault();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('paste', onPaste);
    };
  }, [enabled]);

  // A file dropped where nothing takes it is never opened in the app's place; pictures dropped on the board become a note, as when pasted.
  useEffect(() => {
    const carriesFiles = (event: DragEvent): boolean => !!event.dataTransfer && [...event.dataTransfer.types].includes('Files');
    const onDragOver = (event: DragEvent): void => {
      if (carriesFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent): void => {
      if (!carriesFiles(event) || event.defaultPrevented) return;
      event.preventDefault();
      if (!enabled || hasOpenLayer()) return;
      const images = [...event.dataTransfer!.files].filter(file => file.type.startsWith('image/'));
      if (images.length > 0 && parseRoute(new URL(currentPage(), location.origin).pathname).name === 'board') void newPhotoNote(images);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [enabled]);
}
