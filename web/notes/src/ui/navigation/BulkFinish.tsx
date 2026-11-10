/**
 * « Couleur et papier » for the picked notes, in the selection bar, as the phone's: the note's own
 * picker (`NoteFinishPicker`), showing what they share or nothing chosen where they differ; each
 * choice is one batch on all of them (`setFinish`), said on the slip with « Annuler ». A collection
 * wears a pigment only: picked alone, collections get their own swatches (« Couleur », as their
 * sheet shows them); mixed with notes, the picker says what they take, and the slip says when only
 * the notes took it. The selection stays, so the colour and then the paper can be changed in a row.
 */
import { useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { isLineColor } from '@unlease/design/colors';
import { pickedFinish, type Finish } from '@unlease/notes/services/finishes';

import { setFinish } from '../../app/store/actions';
import { useLibraryStore } from '../../app/store/library';
import { showUndo } from '@shared/app/store/ui';
import { IconButton } from '@shared/ui/components/IconButton';
import { Popover } from '@shared/ui/components/Popover';
import { NARROW, useMedia } from '@shared/ui/useMedia';
import { LineColorPicker } from '../features/lines/LineColorPicker';
import { NoteFinishPicker } from '../features/note/NoteFinishPicker';
import styles from './bulkFinish.module.css';

export function BulkFinish({ ids, shape }: { ids: readonly string[]; shape: number }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const narrow = useMedia(NARROW);
  const notes = useLibraryStore(s => s.notes);
  const picked = ids.flatMap(id => (notes[id] && notes[id]!.deletedAt === null ? [notes[id]!] : []));
  const shared = pickedFinish(picked);
  const collections = picked.length > 0 && shared.notes === 0;
  const label = collections ? t('Couleur') : t('Couleur et papier');

  const apply = (finish: Finish): void => {
    const { undo, changed, kept } = setFinish(ids, finish);
    if (changed === 0) return;
    showUndo('color' in finish ? (kept > 0 ? t('Couleur changée sur les notes') : t('Couleur changée')) : kept > 0 ? t('Papier changé sur les notes') : t('Papier changé'), undo);
  };

  return (
    <>
      <IconButton ref={anchor} icon="palette" label={label} shape={shape} hasPopup="dialog" expanded={open} onClick={() => setOpen(true)} />
      <Popover open={open} anchor={anchor} onDismiss={() => setOpen(false)} label={label} align="end" width={collections ? 360 : 344}>
        <div className={styles.picker}>
          {/* A sheet on a phone, away from its button, says what it holds; by its button, its groups do. */}
          {narrow ? <h2 className={`${styles.title} t-title`}>{label}</h2> : null}
          <div className={collections ? `${styles.body} ${styles.lines}` : styles.body}>
            {collections ? (
              <LineColorPicker value={isLineColor(shared.color) ? shared.color : null} onChange={next => next && apply({ color: next })} label={t('Couleur')} />
            ) : (
              <>
                {shared.collections > 0 ? <p className={`${styles.note} t-meta`}>{t('Les collections ne prennent qu’une couleur, ni dégradé ni papier.')}</p> : null}
                <NoteFinishPicker color={shared.color} pattern={shared.pattern} onColor={color => apply({ color })} onPattern={pattern => apply({ pattern })} />
              </>
            )}
          </div>
        </div>
      </Popover>
    </>
  );
}
