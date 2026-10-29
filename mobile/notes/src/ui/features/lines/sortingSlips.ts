/**
 * Claude's sorting on the slip: one that waits while Claude works, then what moved, with "Annuler".
 * One sort at a time: a second one asked meanwhile is turned down, so no answer's slip hides another's "Annuler".
 */
import { t, tc, tx } from '@unlease/core/i18n';
import { INBOX_ID, INBOX_TITLE } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';
import { sortedSummary } from '@unlease/notes/services/sorting';
import { fillLine, sortInbox, sortIntoLines, type Sorted } from '@app/sorting';
import type { Undo } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { setSorting, showSnack, useUiStore, type SnackTone } from '@app/store/uiStore';

const titleOf = (id: string): string => (id === INBOX_ID ? t(INBOX_TITLE) : (useLibraryStore.getState().notes[id]?.title ?? ''));
const BUSY = tx('Claude range déjà des liens : réessayez dans un instant');

/** A sort's answer: done when something moved, a warning when part went unread, news when nothing had to move. */
const sortedTone = (sorted: Sorted): SnackTone => (sorted.incomplete ? 'warning' : sorted.moved.length > 0 ? 'success' : 'info');

/** What moved, and what Claude could not read when part of it went unread. */
function summary(sorted: Sorted, nothing: string): string {
  if (sorted.moved.length === 0) return sorted.incomplete ? t('Claude n’a pas pu tout lire : {reason}', { reason: t(sorted.incomplete) }) : nothing;
  const moved = sortedSummary(sorted.moved, titleOf);
  return sorted.incomplete ? t('{moved} (le reste n’a pas pu être lu : {reason})', { moved, reason: t(sorted.incomplete) }) : moved;
}

async function withSlip(working: string, run: () => Promise<Sorted>, done: (sorted: Sorted) => void, failed: (reason: string) => void, busy: () => void = () => showSnack(t(BUSY), undefined, { tone: 'warning' })): Promise<void> {
  if (useUiStore.getState().sorting) {
    busy();
    return;
  }
  setSorting(true);
  showSnack(working, undefined, { sticky: true });
  try {
    done(await run());
  } catch (error) {
    failed(error instanceof Error ? t(error.message) : t('erreur inconnue'));
  } finally {
    setSorting(false);
  }
}

/** "Ranger Non classé". */
export function sortInboxOnSlip(): void {
  void withSlip(
    t('Claude range Non classé…'),
    sortInbox,
    sorted => {
      const message = summary(sorted, t('Rien dans Non classé ne va clairement dans une collection'));
      showSnack(message, sorted.moved.length > 0 ? { label: tc('undo', 'Annuler'), run: sorted.undo } : undefined, { tone: sortedTone(sorted) });
    },
    reason => showSnack(t('Claude n’a pas pu ranger Non classé : {reason}', { reason }), undefined, { tone: 'error' }),
  );
}

/** A new collection takes what belongs in it from "Non classé". */
export function fillLineOnSlip(lineId: string): void {
  const title = titleOf(lineId);
  void withSlip(
    t('Claude cherche dans Non classé ce qui va dans {collection}…', { collection: title }),
    () => fillLine(lineId),
    sorted => {
      const message = summary(sorted, t('Rien dans Non classé ne va dans {collection}', { collection: title }));
      showSnack(message, sorted.moved.length > 0 ? { label: tc('undo', 'Annuler'), run: sorted.undo } : undefined, { tone: sortedTone(sorted) });
    },
    reason => showSnack(t('Claude n’a pas pu chercher de liens pour {collection} : {reason}', { collection: title, reason }), undefined, { tone: 'error' }),
  );
}

/**
 * "Les ranger avec Claude": the collections are gone and their links wait in "Non classé"; one
 * "Annuler" takes all of it back. `deleted` opens each slip ("Collection supprimée").
 */
export function sortDeletedLinksOnSlip(linkIds: readonly string[], undoDelete: Undo, deleted: string): void {
  const lead = t(deleted);
  const kept = t('{deleted} : {links} dans Non classé', { deleted: lead, links: plural(linkIds.length, 'lien') });
  void withSlip(
    linkIds.length === 1 ? t('{deleted}. Claude range son lien…', { deleted: lead }) : t('{deleted}. Claude range les {count} liens…', { deleted: lead, count: linkIds.length }),
    () => sortIntoLines(linkIds),
    sorted => {
      const left = linkIds.length - sorted.moved.length;
      const moved = sortedSummary(sorted.moved, titleOf);
      const where = sorted.moved.length === 0 ? t('{links} dans Non classé', { links: plural(left, 'lien') }) : left > 0 ? t('{moved}, {count} dans Non classé', { moved, count: left }) : moved;
      const message = sorted.incomplete ? t('{deleted} : {where} (Claude n’a pas pu tout lire : {reason})', { deleted: lead, where, reason: t(sorted.incomplete) }) : t('{deleted} : {where}', { deleted: lead, where });
      showSnack(message, { label: tc('undo', 'Annuler'), run: undoDelete }, { tone: sorted.incomplete ? 'warning' : 'success' });
    },
    reason => showSnack(t('{deleted}. Claude n’a pas pu ranger les liens ({reason}) : ils sont dans Non classé.', { deleted: lead, reason }), { label: tc('undo', 'Annuler'), run: undoDelete }, { tone: 'warning' }),
    () => showSnack(t('{kept} (Claude range déjà d’autres liens)', { kept }), { label: tc('undo', 'Annuler'), run: undoDelete }, { tone: 'warning' }),
  );
}
