/**
 * Claude's sorting on the slip: one that waits while Claude works, then what moved, with "Annuler".
 * One sort at a time: a second one asked meanwhile is turned down, so no answer's slip hides another's "Annuler".
 */
import { t, tx } from '@unlease/core/i18n';
import { INBOX_ID, INBOX_SHOWN_TITLE } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';
import { sortedSummary } from '@unlease/notes/services/sorting';

import { fillLine, sortInbox, sortIntoLines, type Sorted } from '../../../app/sorting';
import type { Undo } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { showError, showSnack, showWarning, type SnackTone } from '@shared/app/store/ui';
import { setSorting, useNotesUiStore } from '../../../app/store/notesUi';

const titleOf = (id: string): string => (id === INBOX_ID ? t(INBOX_SHOWN_TITLE) : (useLibraryStore.getState().notes[id]?.title ?? ''));
const BUSY = tx('Claude is already sorting links: try again in a moment');

/** A sort's answer: done when something moved, a caveat when part went unread, news otherwise. */
const sortedTone = (sorted: Sorted): SnackTone => (sorted.incomplete ? 'warning' : sorted.moved.length > 0 ? 'success' : 'info');

/** What moved, and what Claude could not read when part of it went unread. */
function summary(sorted: Sorted, nothing: string): string {
  if (sorted.moved.length === 0) return sorted.incomplete ? t('Claude couldn’t read everything: {reason}', { reason: t(sorted.incomplete) }) : nothing;
  const moved = sortedSummary(sorted.moved, titleOf);
  return sorted.incomplete ? t('{summary} (the rest couldn’t be read: {reason})', { summary: moved, reason: t(sorted.incomplete) }) : moved;
}

async function withSlip(working: string, run: () => Promise<Sorted>, done: (sorted: Sorted) => void, failed: (reason: string) => void, busy: () => void = () => showWarning(t(BUSY))): Promise<void> {
  if (useNotesUiStore.getState().sorting) {
    busy();
    return;
  }
  setSorting(true);
  showSnack(working, undefined, { sticky: true });
  try {
    done(await run());
  } catch (error) {
    failed(error instanceof Error ? t(error.message) : t('unknown error'));
  } finally {
    setSorting(false);
  }
}

/** "Ranger Non classé". */
export function sortInboxOnSlip(): void {
  void withSlip(
    t('Claude is sorting Unsorted…'),
    sortInbox,
    sorted => {
      const message = summary(sorted, t('Nothing in Unsorted clearly belongs in a collection'));
      showSnack(message, sorted.moved.length > 0 ? { label: t('Undo'), run: sorted.undo } : undefined, { tone: sortedTone(sorted) });
    },
    reason => showError(t('Claude couldn’t sort Unsorted: {reason}', { reason })),
  );
}

/** A new collection takes what belongs in it from "Non classé". */
export function fillLineOnSlip(lineId: string): void {
  const title = titleOf(lineId);
  void withSlip(
    t('Claude is looking in Unsorted for what belongs in {collection}…', { collection: title }),
    () => fillLine(lineId),
    sorted => {
      const message = summary(sorted, t('Nothing in Unsorted belongs in {collection}', { collection: title }));
      showSnack(message, sorted.moved.length > 0 ? { label: t('Undo'), run: sorted.undo } : undefined, { tone: sortedTone(sorted) });
    },
    reason => showError(t('Claude couldn’t look for links for {collection}: {reason}', { collection: title, reason })),
  );
}

/**
 * "Les ranger avec Claude": the collections are gone and their links wait in "Non classé"; one
 * "Annuler" takes all of it back. `deleted` opens each slip ("Collection supprimée", in French: translated here).
 */
export function sortDeletedLinksOnSlip(linkIds: readonly string[], undoDelete: Undo, deleted: string): void {
  const opening = t(deleted);
  const kept = t('{deleted}: {links} in Unsorted', { deleted: opening, links: plural(linkIds.length, 'link') });
  void withSlip(
    linkIds.length === 1 ? t('{deleted}. Claude is filing its link…', { deleted: opening }) : t('{deleted}. Claude is filing the {count} links…', { deleted: opening, count: linkIds.length }),
    () => sortIntoLines(linkIds),
    sorted => {
      const left = linkIds.length - sorted.moved.length;
      const moved = sortedSummary(sorted.moved, titleOf);
      const where = sorted.moved.length === 0 ? t('{links} in Unsorted', { links: plural(left, 'link') }) : left > 0 ? t('{summary}, {count} in Unsorted', { summary: moved, count: left }) : moved;
      const message = sorted.incomplete ? t('{deleted}: {where} (Claude couldn’t read everything: {reason})', { deleted: opening, where, reason: t(sorted.incomplete) }) : t('{deleted}: {where}', { deleted: opening, where });
      showSnack(message, { label: t('Undo'), run: undoDelete }, { tone: sorted.incomplete ? 'warning' : 'success' });
    },
    reason => showWarning(t('{deleted}. Claude couldn’t file the links ({reason}): they are in Unsorted.', { deleted: opening, reason }), { label: t('Undo'), run: undoDelete }),
    () => showWarning(t('{kept} (Claude is already sorting other links)', { kept }), { label: t('Undo'), run: undoDelete }),
  );
}
