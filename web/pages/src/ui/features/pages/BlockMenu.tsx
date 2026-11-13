/**
 * A block's menu, from its grip; it acts on every selected block when the grip's block is one of
 * them. « Transformer en » turns text into another kind; a mention alone in its text, a bookmark
 * and an embed show their subject another of those ways; an embedded collection shows its links
 * done or not; a callout takes a colour; a code block, a table, a media, a bookmark or an embed
 * takes a caption; a block can be duplicated, moved to another page, copied as text, or deleted (a
 * page goes to the bin).
 */
import { useState, type RefObject } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';
import { t, tx } from '@unlease/core/i18n';
import { isWithin, shownTarget, type TargetDisplay } from '@unlease/pages/services/blocks';
import { CAPTION_KINDS, RICH_KINDS, type Block, type BlockKind, type BlockTarget } from '@unlease/pages/models/blocks';
import { plural } from '@unlease/core/services/format';
import { isLineColor } from '@unlease/design/colors';

import { mentionLabel } from '../../../app/hooks/usePages';
import { pagesLibrary, usePagesLibrary } from '../../../app/store/blocks';
import { deleteBlocks, duplicateBlocks, moveBlocks, setShowDone, showTargetAs, TURNABLE, turnInto, updateBlock } from '../../../app/store/pages';
import { showSnack } from '@shared/app/store/ui';
import { Menu, type MenuItem } from '@shared/ui/components/Menu';
import { Popover } from '@shared/ui/components/Popover';
import { LineColorPicker } from '@notes/ui/features/lines/LineColorPicker';
import { navigate } from '@shared/ui/router';
import { paths } from '../../routes';
import { copyBlocks } from './clipboard';
import { clearBlockSelection, editorState, flushAll, focusBlock, openCaption, selectableOutline, selectBlocks } from './editorStore';
import { MovePageDialog } from './MovePageDialog';
import { usePageContext } from './PageContext';
import { trashWithUndo } from './PageTree';
import styles from './pages.module.css';

export const KIND_CHOICES: readonly { readonly kind: BlockKind; readonly label: string; readonly icon: GlyphName }[] = [
  { kind: 'text', label: tx('Text'), icon: 'text' },
  { kind: 'h1', label: tx('Heading 1'), icon: 'heading1' },
  { kind: 'h2', label: tx('Heading 2'), icon: 'heading2' },
  { kind: 'h3', label: tx('Heading 3'), icon: 'heading3' },
  { kind: 'h4', label: tx('Heading 4'), icon: 'heading4' },
  { kind: 'bullet', label: tx('Bulleted list'), icon: 'list' },
  { kind: 'numbered', label: tx('Numbered list'), icon: 'numbered' },
  { kind: 'todo', label: tx('To-do list'), icon: 'boxChecked' },
  { kind: 'toggle', label: tx('Toggle list'), icon: 'toggle' },
  { kind: 'callout', label: tx('Callout'), icon: 'callout' },
  { kind: 'code', label: tx('Code'), icon: 'codeBlock' },
  { kind: 'page', label: tx('Page'), icon: 'page' },
];

const DISPLAYS: readonly { readonly display: TargetDisplay; readonly label: string; readonly icon: GlyphName }[] = [
  { display: 'mention', label: tx('Show as a mention'), icon: 'mention' },
  { display: 'bookmark', label: tx('Show as a bookmark'), icon: 'bookmark' },
  { display: 'embed', label: tx('Show as an embed'), icon: 'embed' },
];

/** A page is better opened than embedded (as the bar over a mention has it); a contact or an event is only ever mentioned. */
const canShow = (target: BlockTarget, display: TargetDisplay): boolean => (target.type === 'contact' || target.type === 'event' ? display === 'mention' : display !== 'embed' || target.type !== 'page');

type Sub = 'turn' | 'color' | 'move' | null;

