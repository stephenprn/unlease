/**
 * The pages in the navigation, as a tree (Notion's sidebar): each page with its sub-pages under a
 * chevron that takes no room, standing in its icon's place while the pointer is on the row (a
 * finger has no hover: there it sits at the row's end, as on the phone), the one on screen chosen as every navigation
 * row is (matcha, its glyph solid). A row
 * opens its page; its "+" adds a sub-page and its menu holds the rest. A row dragged moves the
 * page: into another page, beside one, or into a page's content where it is dropped.
 *
 * Pages are chosen together as in a file manager: Maj+click a range from the row last clicked (or
 * the page on screen), ⌘+click (Ctrl+click) one more or one less, Maj+↑/↓ from the keyboard; then a
 * drag carries them all, and their menu (a right click, the menu key) moves, copies or bins them as
 * one. Échap, or a press anywhere else, lets them go.
 */
import { memo, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/pages/models/blocks';
import { ancestorPages, containingPage, isWithin } from '@unlease/pages/services/blocks';
import { plural } from '@unlease/core/services/format';

import { childPagesOf, useChildPages } from '../../../app/hooks/usePages';
import { useBlocksStore } from '../../../app/store/blocks';
import { createPage, duplicateBlocks, movePages, trashPage, trashPages, type PageDrop } from '../../../app/store/pages';
import { clearTreeSelection, expandAll, requestTitleFocus, selectTreePages, setExpanded, usePagesUiStore } from '../../../app/store/pagesUi';
import { showSnack, showUndo } from '@shared/app/store/ui';
import { Icon } from '@shared/ui/components/Icon';
import { pebbleUnder } from '@shared/ui/components/IconButton';
import { Menu, type MenuItem } from '@shared/ui/components/Menu';
import navStyles from '@shared/ui/navigation/nav.module.css';
import { browserPath, getLocation, navigate, parseRoute, type Route } from '@shared/ui/router';
import { useListMotion } from '@shared/ui/useListMotion';
import { paths } from '../../routes';
import { consumeDragClick, pressToDrag } from './dragDrop';
import { applyDrop } from './drops';
import { MovePageDialog } from './MovePageDialog';
import styles from './tree.module.css';

/** Leaves a page that just went to the bin, when it (or a page above it) is the one on screen. */
function leaveIfShown(id: string): void {
  const route = parseRoute(getLocation().path);
  if (route.name !== 'page') return;
  const { blocks } = useBlocksStore.getState();
  if (route.id === id || isWithin(blocks, route.id, id)) navigate(paths.pages, { replace: true });
}

export function trashWithUndo(id: string): void {
  const undo = trashPage(id);
  leaveIfShown(id);
  showUndo(t('Page moved to the bin'), undo);
}

/** Pages chosen together, to the bin as one step, with one Undo. */
function trashChosen(ids: readonly string[]): void {
  if (ids.length === 1) {
    trashWithUndo(ids[0]!);
    return;
  }
  const undo = trashPages(ids);
  for (const id of ids) leaveIfShown(id);
  clearTreeSelection();
  showUndo(t('{pages} moved to the bin', { pages: plural(ids.length, 'page') }), undo);
}

/** Copies of pages chosen together, each beside its own (a copy is « … (copy) »); the copies are then the ones chosen. */
function duplicateChosen(ids: readonly string[]): string[] {
  const { blocks } = useBlocksStore.getState();
  const byParent = new Map<string | null, string[]>();
  for (const id of ids) {
    const parent = blocks[id]?.parentId ?? null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), id]);
  }
  return [...byParent.values()].flatMap(group => duplicateBlocks(null, group));
}

