/**
 * A drawing note's sheet in its editor: the canvas edge to edge under the title, on the note's wash
 * and paper, and its tools docked at the sheet's foot above the editor's own bar, where they stay
 * while a tall drawing scrolls under them. Each stroke is saved as it is drawn or erased.
 */
import { useCallback } from 'react';

import { t } from '@unlease/core/i18n';

import { saveTypedText } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { DrawingCanvas } from './DrawingCanvas';
import styles from './drawing.module.css';
import { DrawingTools } from './DrawingTools';
import { useDrawingSession } from './useDrawingSession';

export function DrawingSheet({ noteId, editable }: { noteId: string; editable: boolean }) {
  const stored = useLibraryStore(s => s.notes[noteId]?.drawing ?? '');
  const save = useCallback((since: string, typed: string) => saveTypedText('note', noteId, 'drawing', since, typed), [noteId]);
  const session = useDrawingSession(stored, save);
  return (
    <div className={styles.sheet} onKeyDown={editable ? session.onKeyDown : undefined}>
      <DrawingCanvas strokes={session.strokes} editable={editable} label={editable ? t('Zone de dessin') : t('Dessin')} onGesture={session.onGesture} onStroke={session.onStroke} onErase={session.onErase} />
      {editable ? (
        <div className={styles.dock}>
          <DrawingTools canUndo={session.canUndo} canRedo={session.canRedo} canClear={session.strokes.length > 0} onUndo={session.undo} onRedo={session.redo} onClear={session.clear} />
        </div>
      ) : null}
    </div>
  );
}
