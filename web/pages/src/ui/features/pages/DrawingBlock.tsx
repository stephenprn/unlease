/**
 * A page's drawing: its strokes at the column's width in a frame, as the page's other media, on its
 * background (« Fond », in its block's `color`: the plain paper until another is chosen, a pigment's
 * wash, or none, the page showing through), and
 * a quiet invitation while nothing is drawn. A click (or Enter on it) opens the drawing editor: a
 * dialog as large as a drawing wants (the phone's sheet under 720px) with the note's canvas and
 * tools, each stroke and the background saved in the page's undo as they change. A page in the bin
 * only shows it.
 */
import { memo, useCallback, useId, useRef, type DragEvent, type RefObject } from 'react';
import { create } from 'zustand';

import { t } from '@unlease/core/i18n';
import { DRAWING_NONE, drawingBackgroundOf, type DrawingBackground } from '@unlease/notes/models/drawing';
import type { Block } from '@unlease/pages/models/blocks';

import { useBlocksStore } from '../../../app/store/blocks';
import { saveBlockText, updateBlock } from '../../../app/store/pages';
import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { Icon } from '@shared/ui/components/Icon';
import { Layer } from '@shared/ui/components/Layer';
import { usePageContext } from './PageContext';
import { DrawingCanvas } from '@notes/ui/features/drawing/DrawingCanvas';
import { backgroundPaint } from '@notes/ui/features/drawing/DrawingBackground';
import styles from '@notes/ui/features/drawing/drawing.module.css';
import { DrawingTools } from '@notes/ui/features/drawing/DrawingTools';
import { DrawingArt } from '@notes/ui/features/drawing/StrokeArt';
import { strokesOf } from '@notes/ui/features/drawing/strokes';
import { useDrawingSession } from '@notes/ui/features/drawing/useDrawingSession';

/** A drawing block's background (its `color`): the plain paper until another is chosen. */
const blockBackground = (block: Pick<Block, 'color'> | undefined): DrawingBackground => drawingBackgroundOf(block?.color);

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
  const stored = useBlocksStore(s => s.blocks[blockId]?.drawing ?? '');
  const background = useBlocksStore(s => blockBackground(s.blocks[blockId]));
  const save = useCallback((since: string, typed: string) => saveBlockText(page, blockId, since, typed, {}, 'drawing'), [page, blockId]);
  const session = useDrawingSession(stored, save);
  const setBackground = useCallback((color: DrawingBackground) => updateBlock(page, blockId, { color }), [page, blockId]);
  return (
    <div className={styles.dialogKeys} onKeyDown={session.onKeyDown}>
      <DialogFrame
        title={t('Drawing')}
        titleId={titleId}
        onClose={onDone}
        className={styles.dialogFrame}
        foot={
          <>
            <DrawingTools className={styles.dialogTools} chosenRef={chosen} background={{ value: background, onChange: setBackground }} canUndo={session.canUndo} canRedo={session.canRedo} canClear={session.strokes.length > 0} onUndo={session.undo} onRedo={session.redo} onClear={session.clear} />
            <Button onClick={onDone}>{t('Done')}</Button>
          </>
        }
      >
        <div className={background === DRAWING_NONE ? styles.dialogCanvas : `${styles.dialogCanvas} paper`} data-outline="frame" data-edge="" {...backgroundPaint(background)}>
          <DrawingCanvas strokes={session.strokes} editable label={t('Drawing area')} onGesture={session.onGesture} onStroke={session.onStroke} onErase={session.onErase} />
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
  const background = blockBackground(block);
  const framed = background === DRAWING_NONE ? styles.blockFrame : `${styles.blockFrame} paper`;

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
      <span className="t-body">{readOnly ? t('Empty drawing') : t('Click to draw')}</span>
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
      <div className={framed} data-outline="frame" data-edge="" {...backgroundPaint(background)} role="img" aria-label={t('Drawing')}>
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
          className={empty ? styles.blockEmpty : framed}
          data-outline={empty ? 'panel' : 'frame'}
          data-edge={empty ? undefined : ''}
          {...(empty ? {} : backgroundPaint(background))}
          aria-label={empty ? undefined : t('Edit the drawing')}
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
