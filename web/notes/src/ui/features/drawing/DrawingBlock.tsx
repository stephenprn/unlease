/**
 * A page's drawing: its strokes at the column's width in a frame, as the page's other media, and a
 * quiet invitation while nothing is drawn. A click (or Enter on it) opens the drawing editor: a
 * dialog as large as a drawing wants (the phone's sheet under 720px) with the note's canvas and
 * tools, each stroke saved in the page's undo as it is drawn. A page in the bin only shows it.
 */
import { memo, useCallback, useId, useRef, type DragEvent, type RefObject } from 'react';
import { create } from 'zustand';

import { t } from '@unlease/core/i18n';
import type { Block } from '@unlease/notes/models/blocks';

import { useLibraryStore } from '../../../app/store/library';
import { saveBlockText } from '../../../app/store/pages';
import { Button } from '../../components/Button';
import { DialogFrame } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { Layer } from '../../components/Layer';
import { usePageContext } from '../pages/PageContext';
import { DrawingCanvas } from './DrawingCanvas';
import styles from './drawing.module.css';
import { DrawingTools } from './DrawingTools';
import { DrawingArt } from './StrokeArt';
import { strokesOf } from './strokes';
import { useDrawingSession } from './useDrawingSession';

/** The drawing block open in the editor, and its page. */
const useOpenDrawing = create<{ readonly open: { readonly page: string; readonly block: string } | null }>(() => ({ open: null }));

/** A file held over the editor goes nowhere: not into the drawing, nor through the dialog into the page behind it. */
function refuseFiles(event: DragEvent<HTMLDivElement>): void {
  if (![...event.dataTransfer.types].includes('Files')) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = 'none';
}

/** Opens the drawing editor on a page's drawing block (just made from « / », or clicked). */
export function openDrawingEditor(page: string, blockId: string): void {
  useOpenDrawing.setState({ open: { page, block: blockId } });
}

function BlockDrawingEditor({ page, blockId, titleId, chosen, onDone }: { page: string; blockId: string; titleId: string; chosen: RefObject<HTMLButtonElement | null>; onDone: () => void }) {
  const stored = useLibraryStore(s => s.blocks[blockId]?.drawing ?? '');
  const save = useCallback((since: string, typed: string) => saveBlockText(page, blockId, since, typed, {}, 'drawing'), [page, blockId]);
  const session = useDrawingSession(stored, save);
  return (
    <div className={styles.dialogKeys} onKeyDown={session.onKeyDown}>
      <DialogFrame
        title={t('Dessin')}
        titleId={titleId}
        onClose={onDone}
        className={styles.dialogFrame}
        foot={
          <>
            <DrawingTools className={styles.dialogTools} chosenRef={chosen} canUndo={session.canUndo} canRedo={session.canRedo} canClear={session.strokes.length > 0} onUndo={session.undo} onRedo={session.redo} onClear={session.clear} />
            <Button onClick={onDone}>{t('Terminé')}</Button>
          </>
        }
      >
        <div className={styles.dialogCanvas} data-outline="frame" data-edge="">
          <DrawingCanvas strokes={session.strokes} editable label={t('Zone de dessin')} onGesture={session.onGesture} onStroke={session.onStroke} onErase={session.onErase} />
        </div>
      </DialogFrame>
    </div>
  );
}

function DrawingBlockComponent({ block }: { block: Block }) {
  const { page, readOnly } = usePageContext();
  const open = useOpenDrawing(s => s.open !== null && s.open.block === block.id && s.open.page === page);
  const titleId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const chosen = useRef<HTMLButtonElement>(null);
  const strokes = strokesOf(block.drawing);
  const empty = strokes.length === 0;

  const close = useCallback(() => {
    useOpenDrawing.setState({ open: null });
    // Opened from « / », the field it was typed in is gone: the focus comes back to the drawing.
    requestAnimationFrame(() => {
      if (!document.activeElement || document.activeElement === document.body) button.current?.focus({ preventScroll: true });
    });
  }, []);

  const content = empty ? (
    <span className={styles.invite}>
      <Icon name="draw" size={24} />
      <span className="t-body">{readOnly ? t('Dessin vide') : t('Cliquez pour dessiner')}</span>
    </span>
  ) : (
    <DrawingArt strokes={strokes} />
  );

  if (readOnly) {
    return empty ? (
      <div className={styles.blockEmpty} data-outline="panel">
        {content}
      </div>
    ) : (
      <div className={styles.blockFrame} data-outline="frame" data-edge="" role="img" aria-label={t('Dessin')}>
        {content}
      </div>
    );
  }
  return (
    <>
      {/* The frame is clipped to its outline, its own focus ring with it: the wrapper draws the ring. */}
      <div className={styles.blockWrap} data-empty={empty || undefined}>
        <button
          ref={button}
          type="button"
          className={empty ? styles.blockEmpty : styles.blockFrame}
          data-outline={empty ? 'panel' : 'frame'}
          data-edge={empty ? undefined : ''}
          aria-label={empty ? undefined : t('Modifier le dessin')}
          aria-haspopup="dialog"
          onClick={() => openDrawingEditor(page, block.id)}
        >
          {content}
        </button>
      </div>
      {/* The dialog is drawn in a layer, but its events go up through this block to the page's own: a file dropped on it stops here. */}
      <div className={styles.dialogHost} onDragOver={refuseFiles} onDrop={refuseFiles}>
        <Layer open={open} onDismiss={close} labelledBy={titleId} initialFocus={chosen}>
          <BlockDrawingEditor page={page} blockId={block.id} titleId={titleId} chosen={chosen} onDone={close} />
        </Layer>
      </div>
    </>
  );
}

export const DrawingBlock = memo(DrawingBlockComponent);
