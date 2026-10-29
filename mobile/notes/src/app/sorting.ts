/**
 * Claude sorting links already saved (`POST /api/sort`): the app asks, then writes the answer as
 * one undoable batch. Each call throws `SyncError` with the interface’s words when it cannot be done; an
 * answer can also come back `incomplete` (part of the links went unread), with the moves of the rest.
 */
import { t } from '@unlease/core/i18n';
import { INBOX_ID, type LinkItem } from '@unlease/notes/models/entities';
import { capTargets, inboxToSort, sortable, sortLink, sortTargets } from '@unlease/notes/services/sorting';
import { SORT_LIMITS, type SortMove, type SortResponse, type SortTarget, type SortTask } from '@unlease/notes/sync/sorting';

import { linesOf } from './hooks/useLines';
import { applyMoves, type Undo } from './store/actions';
import { useLibraryStore } from './store/libraryStore';
import { useSettingsStore } from './store/settingsStore';
import { sortLinks, SyncError } from './sync/transport';

export interface Sorted {
  readonly moved: readonly SortMove[];
  readonly undo: Undo;
  readonly incomplete: string | null;
}

export interface Review {
  readonly moves: readonly SortMove[];
  readonly incomplete: string | null;
}

const NOTHING: Sorted = { moved: [], undo: () => {}, incomplete: null };

/** The live links of a collection, in its order. */
export function linksIn(lineId: string): LinkItem[] {
  const { linksByNote, links } = useLibraryStore.getState();
  return (linksByNote[lineId] ?? []).map(id => links[id]).filter((link): link is LinkItem => link !== undefined);
}

/** Every live collection but "Non classé", as Claude reads them. */
function targets(): SortTarget[] {
  const { noteOrder, notes, links } = useLibraryStore.getState();
  return sortTargets(
    linesOf(noteOrder, notes).filter(line => line.id !== INBOX_ID),
    Object.values(links),
  );
}

async function ask(task: SortTask, from: string | null, into: readonly SortTarget[], links: readonly LinkItem[], signal?: AbortSignal): Promise<SortResponse> {
  const server = useSettingsStore.getState().server;
  if (!server) throw new SyncError('network', t('Aucun serveur n’est connecté'));
  return sortLinks(server, { task, from, targets: capTargets(into, from), links: links.slice(0, SORT_LIMITS.links).map(sortLink) }, signal);
}

/** Claude files the links of `from` it is sure about into `into`; the others stay. */
async function file(from: string, links: readonly LinkItem[], into: readonly SortTarget[]): Promise<Sorted> {
  if (links.length === 0 || into.length === 0) return NOTHING;
  const { moves, incomplete } = await ask('file', null, into, links);
  return { ...applyMoves(from, moves, 'claude'), incomplete };
}

/** "Ranger Non classé": every link in it but those the person put there. */
export function sortInbox(): Promise<Sorted> {
  return file(INBOX_ID, inboxToSort(linksIn(INBOX_ID)), targets());
}

/** A new collection takes the links of "Non classé" that clearly belong in it. */
export function fillLine(lineId: string): Promise<Sorted> {
  return file(
    INBOX_ID,
    linksIn(INBOX_ID).filter(sortable),
    targets().filter(target => target.id === lineId),
  );
}

/** The links of deleted collections, already moved to "Non classé", into the collections left. */
export function sortIntoLines(linkIds: readonly string[]): Promise<Sorted> {
  const ids = new Set(linkIds);
  return file(INBOX_ID, linksIn(INBOX_ID).filter(link => ids.has(link.id) && sortable(link)), targets());
}

/** "Vérifier les liens": Claude's moves for the links that no longer belong in a collection, not written yet. */
export async function reviewLine(lineId: string, signal?: AbortSignal): Promise<Review> {
  const links = linksIn(lineId).filter(sortable);
  // Its own links are all listed: its examples would only repeat them, misfits included.
  const into = targets().map(target => (target.id === lineId ? { ...target, examples: [] } : target));
  if (links.length === 0 || !into.some(target => target.id === lineId)) return { moves: [], incomplete: null };
  return ask('review', lineId, into, links, signal);
}

/** The moves of a review the person kept: their choice now. */
export function applyReview(lineId: string, moves: readonly SortMove[]): Sorted {
  return { ...applyMoves(lineId, moves, 'person'), incomplete: null };
}
