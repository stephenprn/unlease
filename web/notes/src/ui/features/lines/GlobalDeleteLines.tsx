/**
 * Where a selection's collections send their links when it is deleted (the selection bar's
 * "Supprimer", or the "#" key): asked here, at the app's root, from `deleteLines` in the UI store.
 */
import { useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { INBOX_ID, INBOX_SHOWN_TITLE, shownTitle } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';

import { trashLines } from '../../../app/store/actions';
import { clearSelection } from '../../../app/store/board';
import { useLibraryStore } from '../../../app/store/library';
import { showUndo } from '@shared/app/store/ui';
import { closeDeleteLines, selectDeleteLines, useNotesUiStore } from '../../../app/store/notesUi';
import { DeleteLineDialog, type LinksFate } from './DeleteLineDialog';
import { MoveDialog } from './MoveDialog';
import { sortDeletedLinksOnSlip } from './sortingSlips';

export function GlobalDeleteLines() {
  const { ids, open } = useNotesUiStore(selectDeleteLines);
  const [picking, setPicking] = useState(false);
  /** The notes go to the bin; the links of their collections where the person said. */
  const remove = (fate: LinksFate): void => {
    const { notes, linksByNote } = useLibraryStore.getState();
    const links = ids.flatMap(id => (notes[id]?.kind === 'links' ? (linksByNote[id] ?? []) : []));
    const deleted = ids.length > 1 ? tx('Notes deleted') : tx('Collection deleted');
    clearSelection();
    if (fate.kind === 'bin') {
      showUndo(ids.length > 1 ? t('Notes moved to the bin') : t('Note moved to the bin'), trashLines(ids, null));
    } else if (fate.kind === 'move') {
      const undo = trashLines(ids, fate.to);
      const target = notes[fate.to];
      const name = fate.to === INBOX_ID ? t(INBOX_SHOWN_TITLE) : target ? shownTitle(target) : '';
      showUndo(t('{deleted}: {links} to {collection}', { deleted: t(deleted), links: plural(links.length, 'link moved', 'links moved'), collection: name }), undo);
    } else {
      sortDeletedLinksOnSlip(links, trashLines(ids, INBOX_ID), deleted);
    }
  };
  return (
    <>
      <DeleteLineDialog ids={ids} open={open} onDismiss={closeDeleteLines} onChoose={remove} onPickLine={() => setPicking(true)} />
      <MoveDialog open={picking} currentLineId={null} exclude={ids} title={t('Move the links to')} onDismiss={() => setPicking(false)} onPick={target => remove({ kind: 'move', to: target })} />
    </>
  );
}
