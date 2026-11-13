/**
 * A page's blocks, drawn one inside another as they nest. Each block has, to its left under a
 * hovering pointer, a "+" that adds a block under it and a grip that drags it (or several selected
 * blocks) and opens its menu. Text kinds are typed in place (`RichText`); a list item carries its
 * mark, a task its box, a toggle its chevron, a callout its wash and emoji; the others draw
 * themselves (code, table, media, bookmark, embed, columns), with their caption under them.
 */
import { memo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { CAPTION_KINDS, canNest, UNTITLED_PAGE, type Block, type BlockKind } from '@unlease/pages/models/blocks';
import { bulletMark, isWithin, listDepth, listNumber, numberLabel } from '@unlease/pages/services/blocks';
import { plural } from '@unlease/core/services/format';
import { markupToPlain } from '@unlease/core/services/richText';
import { dateWords } from '@unlease/core/services/dates';
import { isLineColor } from '@unlease/design/colors';

import { mentionLabel } from '../../../app/hooks/usePages';
import { useBlocksStore } from '../../../app/store/blocks';
import { insertAfter, insertBlock, updateBlock } from '../../../app/store/pages';
import { setToggleOpen, usePagesUiStore } from '../../../app/store/pagesUi';
import { Checkbox } from '@shared/ui/components/Checkbox';
import { Icon } from '@shared/ui/components/Icon';
import { browserPath, isPlainClick, navigate } from '@shared/ui/router';
import { paths } from '../../routes';
import { BlockMenu } from './BlockMenu';
import { Caption } from './Caption';
import { ImmichBlock } from './ImmichBlock';
import { CodeBlock } from './CodeBlock';
import { ColumnsBlock } from './ColumnsBlock';
import { consumeDragClick, pressToDrag } from './dragDrop';
import { applyDrop } from './drops';
import { afterTyping, richKey } from './editing';
import { editorRoot, editorState, flushAll, focusBlock, selectableOutline, selectBlocks, setMenu, useEditorStore } from './editorStore';
import { EmojiButton } from './EmojiPicker';
import { MediaBlock } from './MediaBlock';
import { usePageContext } from './PageContext';
import styles from './pages.module.css';
import { pasteInto } from './pasting';
import { RichText } from './RichText';
import { DrawingBlock } from './DrawingBlock';
import { TableBlock } from './TableBlock';
import { TargetBlock } from './TargetBlock';
import { TocBlock } from './TocBlock';
import { CalendarBlock } from './CalendarBlock';

const NO_IDS: readonly string[] = [];

const PLACEHOLDERS: Partial<Record<BlockKind, string>> = {
  text: tx('Write, or type “/” for commands'),
  h1: tx('Heading 1'),
  h2: tx('Heading 2'),
  h3: tx('Heading 3'),
  h4: tx('Heading 4'),
  bullet: tx('List'),
  numbered: tx('List'),
  todo: tx('To-do'),
  toggle: tx('Toggle list'),
  callout: tx('Write something…'),
};

const LABELS: Partial<Record<BlockKind, string>> = {
  text: tx('Text'),
  h1: tx('Heading 1'),
  h2: tx('Heading 2'),
  h3: tx('Heading 3'),
  h4: tx('Heading 4'),
  bullet: tx('List item'),
  numbered: tx('Numbered list item'),
  todo: tx('Task'),
  toggle: tx('Toggle list'),
  callout: tx('Callout'),
  toc: tx('Table of contents'),
  calendar: tx('Calendar'),
  immich: tx('Photos from Immich'),
};

/** A container's blocks, in order. */
export const BlockList = memo(function BlockList({ parentId, depth }: { parentId: string; depth: number }) {
  const ids = useBlocksStore(s => s.blocksByParent[parentId]) ?? NO_IDS;
  return (
    <>
      {ids.map((id, index) => (
        <BlockView key={id} id={id} depth={depth} siblings={ids} index={index} />
      ))}
    </>
  );
});

/** A block's text, its keys sent to the editor with the block as it stands when they come. */
function BlockText({ block }: { block: Block }) {
  const { page, readOnly } = usePageContext();
  const fresh = (): Block => useBlocksStore.getState().blocks[block.id] ?? block;
  const placeholder = PLACEHOLDERS[block.kind];
  return (
    <RichText
      page={page}
      id={block.id}
      markup={block.text}
      placeholder={placeholder ? t(placeholder) : ''}
      hintOnFocus={block.kind === 'text'}
      className={`${styles.rich} ${styles[`kind_${block.kind}`] ?? ''}`}
      label={t(LABELS[block.kind] ?? 'Text')}
      readOnly={readOnly}
      onKeyDown={(event, handle) => richKey(event, page, fresh(), handle)}
      onTyped={handle => afterTyping(page, fresh(), handle)}
      onPaste={(event, handle) => pasteInto(event, page, fresh(), handle)}
    />
  );
}

/** What a block holds, under it: indented under an item or a toggle (it follows the item closely); `flush` in a callout, whose paragraphs after the first start at its text's edge. */
function Children({ id, depth, flush = false }: { id: string; depth: number; flush?: boolean }) {
  const has = useBlocksStore(s => (s.blocksByParent[id]?.length ?? 0) > 0);
  if (!has) return null;
  return (
    <div className={styles.children} data-flush={flush || undefined}>
      <BlockList parentId={id} depth={depth + 1} />
    </div>
  );
}

/** A list item's mark: a bullet by depth, or its number among the items before it. */
function ListMark({ block, siblings, index }: { block: Block; siblings: readonly string[]; index: number }) {
  const label = useBlocksStore(s => (block.kind === 'numbered' ? numberLabel(listNumber(s.blocks, siblings, index), listDepth(s.blocks, block.id, 'numbered')) : bulletMark(listDepth(s.blocks, block.id, 'bullet'))));
  return (
    <span className={styles.listMark} data-kind={block.kind} aria-hidden="true">
      {label}
    </span>
  );
}

function Toggle({ block, depth }: { block: Block; depth: number }) {
  const { page, readOnly } = usePageContext();
  const open = usePagesUiStore(s => s.openToggles.has(block.id));
  const empty = useBlocksStore(s => (s.blocksByParent[block.id]?.length ?? 0) === 0);
  return (
    <>
      <div className={styles.line}>
        <button type="button" className={styles.toggleButton} data-open={open || undefined} aria-expanded={open} aria-label={open ? t('Collapse') : t('Expand')} onClick={() => setToggleOpen(block.id, !open)}>
          <Icon name="chevronRight" size={16} />
        </button>
        <div className={styles.main}>
          <BlockText block={block} />
        </div>
      </div>
      {open ? (
        empty ? (
          <button
            type="button"
            className={styles.emptyToggle}
            disabled={readOnly}
            onClick={() => {
              const id = insertBlock(page, block.id, 0, { kind: 'text', text: '' });
              focusBlock(id, 'start');
            }}
          >
            {t('Empty list. Click to write in it, or drag blocks into it.')}
          </button>
        ) : (
          <Children id={block.id} depth={depth} />
        )
      ) : null}
    </>
  );
}

function Callout({ block, depth }: { block: Block; depth: number }) {
  const { page, readOnly } = usePageContext();
  return (
    <div className={styles.callout} data-outline="panel" data-line={isLineColor(block.color) ? block.color : undefined}>
      <EmojiButton value={block.icon ?? '💡'} label={t('Change the callout’s icon')} disabled={readOnly} onChange={icon => updateBlock(page, block.id, { icon })} allowNone={false} />
      <div className={styles.main}>
        <BlockText block={block} />
        <Children id={block.id} depth={depth} flush />
      </div>
    </div>
  );
}

/** A sub-page in its parent's content: its icon and title, opening it. */
function PageLink({ block }: { block: Block }) {
  const title = block.text.trim() || t(UNTITLED_PAGE);
  return (
    <a
      href={browserPath(paths.page(block.id))}
      className={styles.pageLink}
      data-caret-skip=""
      onClick={event => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        flushAll();
        navigate(paths.page(block.id));
      }}
    >
      <span className={styles.pageLinkIcon}>{block.icon ? <span className={styles.emoji}>{block.icon}</span> : <Icon name="page" size={20} />}</span>
      <span className={styles.pageLinkTitle}>{title}</span>
    </a>
  );
}

