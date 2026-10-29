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
import { isWithin, shownTarget, type TargetDisplay } from '@unlease/notes/services/blocks';
import { CAPTION_KINDS, RICH_KINDS, type Block, type BlockKind, type BlockTarget } from '@unlease/notes/models/blocks';
import { plural } from '@unlease/core/services/format';

import { mentionLabel } from '../../../app/hooks/usePages';
import { useLibraryStore } from '../../../app/store/library';
import { deleteBlocks, duplicateBlocks, moveBlocks, setShowDone, showTargetAs, TURNABLE, turnInto, updateBlock } from '../../../app/store/pages';
import { showSnack } from '../../../app/store/ui';
import { Menu, type MenuItem } from '../../components/Menu';
import { Popover } from '../../components/Popover';
import { LineColorPicker } from '../lines/LineColorPicker';
import { navigate, paths } from '../../router';
import { copyBlocks } from './clipboard';
import { clearBlockSelection, editorState, flushAll, focusBlock, openCaption, selectableOutline, selectBlocks } from './editorStore';
import { MovePageDialog } from './MovePageDialog';
import { usePageContext } from './PageContext';
import { trashWithUndo } from './PageTree';
import styles from './pages.module.css';

export const KIND_CHOICES: readonly { readonly kind: BlockKind; readonly label: string; readonly icon: GlyphName }[] = [
  { kind: 'text', label: tx('Texte'), icon: 'text' },
  { kind: 'h1', label: tx('Titre 1'), icon: 'heading1' },
  { kind: 'h2', label: tx('Titre 2'), icon: 'heading2' },
  { kind: 'h3', label: tx('Titre 3'), icon: 'heading3' },
  { kind: 'h4', label: tx('Titre 4'), icon: 'heading4' },
  { kind: 'bullet', label: tx('Liste à puces'), icon: 'list' },
  { kind: 'numbered', label: tx('Liste numérotée'), icon: 'numbered' },
  { kind: 'todo', label: tx('Liste de tâches'), icon: 'boxChecked' },
  { kind: 'toggle', label: tx('Liste dépliante'), icon: 'toggle' },
  { kind: 'callout', label: tx('Encadré'), icon: 'callout' },
  { kind: 'code', label: tx('Code'), icon: 'codeBlock' },
  { kind: 'page', label: tx('Page'), icon: 'page' },
];

const DISPLAYS: readonly { readonly display: TargetDisplay; readonly label: string; readonly icon: GlyphName }[] = [
  { display: 'mention', label: tx('Afficher en mention'), icon: 'mention' },
  { display: 'bookmark', label: tx('Afficher en signet'), icon: 'bookmark' },
  { display: 'embed', label: tx('Afficher en intégration'), icon: 'embed' },
];

/** A page is better opened than embedded (as the bar over a mention has it). */
const canShow = (target: BlockTarget, display: TargetDisplay): boolean => display !== 'embed' || target.type !== 'page';

type Sub = 'turn' | 'color' | 'move' | null;