export function BlockMenu({ open, anchor, block, onDismiss }: { open: boolean; anchor: RefObject<HTMLButtonElement | null>; block: Block; onDismiss: () => void }) {
  const { page } = usePageContext();
  const [sub, setSub] = useState<Sub>(null);
  const embedsCollection = usePagesLibrary(s => block.kind === 'embed' && block.target?.type === 'note' && s.notes[block.target.id]?.kind === 'links');

  /** The blocks the menu acts on: the selection when this block is in it. */
  const subjects = (): string[] => {
    const { selected } = editorState();
    return selected.has(block.id) ? selectableOutline().filter(id => selected.has(id)) : [block.id];
  };
  const close = (): void => {
    onDismiss();
  };

  const turnable = TURNABLE.has(block.kind) && block.kind !== 'page';
  const items: MenuItem[] = [];
  if (block.kind === 'page') items.push({ label: t('Open'), icon: 'page', onSelect: () => navigate(paths.page(block.id)) });
  if (turnable) items.push({ label: t('Turn into…'), icon: 'refresh', onSelect: () => setSub('turn') });
  const shown = shownTarget(block);
  if (shown) {
    for (const { display, label, icon } of DISPLAYS) {
      if (display === shown.display || !canShow(shown.target, display)) continue;
      items.push({
        label: t(label),
        icon,
        onSelect: () => {
          flushAll();
          const { blocks } = pagesLibrary();
          const ids = subjects().filter(id => {
            const other = blocks[id] ? shownTarget(blocks[id]!) : null;
            return other !== null && canShow(other.target, display);
          });
          showTargetAs(page, ids, display);
        },
      });
    }
  }
  if (embedsCollection) {
    items.push(
      block.showDone
        ? { label: t('Hide done'), icon: 'eyeOff', onSelect: () => setShowDone(page, block.id, false) }
        : { label: t('Show done'), icon: 'eye', onSelect: () => setShowDone(page, block.id, true) },
    );
  }
  if (block.kind === 'callout') items.push({ label: t('Colour…'), icon: 'palette', onSelect: () => setSub('color') });
  if (CAPTION_KINDS.has(block.kind)) {
    items.push(
      block.caption
        ? { label: t('Remove caption'), icon: 'close', onSelect: () => updateBlock(page, block.id, { caption: '' }) }
        : {
            label: t('Add a caption'),
            icon: 'textAlign',
            onSelect: () => {
              flushAll();
              openCaption(block.id);
            },
          },
    );
  }
  items.push(
    {
      label: t('Duplicate'),
      icon: 'copy',
      shortcut: 'Ctrl+D',
      onSelect: () => {
        flushAll();
        const copies = duplicateBlocks(page, subjects(), selectableOutline());
        if (copies.length > 0) selectBlocks(copies);
      },
    },
    { label: t('Move to…'), icon: 'transfer', onSelect: () => setSub('move') },
  );
  if (RICH_KINDS.has(block.kind) || block.kind === 'code') {
    items.push({
      label: t('Copy the text'),
      icon: 'share',
      onSelect: () => {
        flushAll();
        void copyBlocks(subjects()).then(() => showSnack(t('Text copied'), undefined, { tone: 'success' }));
      },
    });
  }
  items.push(
    block.kind === 'page'
      ? { label: t('Move to bin'), icon: 'trash', danger: true, separatorBefore: true, onSelect: () => trashWithUndo(block.id) }
      : {
          label: t('Delete'),
          icon: 'trash',
          danger: true,
          separatorBefore: true,
          shortcut: t('Del'),
          onSelect: () => {
            flushAll();
            deleteBlocks(page, subjects());
            clearBlockSelection();
          },
        },
  );

  const turnItems: MenuItem[] = KIND_CHOICES.filter(choice => choice.kind !== block.kind).map(choice => ({
    label: t(choice.label),
    icon: choice.icon,
    onSelect: () => {
      flushAll();
      const ids = subjects().filter(id => {
        const kind = pagesLibrary().blocks[id]?.kind;
        return kind !== undefined && TURNABLE.has(kind) && kind !== 'page';
      });
      turnInto(page, ids, choice.kind, { label: mentionLabel, ...(choice.kind === 'code' ? { language: 'plain' } : {}) });
      clearBlockSelection();
      if (choice.kind !== 'page' && ids.length === 1) focusBlock(ids[0]!, 'end');
    },
  }));

  return (
    <>
      <Menu open={open} anchor={anchor} onDismiss={close} items={items} label={t('Block actions')} align="start" />
      <Menu open={sub === 'turn'} anchor={anchor} onDismiss={() => setSub(null)} items={turnItems} label={t('Turn into')} align="start" />
      <Popover open={sub === 'color'} anchor={anchor} onDismiss={() => setSub(null)} label={t('Callout colour')} width={300} align="start">
        <div className={styles.colorPopover}>
          <h2 className="t-label">{t('Callout colour')}</h2>
          <LineColorPicker label={t('Callout colour')} allowNone value={isLineColor(block.color) ? block.color : null} onChange={color => updateBlock(page, block.id, { color })} />
        </div>
      </Popover>
      <MovePageDialog
        open={sub === 'move'}
        current={page}
        exclude={id => subjects().some(subject => isWithin(pagesLibrary().blocks, id, subject))}
        onDismiss={() => setSub(null)}
        onPick={target => {
          flushAll();
          const ids = subjects();
          const last = (pagesLibrary().blocksByParent[target] ?? []).filter(id => !ids.includes(id)).pop() ?? null;
          if (moveBlocks(page, ids, { parentId: target, afterId: last }, selectableOutline())) {
            clearBlockSelection();
            const title = pagesLibrary().blocks[target]?.text.trim() || t('the page');
            const message = ids.length > 1 ? t('{blocks} moved to {page}', { blocks: plural(ids.length, 'block'), page: title }) : t('Block moved to {page}', { page: title });
            showSnack(message, { label: t('Open'), run: () => navigate(paths.page(target)) }, { tone: 'success' });
          }
        }}
      />
    </>
  );
}