/** Pages chosen together, moved as one step, and the slip that says where (with its Undo). */
function moveChosen(ids: readonly string[], drop: PageDrop, where: string): void {
  const undo = movePages(ids, drop);
  if (!undo) return;
  if ('into' in drop && drop.into) setExpanded(drop.into, true);
  showUndo(where, undo);
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
  // A row fading out (useListMotion's copy) is inert: out of the walk.
  return tree ? [...tree.querySelectorAll<HTMLAnchorElement>('a[data-tree-link]')].filter(link => !link.closest('[inert]')) : [];
}

/** The pages the tree shows, in reading order. */
function shownPages(from?: Element | null): string[] {
  const tree = from ?? document.querySelector('[role="tree"][data-page-tree]');
  return tree instanceof HTMLElement ? treeLinks(tree.querySelector<HTMLElement>('a[data-tree-link]') ?? tree).map(link => link.dataset.treeLink!) : [];
}

/** What an action on `id`'s row acts on: every page chosen when it is one of them (in the tree's order), else that page alone. */
function subjectsOf(id: string): string[] {
  const { treeSelected } = usePagesUiStore.getState();
  if (!treeSelected.has(id) || treeSelected.size < 2) return [id];
  const order = shownPages();
  const rank = (page: string): number => {
    const at = order.indexOf(page);
    return at < 0 ? order.length : at;
  };
  return [...treeSelected].sort((a, b) => rank(a) - rank(b));
}

/** Maj+click (or Maj+arrow): every row from the anchor (the row last clicked, else the page on screen) to `id`. */
function selectRange(from: HTMLElement, id: string, current: string | null): void {
  const shown = shownPages(from.closest('[role="tree"]'));
  const { treeAnchor, treeSelected } = usePagesUiStore.getState();
  const anchor = treeAnchor && shown.includes(treeAnchor) ? treeAnchor : current && shown.includes(current) && treeSelected.size === 0 ? current : id;
  const [a, b] = [shown.indexOf(anchor), shown.indexOf(id)].sort((x, y) => x - y) as [number, number];
  if (a < 0) return;
  selectTreePages(shown.slice(a, b + 1), anchor);
}

/** ⌘+click (Ctrl+click), or Espace on a row: that page in or out of the pages chosen (the page on screen counts as chosen to start with). */
function toggleRow(from: HTMLElement, id: string, current: string | null): void {
  const shown = shownPages(from.closest('[role="tree"]'));
  const { treeSelected } = usePagesUiStore.getState();
  const chosen = new Set(treeSelected.size > 0 ? treeSelected : current && shown.includes(current) ? [current] : []);
  if (chosen.has(id)) chosen.delete(id);
  else chosen.add(id);
  selectTreePages(
    shown.filter(page => chosen.has(page)),
    id,
  );
}

/** The siblings' page beside which pages chosen together go one step up or down (⌘+Maj+↑/↓); null at an end, or when they are not siblings. */
function nudgeDrop(ids: readonly string[], step: -1 | 1): PageDrop | null {
  const { blocks } = useBlocksStore.getState();
  const parent = containingPage(blocks, ids[0]!);
  if (ids.some(id => containingPage(blocks, id) !== parent)) return null;
  const siblings = childPagesOf(useBlocksStore.getState(), parent);
  if (step === -1) {
    const target = siblings.slice(0, siblings.indexOf(ids[0]!)).filter(id => !ids.includes(id)).pop();
    return target ? { beside: target, after: false } : null;
  }
  const last = siblings.indexOf(ids[ids.length - 1]!);
  const target = last < 0 ? undefined : siblings.slice(last + 1).find(id => !ids.includes(id));
  return target ? { beside: target, after: true } : null;
}

