/**
 * Blocks side by side: a row of columns, each as wide as its share, the gap between two dragged to
 * share them out again. A block dropped beside another makes them; a column emptied goes, and a
 * row left with one column gives its blocks back to the page. Under 720px the columns stack.
 */
import { Fragment, memo, useMemo, type PointerEvent as ReactPointerEvent } from 'react';

import { t } from '@unlease/core/i18n';
import type { Block } from '@unlease/notes/models/blocks';

import { useLibraryStore } from '../../../app/store/library';
import { insertBlock, resizeColumns } from '../../../app/store/pages';
import { BlockList } from './BlockView';
import { editableOutline, focusBlock } from './editorStore';
import { usePageContext } from './PageContext';
import styles from './pages.module.css';

interface Share {
  readonly id: string;
  readonly ratio: number;
}

function Gap({ left, right }: { left: Share; right: Share }) {
  const { page } = usePageContext();
  const drag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    const gap = event.currentTarget;
    const leftNode = gap.previousElementSibling as HTMLElement | null;
    const rightNode = gap.nextElementSibling as HTMLElement | null;
    if (!leftNode || !rightNode) return;
    const start = event.clientX;
    const leftWidth = leftNode.getBoundingClientRect().width;
    const rightWidth = rightNode.getBoundingClientRect().width;
    const total = left.ratio + right.ratio;
    let shares = { left: left.ratio, right: right.ratio };
    const move = (moved: PointerEvent): void => {
      const width = Math.max(80, Math.min(leftWidth + rightWidth - 80, leftWidth + moved.clientX - start));
      shares = { left: (width / (leftWidth + rightWidth)) * total, right: ((leftWidth + rightWidth - width) / (leftWidth + rightWidth)) * total };
      leftNode.style.flexGrow = String(shares.left);
      rightNode.style.flexGrow = String(shares.right);
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      delete gap.dataset.dragging;
      if (shares.left !== left.ratio) resizeColumns(page, [{ id: left.id, ratio: shares.left }, { id: right.id, ratio: shares.right }]);
    };
    gap.dataset.dragging = '';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <div className={styles.columnGap} role="separator" aria-orientation="vertical" aria-label={t('Largeur des colonnes')} onPointerDown={drag} />;
}

/** Under a column's last block: a press writes there, a drop lands there. */
function ColumnTail({ id }: { id: string }) {
  const { page, readOnly } = usePageContext();
  return (
    <div
      className={styles.columnTail}
      data-drop-tail={id}
      onClick={() => {
        if (readOnly) return;
        const blocks = useLibraryStore.getState().blocksByParent[id] ?? [];
        const last = blocks[blocks.length - 1];
        if (last && editableOutline().includes(last) && useLibraryStore.getState().blocks[last]?.text === '') focusBlock(last, 'end');
        else focusBlock(insertBlock(page, id, blocks.length, { kind: 'text', text: '' }), 'start');
      }}
    />
  );
}

function ColumnsBlockComponent({ block, depth }: { block: Block; depth: number }) {
  const { readOnly } = usePageContext();
  const joined = useLibraryStore(s =>
    (s.blocksByParent[block.id] ?? [])
      .flatMap(id => (s.blocks[id]?.kind === 'column' ? [`${id}:${s.blocks[id]!.ratio}`] : []))
      .join(','),
  );
  const shares = useMemo(
    () =>
      (joined ? joined.split(',') : []).map(entry => {
        const [id, ratio] = entry.split(':');
        return { id: id!, ratio: Number(ratio) || 1 };
      }),
    [joined],
  );
  return (
    <div className={styles.columns}>
      {shares.map((share, index) => (
        <Fragment key={share.id}>
          {index > 0 ? readOnly ? <div className={styles.columnGap} aria-hidden="true" /> : <Gap left={shares[index - 1]!} right={share} /> : null}
          <div className={styles.column} style={{ flexGrow: share.ratio }}>
            <BlockList parentId={share.id} depth={depth} />
            <ColumnTail id={share.id} />
          </div>
        </Fragment>
      ))}
    </div>
  );
}

export const ColumnsBlock = memo(ColumnsBlockComponent);