function Content({ block, depth, siblings, index }: { block: Block; depth: number; siblings: readonly string[]; index: number }) {
  const { page, readOnly } = usePageContext();
  switch (block.kind) {
    case 'text':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
      return (
        <>
          <BlockText block={block} />
          {canNest(block.kind) ? <Children id={block.id} depth={depth} /> : null}
        </>
      );
    case 'bullet':
    case 'numbered':
      return (
        <>
          <div className={styles.line}>
            <ListMark block={block} siblings={siblings} index={index} />
            <div className={styles.main}>
              <BlockText block={block} />
            </div>
          </div>
          <Children id={block.id} depth={depth} />
        </>
      );
    case 'todo':
      return (
        <>
          <div className={styles.line} data-checked={block.checked || undefined}>
            <span className={styles.todoBox}>
              <Checkbox checked={block.checked} label={block.checked ? t('Mark as not done') : t('Mark as done')} disabled={readOnly} recede onToggle={() => updateBlock(page, block.id, { checked: !block.checked })} />
            </span>
            <div className={styles.main}>
              <BlockText block={block} />
            </div>
          </div>
          <Children id={block.id} depth={depth} />
        </>
      );
    case 'toggle':
      return <Toggle block={block} depth={depth} />;
    case 'callout':
      return <Callout block={block} depth={depth} />;
    case 'page':
      return <PageLink block={block} />;
    case 'code':
      return <CodeBlock block={block} />;
    case 'table':
      return <TableBlock block={block} />;
    case 'image':
    case 'video':
    case 'pdf':
    case 'file':
      return <MediaBlock block={block} />;
    case 'bookmark':
    case 'embed':
      return <TargetBlock block={block} />;
    case 'toc':
      return <TocBlock block={block} />;
    case 'drawing':
      return <DrawingBlock block={block} />;
    case 'calendar':
      return <CalendarBlock block={block} />;
    case 'immich':
      return <ImmichBlock block={block} />;
    default:
      return null;
  }
}

