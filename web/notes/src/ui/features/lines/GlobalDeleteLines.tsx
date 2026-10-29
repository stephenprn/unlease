/**
 * Where a selection's collections send their links when it is deleted (the selection bar's
 * "Supprimer", or the "#" key): asked here, at the app's root, from `deleteLines` in the UI store.
 */
import { useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { INBOX_ID, INBOX_TITLE, shownTitle } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';

import { trashLines } from '../../../app/store/actions';
import { clearSelection } from '../../../app/store/board';
import { useLibraryStore } from '../../../app/store/library';
import { closeDeleteLines, selectDeleteLines, showUndo, useUiStore } from '../../../app/store/ui';
import { DeleteLineDialog, type LinksFate } from './DeleteLineDialog';
import { MoveDialog } from './MoveDialog';
import { sortDeletedLinksOnSlip } from './sortingSlips';

export function GlobalDeleteLines() {
  const { ids, open } = useUiStore(selectDeleteLines);
  const [picking, setPicking] = useState(false);
  /** The notes go to the bin; the links of their collections where the person said. */
  const remove = (fate: LinksFate): void => {
    const { notes, linksByNote } = useLibraryStore.getState();
    const links = ids.flatMap(id => (notes[id]?.kind === 'links' ? (linksByNote[id] ?? []) : []));
    const deleted = ids.length > 1 ? tx('Notes supprimées') : tx('Collection supprimée');
    clearSelection();
    if (fate.kind === 'bin') {
      showUndo(ids.length > 1 ? t('Notes placées dans la corbeille') : t('Note placée dans la corbeille'), trashLines(ids, null));
    } else if (fate.kind === 'move') {
      const undo = trashLines(ids, fate.to);
      const target = notes[fate.to];
      const name = fate.to === INBOX_ID ? t(INBOX_TITLE) : target ? shownTitle(target) : '';
      showUndo(t('{deleted} : {links} dans {collection}', { deleted: t(deleted), links: plural(links.length, 'lien déplacé', 'liens déplacés'), collection: name }), undo);
    } else {
      sortDeletedLinksOnSlip(links, trashLines(ids, INBOX_ID), deleted);
    }
  };
  return (
    <>
      <DeleteLineDialog ids={ids} open={open} onDismiss={closeDeleteLines} onChoose={remove} onPickLine={() => setPicking(true)} />
      <MoveDialog open={picking} currentLineId={null} exclude={ids} title={t('Déplacer les liens vers')} onDismiss={() => setPicking(false)} onPick={target => remove({ kind: 'move', to: target })} />
    </>
  );
}
