/**
 * Carnet's places as the shell draws them: the board and its views, a collection, the lists of
 * collections and labels; a note opened over the board it came from, a link over its collection
 * (overlays: the page under them is in the history's state, a deep link gets a sensible one); and
 * what Carnet keeps mounted while it is on (the capture dialog, the transfer panel, the timers).
 */
import { t } from '@unlease/core/i18n';
import { shownTitle } from '@unlease/notes/models/entities';
import { spotKey } from '@unlease/core/services/spotlight';

import { useLibraryStore, type LibraryState } from '../app/store/library';
import { selectNewLineOpen, setNewLineOpen, useNotesUiStore } from '../app/store/notesUi';
import { useLeaving } from '@shared/ui/components/presence';
import { goBack, navigate, parseRoute, type Route } from '@shared/ui/router';
import { CaptureDialog } from './features/capture/CaptureDialog';
import { TransferPanel } from './features/capture/TransferPanel';
import { GlobalDeleteLines } from './features/lines/GlobalDeleteLines';
import { NewLineDialog } from './features/lines/LineDialogs';
import { KitchenTimers } from './features/links/KitchenTimers';
import { LinkPanel } from './features/links/LinkPanel';
import { NoteEditor } from './features/note/NoteEditor';
import { pathForView, paths } from './routes';
import { BoardScreen } from './screens/BoardScreen';
import { LabelsScreen } from './screens/LabelsScreen';
import { LinesScreen } from './screens/LinesScreen';
import { LineScreen } from './screens/LineScreen';
import { FactsEditScreen, factsTitle } from './screens/FactsEditScreen';
import { FactsScreen } from './screens/FactsScreen';

/** Longer than any layer's exit, so the layer finishes leaving before the editor or the link panel unmounts. */
const OVERLAY_EXIT_MS = 300;

export function NotesScreen({ route }: { route: Route }) {
  switch (route.name) {
    case 'board':
      return <BoardScreen view={route.view} />;
    case 'line':
      return <LineScreen key={route.id} id={route.id} />;
    case 'lines':
      return <LinesScreen />;
    case 'labels':
      return <LabelsScreen />;
    case 'templates':
      return <FactsScreen />;
    case 'template':
      return <FactsEditScreen key={route.id} part={route.id} />;
    default:
      return null;
  }
}

function titleFor(state: LibraryState, route: Route, overlay: Route): string | null {
  if (overlay.name === 'note') return state.notes[overlay.id]?.title.trim() || t('Note');
  if (overlay.name === 'link') return state.links[overlay.id]?.title || t('Lien');
  switch (route.name) {
    case 'board':
      if (route.view === 'reminders') return t('Rappels');
      if (route.view === 'archive') return t('Archives');
      if (route.view === 'trash') return t('Corbeille');
      if (route.view.startsWith('label:')) return state.labels[route.view.slice(6)]?.name ?? t('Label');
      return null;
    case 'line': {
      const line = state.notes[route.id];
      return line ? shownTitle(line) : t('Collection');
    }
    case 'lines':
      return t('Collections');
    case 'labels':
      return t('Labels');
    case 'templates':
      return t('Ce que Claude relève');
    case 'template':
      return factsTitle(state, route.id);
    default:
      return null;
  }
}

/** Subscribing keeps the tab's title in step with renames. */
export const useNotesTitle = (page: Route, overlay: Route): string | null => useLibraryStore(state => titleFor(state, page, overlay));

/** The page drawn under a note or a link: where it was opened from, or a sensible default for a deep link. */
export function notesPageUnder(route: Route, background: string | undefined): Route | null {
  if (route.name === 'note') return background ? parseRoute(new URL(background, location.origin).pathname) : { name: 'board', view: 'notes' };
  if (route.name === 'link') {
    if (background) return parseRoute(new URL(background, location.origin).pathname);
    const link = useLibraryStore.getState().links[route.id];
    return link ? { name: 'line', id: link.noteId } : { name: 'lines' };
  }
  return null;
}

export function notesPathOf(route: Route): string {
  switch (route.name) {
    case 'board':
      return pathForView(route.view);
    case 'line':
      return paths.line(route.id);
    case 'lines':
      return paths.lines;
    case 'labels':
      return paths.labels;
    case 'templates':
      return paths.templates;
    case 'template':
      return paths.template(route.id);
    default:
      return paths.board;
  }
}

/** A collection is still there to go back to (not in the bin). */
export function notesStillThere(route: Route): boolean {
  if (route.name !== 'line') return true;
  const line = useLibraryStore.getState().notes[route.id];
  return !!line && line.trashedAt === null;
}

/** What was opened lately, for the spotlight's « Récents »: a collection, a note or a link over its page. */
export function notesOpened(route: Route): string | null {
  if (route.name === 'line') return spotKey('collection', route.id);
  if (route.name === 'note') return spotKey('note', route.id);
  if (route.name === 'link') return spotKey('link', route.id);
  return null;
}

function GlobalNewLine() {
  const open = useNotesUiStore(selectNewLineOpen);
  return <NewLineDialog open={open} onDismiss={() => setNewLineOpen(false)} onCreated={id => navigate(paths.line(id))} />;
}

/** A note or a link over its page, while the route names it; it stays drawn while its layer animates out. */
export function NotesOverlays({ route, pagePath }: { route: Route; pagePath: string }) {
  const note = useLeaving(route.name === 'note' ? route.id : null, OVERLAY_EXIT_MS);
  const link = useLeaving(route.name === 'link' ? route.id : null, OVERLAY_EXIT_MS);
  return (
    <>
      {note.value !== null ? <NoteEditor key={note.value} id={note.value} closing={note.leaving} onClose={() => goBack(pagePath)} /> : null}
      {link.value !== null ? <LinkPanel key={link.value} id={link.value} closing={link.leaving} onClose={() => goBack(pagePath)} /> : null}
      <CaptureDialog />
      <GlobalNewLine />
      <GlobalDeleteLines />
      <TransferPanel />
      <KitchenTimers />
    </>
  );
}