/** The dragged blocks' label: the first one's words, or how many there are. */
function dragLabel(ids: readonly string[]): string {
  if (ids.length > 1) return plural(ids.length, 'block');
  const block = useBlocksStore.getState().blocks[ids[0] ?? ''];
  if (!block) return '';
  const text = block.kind === 'page' || block.kind === 'code' ? block.text : markupToPlain(block.text, mentionLabel, dateWords);
  const label = LABELS[block.kind];
  return text.trim().slice(0, 60) || (label ? t(label) : t('Block'));
}

function Gutter({ block }: { block: Block }) {
  const { page } = usePageContext();
  const [menu, setMenuOpen] = useState(false);
  const grip = useRef<HTMLButtonElement>(null);

  const addBelow = (): void => {
    flushAll();
    const id = insertAfter(page, block.id, { kind: 'text', text: '/' });
    if (!id) return;
    setMenu({ kind: 'slash', block: id, start: 0, query: '' });
    focusBlock(id, 1);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const { selected } = editorState();
    const outline = selectableOutline();
    const ids = selected.has(block.id) ? outline.filter(id => selected.has(id)) : [block.id];
    const blocks = useBlocksStore.getState().blocks;
    pressToDrag(event.nativeEvent, { kind: 'blocks', ids, label: dragLabel(ids), excludes: other => ids.some(id => isWithin(blocks, other, id)) }, target => {
      flushAll();
      if (!applyDrop({ kind: 'blocks', ids, page, outline }, target)) return;
      // What moved stays selected and the page keeps the keyboard, so ⌘Z (Ctrl+Z) puts it back at once; dropped in another page of the tree, the page's history still holds the move.
      if (target.type !== 'tree') selectBlocks(ids);
      editorRoot()?.focus({ preventScroll: true });
    });
  };

  return (
    <div className={styles.gutter} contentEditable={false} data-gutter="">
      <button type="button" className={styles.gutterButton} aria-label={t('Add a block below')} data-tip={t('Add a block')} onClick={addBelow}>
        <Icon name="plus" size={18} />
      </button>
      <button
        ref={grip}
        type="button"
        className={`${styles.gutterButton} ${styles.grip}`}
        aria-label={t('Move the block, or open its menu')}
        aria-haspopup="menu"
        aria-expanded={menu}
        data-tip={t('Drag to move · click for the menu')}
        onPointerDown={onPointerDown}
        onClick={() => {
          if (consumeDragClick()) return;
          flushAll();
          if (!editorState().selected.has(block.id)) selectBlocks([block.id]);
          setMenuOpen(true);
        }}
      >
        <Icon name="grip" size={18} />
      </button>
      <BlockMenu open={menu} anchor={grip} block={block} onDismiss={() => setMenuOpen(false)} />
    </div>
  );
}

const BlockView = memo(function BlockView({ id, depth, siblings, index }: { id: string; depth: number; siblings: readonly string[]; index: number }) {
  const { readOnly } = usePageContext();
  const block = useBlocksStore(s => s.blocks[id]);
  const selected = useEditorStore(s => s.selected.has(id));
  // Beside a block straight in a page or a column, a drop makes columns.
  const sides = useBlocksStore(s => {
    const parent = block?.parentId ? s.blocks[block.parentId] : undefined;
    return parent?.kind === 'page' || parent?.kind === 'column';
  });
  if (!block || block.deletedAt !== null || block.kind === 'column' || block.kind === 'row') return null;
  if (block.kind === 'page' && block.trashedAt !== null) return null;
  if (block.kind === 'columns') return <ColumnsBlock block={block} depth={depth} />;
  return (
    <div className={styles.block} data-kind={block.kind} data-drop-block={id} data-select-block={id} data-drop-sides={sides || undefined} data-selected={selected || undefined}>
      {readOnly ? null : <Gutter block={block} />}
      <div className={styles.body}>
        <Content block={block} depth={depth} siblings={siblings} index={index} />
        {CAPTION_KINDS.has(block.kind) ? <Caption block={block} /> : null}
      </div>
    </div>
  );
});