const TreeRow = memo(function TreeRow({ id, depth, current, tabStop, onNavigate }: { id: string; depth: number; current: string | null; tabStop: boolean; onNavigate?: () => void }) {
  const page = useBlocksStore(s => s.blocks[id]);
  const children = useChildPages(id);
  const expanded = usePagesUiStore(s => s.expanded.has(id));
  const chosen = usePagesUiStore(s => s.treeSelected.has(id));
  /** The pages the open menu acts on, fixed when it opened: this one, or every page chosen with it. */
  const [menu, setMenu] = useState<readonly string[] | null>(null);
  const [moving, setMoving] = useState<readonly string[] | null>(null);
  const more = useRef<HTMLButtonElement>(null);
  if (!page) return null;
  const title = page.text.trim() || t(UNTITLED_PAGE);
  const open = expanded && children.length > 0;
  const many = menu !== null && menu.length > 1;

  const items: MenuItem[] = many
    ? [
        {
          label: t('Duplicate {pages}', { pages: plural(menu.length, 'page') }),
          icon: 'copy',
          onSelect: () => {
            const copies = duplicateChosen(menu);
            selectTreePages(copies, copies[0] ?? null);
          },
        },
        { label: t('Move to…'), icon: 'transfer', onSelect: () => setMoving(menu) },
        { label: t('Move {pages} to the bin', { pages: plural(menu.length, 'page') }), icon: 'trash', danger: true, separatorBefore: true, onSelect: () => trashChosen(menu) },
      ]
    : [
        { label: t('Add a sub-page'), icon: 'pagePlus', onSelect: () => openNewPage(id) },
        {
          label: t('Duplicate'),
          icon: 'copy',
          onSelect: () => {
            const [copy] = duplicateBlocks(null, [id]);
            if (copy) navigate(paths.page(copy));
          },
        },
        { label: t('Move to…'), icon: 'transfer', onSelect: () => setMoving([id]) },
        { label: t('Move to bin'), icon: 'trash', danger: true, separatorBefore: true, onSelect: () => trashWithUndo(id) },
      ];

  const openMenu = (): void => setMenu(subjectsOf(id));

  const onPointerDown = (event: ReactPointerEvent<HTMLAnchorElement>): void => {
    // A press with a modifier chooses rows (on the click); it never starts a drag.
    if (event.shiftKey || event.metaKey || event.ctrlKey) return;
    const { blocks } = useBlocksStore.getState();
    const ids = subjectsOf(id);
    const label = ids.length > 1 ? plural(ids.length, 'page') : title;
    const excludes = (other: string): boolean => ids.some(dragged => other === dragged || isWithin(blocks, other, dragged));
    pressToDrag(event.nativeEvent, { kind: 'page', ids, label, excludes }, target => {
      // A row dragged alone lets the others go; pages dragged together stay chosen where they land.
      if (ids.length === 1) clearTreeSelection(id);
      if (!applyDrop({ kind: 'page', ids, page: null, outline: ids }, target) || ids.length < 2) return;
      showSnack(t('{pages} moved', { pages: plural(ids.length, 'page') }), undefined, { tone: 'success' });
    });
  };

  const onClick = (event: ReactMouseEvent<HTMLAnchorElement>): void => {
    if (consumeDragClick()) {
      event.preventDefault();
      return;
    }
    if (event.button !== 0 || event.altKey) return;
    if (event.shiftKey) {
      event.preventDefault();
      selectRange(event.currentTarget, id, current);
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      toggleRow(event.currentTarget, id, current);
      return;
    }
    event.preventDefault();
    clearTreeSelection(id);
    onNavigate?.();
    navigate(paths.page(id));
  };

  // One stop in the tab order for the whole tree: the arrows walk it (as a file tree does), the menu key opens a row's menu.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLAnchorElement>): void => {
    const links = treeLinks(event.currentTarget);
    const at = links.indexOf(event.currentTarget);
    const mod = event.metaKey || event.ctrlKey;
    const take = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    const focus = (link: HTMLAnchorElement | undefined): void => {
      if (!link) return;
      event.preventDefault();
      link.focus();
    };
    const vertical = event.key === 'ArrowDown' || event.key === 'ArrowUp';
    if (vertical && mod && event.shiftKey) {
      // The page (or the pages chosen with it) one step up or down among its siblings.
      take();
      const ids = subjectsOf(id);
      const drop = nudgeDrop(ids, event.key === 'ArrowUp' ? -1 : 1);
      if (drop) movePages(ids, drop);
      requestAnimationFrame(() => event.currentTarget?.isConnected && event.currentTarget.focus());
    } else if (vertical && event.shiftKey) {
      // The range grows (or shrinks) with the focus, from where it started.
      const next = links[at + (event.key === 'ArrowDown' ? 1 : -1)];
      if (!next) return;
      take();
      const { treeSelected } = usePagesUiStore.getState();
      if (treeSelected.size === 0) selectTreePages([id], id);
      next.focus();
      selectRange(next, next.dataset.treeLink!, current);
    } else if (event.key === 'ArrowDown') focus(links[at + 1]);
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
    } else if (event.key === '*') {
      // Every sibling with sub-pages opens (a tree's own key).
      take();
      const { blocks } = useBlocksStore.getState();
      expandAll(childPagesOf(useBlocksStore.getState(), containingPage(blocks, id)));
    } else if (event.key === ' ' && !mod) {
      take();
      toggleRow(event.currentTarget, id, current);
    } else if (mod && !event.shiftKey && event.key.toLowerCase() === 'a') {
      take();
      const shown = links.map(link => link.dataset.treeLink!);
      selectTreePages(shown, shown[0] ?? null);
    } else if (mod && !event.shiftKey && event.key.toLowerCase() === 'd') {
      take();
      const copies = duplicateChosen(subjectsOf(id));
      if (copies.length > 1) selectTreePages(copies, copies[0] ?? null);
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && !event.shiftKey) {
      take();
      // The focus goes on to the row after the pages leaving (or before them, at the end).
      const ids = subjectsOf(id);
      const after = links.slice(at + 1).find(link => !ids.includes(link.dataset.treeLink!)) ?? links.slice(0, at).reverse().find(link => !ids.includes(link.dataset.treeLink!));
      trashChosen(ids);
      requestAnimationFrame(() => after?.isConnected && after.focus());
    } else if (event.key === 'Escape' && usePagesUiStore.getState().treeSelected.size > 0) {
      take();
      clearTreeSelection(id);
    } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      openMenu();
    }
  };

  const movedTo = (ids: readonly string[], target: string | null): void => {
    const where = target ? useBlocksStore.getState().blocks[target]?.text.trim() || t(UNTITLED_PAGE) : null;
    const message =
      ids.length > 1
        ? where
          ? t('{pages} moved to {page}', { pages: plural(ids.length, 'page'), page: where })
          : t('{pages} moved to the top level', { pages: plural(ids.length, 'page') })
        : where
          ? t('Page moved to {page}', { page: where })
          : t('Page moved to the top level');
    moveChosen(ids, { into: target }, message);
  };

  return (
    <li role="treeitem" aria-expanded={children.length > 0 ? open : undefined} aria-level={depth + 1} aria-selected={chosen || current === id} data-motion={id}>
      <div
        className={styles.row}
        data-tree-page={id}
        data-current={current === id || undefined}
        data-chosen={chosen || undefined}
        data-menu={menu !== null || undefined}
        data-parent={children.length > 0 || undefined}
        style={{ '--tree-pad': `${4 + depth * TREE_INDENT}px` } as CSSProperties}
        onContextMenu={event => {
          event.preventDefault();
          openMenu();
        }}
      >
        <button
          type="button"
          className={styles.chevron}
          data-open={open || undefined}
          data-empty={children.length === 0 || undefined}
          aria-label={open ? t('Collapse {title}', { title }) : t('Expand {title}', { title })}
          tabIndex={-1}
          onClick={() => setExpanded(id, !expanded)}
        >
          <Icon name="chevronRight" size={14} />
        </button>
        <a
          href={browserPath(paths.page(id))}
          className={styles.link}
          data-tree-link={id}
          tabIndex={tabStop ? 0 : -1}
          aria-current={current === id ? 'page' : undefined}
          // The browser's own drag of a link would take the gesture over.
          draggable={false}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onClick={onClick}
        >
          <span className={styles.icon}>
            <PageIcon icon={page.icon} />
          </span>
          <span className={styles.title}>{title}</span>
          {page.locked ? (
            <span className={styles.locked}>
              <Icon name="lock" size={16} />
              <span className="sr-only">{t('Protected by a password')}</span>
            </span>
          ) : null}
        </a>
        <span className={styles.actions}>
          <button ref={more} type="button" className={styles.action} tabIndex={-1} {...pebbleUnder(0)} aria-label={t('More actions for {title}', { title })} aria-haspopup="menu" aria-expanded={menu !== null} data-tip={t('More actions')} onClick={openMenu}>
            <Icon name="more" size={18} />
          </button>
          <button type="button" className={`${styles.action} ${styles.addAction}`} tabIndex={-1} {...pebbleUnder(1)} aria-label={t('Add a sub-page to {title}', { title })} data-tip={t('Add a sub-page')} onClick={() => openNewPage(id)}>
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
      <Menu open={menu !== null} anchor={more} onDismiss={() => setMenu(null)} items={items} label={many ? t('Actions for {pages}', { pages: plural(menu.length, 'page') }) : t('Actions for {title}', { title })} />
      <MovePageDialog
        open={moving !== null}
        current={containingPage(useBlocksStore.getState().blocks, moving?.[0] ?? id)}
        exclude={other => (moving ?? [id]).some(page => other === page || isWithin(useBlocksStore.getState().blocks, other, page))}
        onDismiss={() => setMoving(null)}
        onPick={target => movedTo(moving ?? [id], target)}
        onTop={() => movedTo(moving ?? [id], null)}
      />
    </li>
  );
});

