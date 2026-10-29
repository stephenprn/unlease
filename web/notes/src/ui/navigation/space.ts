/**
 * The app's two spaces: the notes (the board, reminders, collections, labels, the archive) and the
 * pages (the knowledge base). The navigation shows one at a time; the places both share (the bin,
 * the settings, search results, which read notes and pages alike) keep the space they were reached
 * from.
 */
import { selectQuery, useBoardStore } from '../../app/store/board';
import { useLibraryStore } from '../../app/store/library';
import { SPACE_HOMES, useNavUiStore, type Space } from '../../app/store/navUi';
import { parseRoute, type Route } from '../router';

/** The space a place belongs to, or null for one both share. */
export function spaceOf(route: Route, searching: boolean): Space | null {
  switch (route.name) {
    case 'pages':
    case 'page':
      return 'pages';
    case 'board':
      return route.view === 'trash' || searching ? null : 'notes';
    case 'line':
    case 'lines':
    case 'labels':
      return 'notes';
    default:
      return null;
  }
}

/** The space the navigation shows for `route`. */
export function useSpace(route: Route): Space {
  const searching = useBoardStore(s => selectQuery(s).length > 0);
  const remembered = useNavUiStore(s => s.space);
  return spaceOf(route, searching) ?? remembered;
}

/** Where switching to `space` lands: the last place shown there, or the space's home once that place is gone. */
export function spaceTarget(space: Space, lastPath: Readonly<Record<Space, string>> = useNavUiStore.getState().lastPath): string {
  const path = lastPath[space];
  const route = parseRoute(path);
  if (spaceOf(route, false) !== space) return SPACE_HOMES[space];
  const { blocks, notes } = useLibraryStore.getState();
  if (route.name === 'page') {
    const page = blocks[route.id];
    return page && page.kind === 'page' && page.trashedAt === null ? path : SPACE_HOMES.pages;
  }
  if (route.name === 'line') {
    const line = notes[route.id];
    return line && line.trashedAt === null ? path : SPACE_HOMES.notes;
  }
  return path;
}