export function BlockMenu({ open, anchor, block, onDismiss }: { open: boolean; anchor: RefObject<HTMLButtonElement | null>; block: Block; onDismiss: () => void }) {
  const { page } = usePageContext();
  const [sub, setSub] = useState<Sub>(null);
  const embedsCollection = useLibraryStore(s => block.kind === 'embed' && block.target?.type === 'note' && s.notes[block.target.id]?.kind === 'links');

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
  if (block.kind === 'page') items.push({ label: t('Ouvrir'), icon: 'page', onSelect: () => navigate(paths.page(block.id)) });
  if (turnable) items.push({ label: t('Transformer en…'), icon: 'refresh', onSelect: () => setSub('turn') });
  const shown = shownTarget(block);
  if (shown) {
    for (const { display, label, icon } of DISPLAYS) {
      if (display === shown.display || !canShow(shown.target, display)) continue;
      items.push({
        label: t(label),
        icon,
        onSelect: () => {
          flushAll();
          const { blocks } = useLibraryStore.getState();
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
        ? { label: t('Masquer les déjà faits'), icon: 'eyeOff', onSelect: () => setShowDone(page, block.id, false) }
        : { label: t('Afficher les déjà faits'), icon: 'eye', onSelect: () => setShowDone(page, block.id, true) },
    );
  }
  if (block.kind === 'callout') items.push({ label: t('Couleur…'), icon: 'palette', onSelect: () => setSub('color') });
  if (CAPTION_KINDS.has(block.kind)) {
    items.push(
      block.caption
        ? { label: t('Retirer la légende'), icon: 'close', onSelect: () => updateBlock(page, block.id, { caption: '' }) }
        : {
            label: t('Ajouter une légende'),
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
      label: t('Dupliquer'),
      icon: 'copy',
      shortcut: 'Ctrl+D',
      onSelect: () => {
        flushAll();
        const copies = duplicateBlocks(page, subjects(), selectableOutline());
        if (copies.length > 0) selectBlocks(copies);
      },
    },
    { label: t('Déplacer vers…'), icon: 'transfer', onSelect: () => setSub('move') },
  );
  if (RICH_KINDS.has(block.kind) || block.kind === 'code') {
    items.push({
      label: t('Copier le texte'),
      icon: 'share',
      onSelect: () => {
        flushAll();
        void copyBlocks(subjects()).then(() => showSnack(t('Texte copié'), undefined, { tone: 'success' }));
      },
    });
  }
  items.push(
    block.kind === 'page'
      ? { label: t('Mettre à la corbeille'), icon: 'trash', danger: true, separatorBefore: true, onSelect: () => trashWithUndo(block.id) }
      : {
          label: t('Supprimer'),
          icon: 'trash',
          danger: true,
          separatorBefore: true,
          shortcut: t('Suppr'),
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
        const kind = useLibraryStore.getState().blocks[id]?.kind;
        return kind !== undefined && TURNABLE.has(kind) && kind !== 'page';
      });
      turnInto(page, ids, choice.kind, { label: mentionLabel, ...(choice.kind === 'code' ? { language: 'plain' } : {}) });
      clearBlockSelection();
      if (choice.kind !== 'page' && ids.length === 1) focusBlock(ids[0]!, 'end');
    },
  }));

  return (
    <>
      <Menu open={open} anchor={anchor} onDismiss={close} items={items} label={t('Actions du bloc')} align="start" />
      <Menu open={sub === 'turn'} anchor={anchor} onDismiss={() => setSub(null)} items={turnItems} label={t('Transformer en')} align="start" />
      <Popover open={sub === 'color'} anchor={anchor} onDismiss={() => setSub(null)} label={t('Couleur de l’encadré')} width={300} align="start">
        <div className={styles.colorPopover}>
          <h2 className="t-label">{t('Couleur de l’encadré')}</h2>
          <LineColorPicker label={t('Couleur de l’encadré')} allowNone value={block.color} onChange={color => updateBlock(page, block.id, { color })} />
        </div>
      </Popover>
      <MovePageDialog
        open={sub === 'move'}
        current={page}
        exclude={id => subjects().some(subject => isWithin(useLibraryStore.getState().blocks, id, subject))}
        onDismiss={() => setSub(null)}
        onPick={target => {
          flushAll();
          const ids = subjects();
          const last = (useLibraryStore.getState().blocksByParent[target] ?? []).filter(id => !ids.includes(id)).pop() ?? null;
          if (moveBlocks(page, ids, { parentId: target, afterId: last }, selectableOutline())) {
            clearBlockSelection();
            const title = useLibraryStore.getState().blocks[target]?.text.trim() || t('la page');
            const message = ids.length > 1 ? t('{blocks} déplacés vers {page}', { blocks: plural(ids.length, 'bloc'), page: title }) : t('Bloc déplacé vers {page}', { page: title });
            showSnack(message, { label: t('Ouvrir'), run: () => navigate(paths.page(target)) }, { tone: 'success' });
          }
        }}
      />
    </>
  );
}
