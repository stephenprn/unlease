/**
 * A page's own menu, « Plus d’actions » in its head (in the phone's top bar under 720px): Claude
 * when the Administration offers it, a sub-page, a move to another page, a copy, its address, its
 * Markdown, keeping it away from Claude, and the bin, last.
 */
import { useState, type RefObject } from 'react';

import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/notes/models/blocks';
import { ancestorPages, containingPage, isWithin } from '@unlease/notes/services/blocks';
import { isPrivatePage } from '@unlease/notes/services/pagesAsk';

import { useLibraryStore } from '../../../app/store/library';
import { duplicateBlocks, movePage, setPagePrivate } from '../../../app/store/pages';
import { openPagesAsk, usePagesAskSettings } from '../../../app/pagesAsk';
import { expandAll } from '../../../app/store/pagesUi';
import { showError, showSnack } from '../../../app/store/ui';
import { Menu, type MenuItem } from '../../components/Menu';
import { browserPath, navigate, paths } from '../../router';
import { pageMarkdown } from './clipboard';
import { flushAll } from './editorStore';
import { MovePageDialog } from './MovePageDialog';
import { openNewPage, trashWithUndo } from './PageTree';

/** The page's address, to paste anywhere. */
function copyLink(id: string): void {
  const url = new URL(browserPath(paths.page(id)), window.location.origin).href;
  if (!navigator.clipboard) {
    showError(t('Impossible de copier le lien'));
    return;
  }
  void navigator.clipboard.writeText(url).then(
    () => showSnack(t('Lien copié'), undefined, { tone: 'success' }),
    () => showError(t('Impossible de copier le lien')),
  );
}

const REFUSED = '/\\?%*:|"<>';

/** A title as a file's name: no character a file system refuses. */
function fileName(title: string): string {
  const safe = [...title].map(char => (char.charCodeAt(0) < 32 || char === '\u007f' || REFUSED.includes(char) ? '-' : char)).join('');
  return safe.replace(/\s+/g, ' ').trim().slice(0, 120) || t(UNTITLED_PAGE);
}

/** The page as a Markdown file, saved to this computer. */
function exportMarkdown(id: string): void {
  flushAll();
  const title = useLibraryStore.getState().blocks[id]?.text.trim() || t(UNTITLED_PAGE);
  const url = URL.createObjectURL(new Blob([pageMarkdown(id)], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName(title)}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Moved in the tree's terms: the pages above it open, so it shows there. */
function moved(id: string, message: string): void {
  expandAll(ancestorPages(useLibraryStore.getState().blocks, id).map(page => page.id));
  showSnack(message, undefined, { tone: 'success' });
}

export function PageMenu({ id, open, anchor, onDismiss }: { id: string; open: boolean; anchor: RefObject<HTMLElement | null>; onDismiss: () => void }) {
  const [moving, setMoving] = useState(false);
  const parent = useLibraryStore(s => containingPage(s.blocks, id));
  const ask = usePagesAskSettings() !== null;
  // Kept away by itself (its own switch), or by a page above it (nothing to switch here).
  const own = useLibraryStore(s => s.blocks[id]?.private === true);
  const kept = useLibraryStore(s => isPrivatePage(s.blocks, id));
  const items: MenuItem[] = [
    ...(ask && !kept ? [{ label: t('Demander à Claude'), icon: 'sparkle' as const, onSelect: () => openPagesAsk(id) }] : []),
    {
      label: t('Ajouter une sous-page'),
      separatorBefore: ask && !kept,
      icon: 'pagePlus',
      onSelect: () => {
        flushAll();
        openNewPage(id);
      },
    },
    { label: t('Déplacer vers…'), icon: 'transfer', onSelect: () => setMoving(true) },
    {
      label: t('Dupliquer'),
      icon: 'copy',
      onSelect: () => {
        flushAll();
        const [copy] = duplicateBlocks(null, [id]);
        if (copy) navigate(paths.page(copy));
      },
    },
    { label: t('Copier le lien'), icon: 'link', onSelect: () => copyLink(id) },
    { label: t('Exporter en Markdown'), icon: 'download', onSelect: () => exportMarkdown(id) },
    ...(ask && (own || !kept)
      ? [
          own
            ? { label: t('Montrer à Claude'), icon: 'eye' as const, onSelect: () => setPagePrivate(id, false) }
            : {
                label: t('Garder hors de Claude'),
                icon: 'eyeOff' as const,
                onSelect: () => {
                  setPagePrivate(id, true);
                  showSnack(t('Cette page et ses sous-pages ne seront plus envoyées à Claude'), undefined, { tone: 'success' });
                },
              },
        ]
      : []),
    {
      label: t('Mettre à la corbeille'),
      icon: 'trash',
      danger: true,
      separatorBefore: true,
      onSelect: () => {
        flushAll();
        trashWithUndo(id);
      },
    },
  ];
  return (
    <>
      <Menu open={open} anchor={anchor} onDismiss={onDismiss} items={items} label={t('Actions de la page')} />
      <MovePageDialog
        open={moving}
        current={parent}
        exclude={other => isWithin(useLibraryStore.getState().blocks, other, id)}
        onDismiss={() => setMoving(false)}
        onPick={target => {
          flushAll();
          if (movePage(id, { into: target })) moved(id, t('Page déplacée vers {page}', { page: useLibraryStore.getState().blocks[target]?.text.trim() || t(UNTITLED_PAGE) }));
        }}
        onTop={() => {
          flushAll();
          if (movePage(id, { into: null })) moved(id, t('Page déplacée au premier niveau'));
        }}
      />
    </>
  );
}
