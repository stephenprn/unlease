/**
 * The picked notes' colour and paper, from the selection bar: the note editor's own sheet
 * (`NoteColorSheet`), showing what they share or nothing chosen where they differ; each choice is one
 * batch on all of them (`setFinish`), said on the slip with « Annuler ». A collection wears a pigment
 * only: picked alone, collections get their own swatches (a collection's, as its sheet shows them);
 * mixed with notes, the sheet says what they take, and the slip says when only the notes took it.
 * The selection stays, so the colour and then the paper can be changed in a row; each is its own undo.
 */
import React, { useRef } from 'react';
import { StyleSheet } from 'react-native';

import { t, tc } from '@unlease/core/i18n';
import { isLineColor } from '@unlease/design/colors';
import { pickedFinish, type Finish } from '@unlease/notes/services/finishes';
import { setFinish } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';

import { Sheet, SHEET_INSET, SheetScroll } from '../../components';
import { LineColorPicker } from '@shared/ui/components/LineColorPicker';
import { NoteColorSheet } from '../note/NoteColorSheet';

/** Only collections picked: a colour alone. */
export function onlyCollections(ids: readonly string[]): boolean {
  const { notes } = useLibraryStore.getState();
  return ids.length > 0 && ids.every(id => notes[id]?.kind === 'links');
}

export function BulkColorSheet({ visible, ids, onDismiss }: { visible: boolean; ids: readonly string[]; onDismiss: () => void }) {
  const notes = useLibraryStore(s => s.notes);
  const picked = ids.flatMap(id => (notes[id] && notes[id]!.deletedAt === null ? [notes[id]!] : []));
  const shared = pickedFinish(picked);
  // Which sheet, held while it leaves (the selection may be gone by then).
  const collections = useRef(false);
  if (picked.length > 0) collections.current = shared.notes === 0;

  const apply = (finish: Finish): void => {
    const { undo, changed, kept } = setFinish(ids, finish);
    if (changed === 0) return;
    const message = 'color' in finish ? (kept > 0 ? t('Couleur changée sur les notes') : t('Couleur changée')) : kept > 0 ? t('Papier changé sur les notes') : t('Papier changé');
    showSnack(message, { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  };

  if (collections.current) {
    return (
      <Sheet visible={visible} onDismiss={onDismiss} title={t('Couleur')}>
        <SheetScroll contentContainerStyle={styles.pigments}>
          <LineColorPicker value={isLineColor(shared.color) ? shared.color : null} onChange={next => next && apply({ color: next })} accessibilityLabel={t('Couleur')} />
        </SheetScroll>
      </Sheet>
    );
  }
  return (
    <NoteColorSheet
      visible={visible}
      color={shared.color}
      pattern={shared.pattern}
      note={shared.collections > 0 ? t('Les collections ne prennent qu’une couleur, ni dégradé ni papier.') : undefined}
      onDismiss={onDismiss}
      onColor={color => apply({ color })}
      onPattern={pattern => apply({ pattern })}
    />
  );
}

const styles = StyleSheet.create({
  // The swatches on the sheet's column, under its title.
  pigments: { paddingHorizontal: SHEET_INSET, paddingBottom: 16 },
});
