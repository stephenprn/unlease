/**
 * The pages in the navigation, as a tree (Notion's sidebar): each page with its sub-pages under a
 * chevron, the one on screen chosen as every navigation row is (matcha, its glyph solid). A row
 * opens its page; its "+" adds a sub-page and its menu holds the rest. A row dragged moves the
 * page: into another page, beside one, or into a page's content where it is dropped.
 */
import { memo, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/notes/models/blocks';
import { ancestorPages, isWithin } from '@unlease/notes/services/blocks';

import { useChildPages } from '../../../app/hooks/usePages';
import { useLibraryStore } from '../../../app/store/library';
import { createPage, duplicateBlocks, trashPage } from '../../../app/store/pages';
import { expandAll, requestTitleFocus, setExpanded, usePagesUiStore } from '../../../app/store/pagesUi';
import { showUndo } from '../../../app/store/ui';
import { Icon } from '../../components/Icon';
import { pebbleUnder } from '../../components/IconButton';
import { Menu, type MenuItem } from '../../components/Menu';
import navStyles from '../../navigation/nav.module.css';
import { browserPath, getLocation, isPlainClick, navigate, parseRoute, paths, type Route } from '../../router';
import { consumeDragClick, pressToDrag } from './dragDrop';
import { applyDrop } from './drops';
import styles from './tree.module.css';

/** Leaves a page that just went to the bin, when it (or a page above it) is the one on screen. */
function leaveIfShown(id: string): void {
  const route = parseRoute(getLocation().path);
  if (route.name !== 'page') return;
  const { blocks } = useLibraryStore.getState();
  if (route.id === id || isWithin(blocks, route.id, id)) navigate(paths.pages, { replace: true });
}

export function trashWithUndo(id: string): void {
  const undo = trashPage(id);
  leaveIfShown(id);
  showUndo(t('Page placée dans la corbeille'), undo);
}

/** A new page (inside `parentId`), opened with its title ready to type. */
export function openNewPage(parentId: string | null = null): void {
  const id = createPage({ parentId });
  if (parentId) setExpanded(parentId, true);
  requestTitleFocus(id);
  navigate(paths.page(id));
}

/** How far a sub-page's row steps in from its parent's: enough to read the nesting, little enough for a deep tree to keep its titles. */
const TREE_INDENT = 10;

const PageIcon = memo(function PageIcon({ icon }: { icon: string | null }) {
  return icon ? <span className={styles.emoji}>{icon}</span> : <Icon name="page" size={20} />;
});

/** The rows' links in reading order, in the tree that holds `from`: what the arrow keys walk through. */
function treeLinks(from: HTMLElement): HTMLAnchorElement[] {
  const tree = from.closest('[role="tree"]');
  return tree ? [...tree.querySelectorAll<HTMLAnchorElement>('a[data-tree-link]')] : [];
}

const TreeRow = memo(function TreeRow({ id, depth, current, tabStop, onNavigate }: { id: string; depth: number; current: string | null; tabStop: boolean; onNavigate?: () => void }) {
  const page = useLibraryStore(s => s.blocks[id]);
  const children = useChildPages(id);
  const expanded = usePagesUiStore(s => s.expanded.has(id));
  const [menu, setMenu] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  if (!page) return null;
  const title = page.text.trim() || t(UNTITLED_PAGE);
  const open = expanded && children.length > 0;

  const items: MenuItem[] = [
    { label: t('Ajouter une sous-page'), icon: 'pagePlus', onSelect: () => openNewPage(id) },
    {
      label: t('Dupliquer'),
      icon: 'copy',
      onSelect: () => {
        const [copy] = duplicateBlocks(null, [id]);
        if (copy) navigate(paths.page(copy));
      },
    },
    { label: t('Mettre à la corbeille'), icon: 'trash', danger: true, separatorBefore: true, onSelect: () => trashWithUndo(id) },
  ];

  const onPointerDown = (event: ReactPointerEvent<HTMLAnchorElement>): void => {
    const { blocks } = useLibraryStore.getState();
    pressToDrag(event.nativeEvent, { kind: 'page', ids: [id], label: title, excludes: other => other === id || isWithin(blocks, other, id) }, target => applyDrop({ kind: 'page', ids: [id], page: null, outline: [id] }, target));
  };

  // One stop in the tab order for the whole tree: the arrows walk it (as a file tree does), the menu key opens a row's menu.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLAnchorElement>): void => {
    const links = treeLinks(event.currentTarget);
    const at = links.indexOf(event.currentTarget);
    const focus = (link: HTMLAnchorElement | undefined): void => {
      if (!link) return;
      event.preventDefault();
      link.focus();
    };
    if (event.key === 'ArrowDown') focus(links[at + 1]);
    else if (event.key === 'ArrowUp') focus(links[at - 1]);
    else if (event.key === 'Home') focus(links[0]);
    else if (event.key === 'End') focus(links[links.length - 1]);
    else if (event.key === 'ArrowRight' && children.length > 0) {
      event.preventDefault();
      if (!open) setExpanded(id, true);
      else links[at + 1]?.focus();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (open) setExpanded(id, false);
      else event.currentTarget.closest('[role="treeitem"]')?.parentElement?.closest('[role="treeitem"]')?.querySelector<HTMLAnchorElement>('a[data-tree-link]')?.focus();
    } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      setMenu(true);
    }
  };

  return (
    <li role="treeitem" aria-expanded={children.length > 0 ? open : undefined} aria-level={depth + 1} aria-selected={current === id}>
      <div className={styles.row} data-tree-page={id} data-current={current === id || undefined} style={{ paddingLeft: 4 + depth * TREE_INDENT }}>
        <button
          type="button"
          className={styles.chevron}
          data-open={open || undefined}
          data-empty={children.length === 0 || undefined}
          aria-label={open ? t('Replier {title}', { title }) : t('Déplier {title}', { title })}
          tabIndex={-1}
          onClick={() => setExpanded(id, !expanded)}
        >
          <Icon name="chevronRight" size={14} />
        </button>
        <a
          href={browserPath(paths.page(id))}
          className={styles.link}
          data-tree-link
          tabIndex={tabStop ? 0 : -1}
          aria-current={current === id ? 'page' : undefined}
          // The browser's own drag of a link would take the gesture over.
          draggable={false}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onClick={event => {
            if (consumeDragClick()) {
              event.preventDefault();
              return;
            }
            if (!isPlainClick(event)) return;
            event.preventDefault();
            onNavigate?.();
            navigate(paths.page(id));
          }}
        >
          <span className={styles.icon}>
            <PageIcon icon={page.icon} />
          </span>
          <span className={styles.title}>{title}</span>
        </a>
        <span className={styles.actions}>
          <button ref={more} type="button" className={styles.action} tabIndex={-1} aria-label={t('Plus d’actions pour {title}', { title })} aria-haspopup="menu" aria-expanded={menu} data-tip={t('Plus d’actions')} onClick={() => setMenu(true)}>
            <Icon name="more" size={18} />
          </button>
          <button type="button" className={`${styles.action} ${styles.addAction}`} tabIndex={-1} {...pebbleUnder(1)} aria-label={t('Ajouter une sous-page à {title}', { title })} data-tip={t('Ajouter une sous-page')} onClick={() => openNewPage(id)}>
            <Icon name="plus" size={18} />
          </button>
        </span>
      </div>
      {open ? (
        <ul role="group" className={styles.group}>
          {children.map(child => (
            <TreeRow key={child} id={child} depth={depth + 1} current={current} tabStop={child === current} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
      <Menu open={menu} anchor={more} onDismiss={() => setMenu(false)} items={items} label={t('Actions pour {title}', { title })} />
    </li>
  );
});

export function PagesSection({ route, onNavigate }: { route: Route; onNavigate?: () => void }) {
  const roots = useChildPages(null);
  const current = route.name === 'page' ? route.id : null;

  // The page on screen shows in the tree: every page above it opens.
  useEffect(() => {
    if (!current) return;
    expandAll(ancestorPages(useLibraryStore.getState().blocks, current).map(page => page.id));
  }, [current]);

  return (
    <>
      {roots.length > 0 ? (
        <ul role="tree" aria-label={t('Pages')} className={styles.tree}>
          {roots.map((id, index) => (
            <TreeRow key={id} id={id} depth={0} current={current} tabStop={current ? id === current : index === 0} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        className={`${navStyles.item} ${navStyles.quiet}`}
        onClick={() => {
          onNavigate?.();
          openNewPage(null);
        }}
      >
        <span className={navStyles.markSlot}>
          <Icon name="plus" size={20} />
        </span>
        <span className={navStyles.itemName}>{t('Nouvelle page')}</span>
      </button>
    </>
  );
}