/** The rows the tree shows, in order (each page, then an open one's sub-pages): read so the tree's holder renders when they change, and its rows move. */
function useShownRows(): string {
  const expanded = usePagesUiStore(s => s.expanded);
  return useBlocksStore(s => {
    const rows: string[] = [];
    const walk = (parent: string | null): void => {
      for (const id of childPagesOf(s, parent)) {
        rows.push(id);
        if (expanded.has(id)) walk(id);
      }
    };
    walk(null);
    return rows.join(',');
  });
}

export function PagesSection({ route, onNavigate }: { route: Route; onNavigate?: () => void }) {
  const roots = useChildPages(null);
  const current = route.name === 'page' ? route.id : null;
  const tree = useRef<HTMLUListElement>(null);
  // A page sent to the bin (or moved, or folded away) fades where it was, the rows under it close ranks; one arriving settles in once they have made room.
  useShownRows();
  useListMotion(tree, { late: true });

  // The page on screen shows in the tree: every page above it opens. Another page opened lets the chosen ones go.
  useEffect(() => {
    clearTreeSelection(current);
    if (!current) return;
    expandAll(ancestorPages(useBlocksStore.getState().blocks, current).map(page => page.id));
  }, [current]);

  // Pages chosen together stay chosen until a press lands elsewhere than on the tree or what it opened (a menu, a dialog).
  const choosing = usePagesUiStore(s => s.treeSelected.size > 0);
  useEffect(() => {
    if (!choosing) return;
    const press = (event: PointerEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('[role="tree"], #overlays, #live')) return;
      clearTreeSelection(usePagesUiStore.getState().treeAnchor);
    };
    document.addEventListener('pointerdown', press, true);
    return () => document.removeEventListener('pointerdown', press, true);
  }, [choosing]);

  return (
    <>
      {roots.length > 0 ? (
        <ul ref={tree} role="tree" aria-label={t('Pages')} aria-multiselectable="true" className={styles.tree} data-page-tree="">
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
        <span className={navStyles.itemName}>{t('New page')}</span>
      </button>
    </>
  );
}
