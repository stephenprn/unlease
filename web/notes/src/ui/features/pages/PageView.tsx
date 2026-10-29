/**
 * A page, edited in place: where it sits (its breadcrumb), when it last changed and its menu, its
 * emoji and its title, then its blocks. A press under the last block writes there. Échap in a
 * block, a press on a block's grip, or a box dragged from the page's empty space selects whole
 * blocks; with blocks selected the keys and the clipboard act on them. Files dropped on the page become pictures, videos, PDFs or files where
 * they land. Opened at `#block-<id>` (from a search), it shows that block. A page in the bin reads
 * as it is and can be restored.
 */
import { memo, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE, type Block } from '@unlease/notes/models/blocks';
import { ancestorPages, isInBin } from '@unlease/notes/services/blocks';
import { formatEdited, plural } from '@unlease/core/services/format';
import { blocksFromText } from '@unlease/notes/services/pageText';

import { useMinute } from '../../../app/hooks/useMinute';
import { pageEdited } from '../../../app/hooks/usePages';
import { useLibraryStore } from '../../../app/store/library';
import { deleteBlocks, deletePageForever, insertBlock, insertDrafts, restorePage, saveBlockText, setPageIcon, splitTitle } from '../../../app/store/pages';
import { rememberPage, takeTitleFocus } from '../../../app/store/pagesUi';
import { showSnack, showUndo } from '../../../app/store/ui';
import { onBeforePause } from '../../../app/sync/loop';
import { Button } from '../../components/Button';
import { Confirm } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { Menu, type MenuItem } from '../../components/Menu';
import { Link, navigate, paths, useLocation } from '../../router';
import { useMedia } from '../../useMedia';
import { BlockBar, TOUCH_BAR } from './BlockBar';
import { BlockList } from './BlockView';
import { readBlocks, htmlToDrafts, writeBlocks } from './clipboard';
import { historyKey, selectionKey } from './editing';
import { DateEditor, openDateEditor } from './DateEditor';
import { applyPendingFocus, clearBlockSelection, closeEditor, editableOutline, editorState, flushAll, focusBlock, openEditor, registerFlusher, registerFocuser, selectableOutline, selectBlocks, type FocusAt } from './editorStore';
import { EmojiButton } from './EmojiPicker';
import { FormatBar } from './FormatBar';
import { HoverBar } from './HoverBar';
import { InlineEmojiPicker } from './InlineEmoji';
import { selectWithBox } from './marquee';
import { EditorMenus } from './Menus';
import { PageContext } from './PageContext';
import { PageMenu } from './PageMenu';
import { isPrivatePage } from '@unlease/notes/services/pagesAsk';
import { closePagesAsk, openPagesAsk, usePagesAskSettings, usePagesAskStore } from '../../../app/pagesAsk';
import styles from './pages.module.css';
import { pasteFiles } from './pasting';
import { atomOffset, selectionOffsets } from './richDom';
import { showBlock } from './showBlock';
import { openTarget } from './TargetBlock';

const SAVE_DELAY_MS = 350;

const Crumb = memo(function Crumb({ id }: { id: string }) {
  const page = useLibraryStore(s => s.blocks[id]);
  if (!page) return null;
  return (
    <span className={styles.crumb}>
      <Link to={paths.page(id)} className={styles.crumbLink}>
        {page.icon ? <span className={styles.emoji}>{page.icon}</span> : null}
        <span className={styles.crumbTitle}>{page.text.trim() || t(UNTITLED_PAGE)}</span>
      </Link>
      <Icon name="chevronRight" size={14} />
    </span>
  );
});

/** The pages folded into "…": a menu of them, each with its emoji, nearest the root first. */
function FoldedCrumbs({ ids }: { ids: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const blocks = useLibraryStore(useShallow(s => ids.map(id => s.blocks[id])));
  const items: MenuItem[] = blocks.flatMap(page =>
    page
      ? [
          {
            label: page.text.trim() || t(UNTITLED_PAGE),
            icon: 'page' as const,
            mark: page.icon ? <span className={styles.crumbMenuEmoji}>{page.icon}</span> : undefined,
            onSelect: () => navigate(paths.page(page.id)),
          },
        ]
      : [],
  );
  return (
    <span className={styles.crumb}>
      <button ref={button} type="button" className={styles.crumbLink} aria-label={t('{pages} au-dessus', { pages: plural(ids.length, 'page') })} aria-haspopup="menu" aria-expanded={open} data-tip={t('Pages au-dessus')} onClick={() => setOpen(true)}>
        …
      </button>
      <Icon name="chevronRight" size={14} />
      <Menu open={open} anchor={button} onDismiss={() => setOpen(false)} items={items} label={t('Pages au-dessus')} align="start" />
    </span>
  );
}

/** The crumbs folded into "…": `trail.slice(from, to)`, none when `to <= from`. */
interface Fold {
  readonly from: number;
  readonly to: number;
}

const NO_FOLD: Fold = { from: 1, to: 1 };

/**
 * Where the page sits, on one line: the root page, then the pages under it down to this one's
 * parent. When they do not fit, the ones after the root fold into "…", oldest first, so the root
 * and the nearest parents stay in view; on a narrow window the root folds last, and the parent's
 * title, too long even then, is cut short.
 */
const Breadcrumb = memo(function Breadcrumb({ id }: { id: string }) {
  const trail = useLibraryStore(useShallow(s => ancestorPages(s.blocks, id).map(page => page.id)));
  const nav = useRef<HTMLElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [fold, setFold] = useState<Fold>(NO_FOLD);

  useLayoutEffect(() => {
    const room = nav.current;
    const row = measure.current;
    if (!room || !row) return;
    const fit = (): void => {
      // The measuring row holds every crumb at its own width, then "…".
      const widths = [...row.children].map(child => child.getBoundingClientRect().width);
      const more = widths.pop() ?? 0;
      const available = room.clientWidth;
      let total = widths.reduce((sum, width) => sum + width, 0);
      if (total <= available) {
        setFold(current => (current.to > current.from ? NO_FOLD : current));
        return;
      }
      total += more;
      // Keep the root and the parent: fold what lies between, from the root down; then the root.
      let to = 1;
      while (to < widths.length - 1 && total > available) {
        total -= widths[to]!;
        to += 1;
      }
      const from = total > available && widths.length > 1 ? 0 : 1;
      setFold(current => (current.from === from && current.to === to ? current : { from, to }));
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(room);
    observer.observe(row);
    return () => observer.disconnect();
  }, [trail]);

  if (trail.length === 0) return null;
  const folded = fold.to > fold.from ? trail.slice(fold.from, fold.to) : [];
  return (
    <nav ref={nav} className={styles.breadcrumb} aria-label={t('Pages au-dessus')}>
      {/* Every crumb at its own width, out of sight: what the line can hold is read from it. */}
      <span ref={measure} className={styles.crumbMeasure} aria-hidden="true" inert>
        {trail.map(pageId => (
          <Crumb key={pageId} id={pageId} />
        ))}
        <span className={styles.crumb}>
          <span className={styles.crumbLink}>…</span>
          <Icon name="chevronRight" size={14} />
        </span>
      </span>
      {trail.slice(0, fold.from).map(pageId => (
        <Crumb key={pageId} id={pageId} />
      ))}
      {folded.length > 0 ? <FoldedCrumbs ids={folded} /> : null}
      {trail.slice(folded.length > 0 ? fold.to : fold.from).map(pageId => (
        <Crumb key={pageId} id={pageId} />
      ))}
    </nav>
  );
});

const Edited = memo(function Edited({ id }: { id: string }) {
  const edited = useLibraryStore(s => pageEdited(s, id));
  const now = useMinute();
  return <span className={`${styles.edited} t-meta`}>{formatEdited(edited, now)}</span>;
});

/** Over the head: where the page sits, when it last changed, and its menu (the phone's top bar holds that under 720px). */
function PageBar({ id, menu }: { id: string; menu: boolean }) {
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const kept = useLibraryStore(s => isPrivatePage(s.blocks, id));
  const ask = usePagesAskSettings() !== null && !kept;
  const asking = usePagesAskStore(s => s.open === id);
  return (
    <div className={styles.pageBar}>
      <Breadcrumb id={id} />
      <Edited id={id} />
      {menu ? (
        <>
          {ask ? <IconButton icon="sparkle" label={t('Demander à Claude')} className={styles.pageAsk} pressed={asking} onClick={() => (asking ? closePagesAsk() : openPagesAsk(id))} /> : null}
          <IconButton ref={more} icon="more" label={t('Plus d’actions')} className={styles.pageMore} hasPopup="menu" expanded={open} onClick={() => setOpen(true)} />
          <PageMenu id={id} open={open} anchor={more} onDismiss={() => setOpen(false)} />
        </>
      ) : null}
    </div>
  );
}

/**
 * Opened at `#block-<id>` (a search's result, on arrival or from this same page): the block is
 * brought to the middle of the window and wears the selection's wash a moment, then the address
 * loses its `#`, so Back and a reload are plain.
 */
function JumpToBlock({ page }: { page: string }) {
  const location = useLocation();
  useEffect(() => {
    const match = /^#block-(.+)$/.exec(window.location.hash);
    if (!match) return;
    let id = match[1]!;
    try {
      id = decodeURIComponent(id);
    } catch {
      // Typed by hand and malformed: taken as it is.
    }
    // Not drawn in a second, it is not here: the address is cleaned all the same.
    return showBlock(page, id, { done: () => history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}`) });
  }, [page, location]);
  return null;
}

/** The title: one line of plain text, saved as typed text; Entrée goes on in a new paragraph at the top of the page, ↓ into its first block. */
function PageTitle({ page, readOnly }: { page: Block; readOnly: boolean }) {
  const field = useRef<HTMLDivElement>(null);
  const shown = useRef<string | null>(null);
  const draft = useRef<{ since: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = (): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const node = field.current;
    if (!draft.current || !node) return;
    const since = draft.current.since;
    draft.current = null;
    const typed = (node.textContent ?? '').replace(/\n/g, ' ');
    shown.current = saveBlockText(page.id, page.id, since, typed);
  };
  const flushRef = useRef(flush);
  useLayoutEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => onBeforePause(() => flushRef.current()), []);
  // An undo saves what was typed here first, as it does a paragraph's.
  useEffect(() => registerFlusher(() => flushRef.current()), []);
  useEffect(() => () => flushRef.current(), []);

  // The stored title, shown when it changes from elsewhere.
  useLayoutEffect(() => {
    const node = field.current;
    if (!node || draft.current || shown.current === page.text) return;
    node.textContent = page.text;
    shown.current = page.text;
  }, [page.text]);

  useLayoutEffect(() => {
    const off = registerFocuser(page.id, (at: FocusAt) => {
      const node = field.current;
      if (!node) return;
      node.focus({ preventScroll: true });
      const selection = window.getSelection();
      const text = node.firstChild;
      const length = node.textContent?.length ?? 0;
      const offset = typeof at === 'number' ? Math.min(at, length) : at === 'start' ? 0 : length;
      if (text) selection?.setBaseAndExtent(text, offset, text, offset);
      else selection?.setBaseAndExtent(node, 0, node, 0);
    });
    applyPendingFocus();
    return off;
  }, [page.id]);

  // A page just made opens with its title ready to type.
  useEffect(() => {
    if (takeTitleFocus(page.id)) focusBlock(page.id, 'end');
  }, [page.id]);

  /** Into the page's first block, made when there is none. */
  const intoBody = (): void => {
    flush();
    const first = editableOutline().find(id => id !== page.id);
    if (first) focusBlock(first, 'start');
    else focusBlock(insertBlock(page.id, page.id, 0, { kind: 'text', text: '' }), 'start');
  };

  /** What follows the caret goes on in a paragraph at the top of the page, which takes the caret. */
  const splitHere = (): void => {
    const node = field.current;
    if (!node) return;
    flush();
    const value = (node.textContent ?? '').replace(/\n/g, ' ');
    const caret = selectionOffsets(node) ?? { start: value.length, end: value.length };
    focusBlock(splitTitle(page.id, value.slice(0, caret.start), value.slice(caret.end)), 'start');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (historyKey(event, page.id)) return;
    if (event.key === 'Enter') {
      // Entrée that ends a composition (accents, an input method) only ends it.
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      splitHere();
    } else if (event.key === 'ArrowDown') {
      const selection = window.getSelection();
      if (selection?.isCollapsed && selection.focusOffset === (field.current?.textContent?.length ?? 0)) {
        event.preventDefault();
        intoBody();
      }
    }
  };

  return (
    <h1
      ref={field}
      className={styles.title}
      contentEditable={readOnly ? false : 'plaintext-only'}
      suppressContentEditableWarning
      role="textbox"
      aria-label={t('Titre de la page')}
      data-placeholder={t(UNTITLED_PAGE)}
      data-caret-block={page.id}
      data-page-title=""
      spellCheck
      onInput={() => {
        const node = field.current;
        if (!node) return;
        // An emptied title holds a `<br>` the placeholder would hide behind.
        if (!node.textContent) node.replaceChildren();
        if (!draft.current) draft.current = { since: shown.current ?? page.text };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
      }}
      onBlur={flush}
      onKeyDown={onKeyDown}
      onPaste={event => {
        event.preventDefault();
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain').replace(/\s*\n\s*/g, ' '));
      }}
    />
  );
}

/** Under the last block: a press writes there (in the last block when it is an empty paragraph, else in a new one). */
function Tail({ page, readOnly }: { page: string; readOnly: boolean }) {
  return (
    <div
      className={styles.tail}
      data-drop-tail={page}
      onClick={() => {
        if (readOnly) return;
        const { blocks, blocksByParent } = useLibraryStore.getState();
        const ids = blocksByParent[page] ?? [];
        const last = ids[ids.length - 1];
        if (last && blocks[last]?.kind === 'text' && blocks[last]!.text === '') focusBlock(last, 'start');
        else focusBlock(insertBlock(page, page, ids.length, { kind: 'text', text: '' }), 'start');
      }}
    />
  );
}

function BinBanner({ id }: { id: string }) {
  const [confirm, setConfirm] = useState(false);
  const own = useLibraryStore(s => s.blocks[id]?.trashedAt !== null);
  return (
    <div className={styles.binBanner} data-outline="panel">
      <p className="t-meta">{own ? t('Cette page est dans la corbeille : elle ne peut pas être modifiée.') : t('Une page au-dessus de celle-ci est dans la corbeille.')}</p>
      {own ? (
        <span className={styles.binActions}>
          <Button kind="tonal" small icon="restore" onClick={() => showUndo(t('Page restaurée'), restorePage(id))}>
            {t('Restaurer')}
          </Button>
          <Button kind="text" small onClick={() => setConfirm(true)}>
            {t('Supprimer définitivement')}
          </Button>
        </span>
      ) : null}
      <Confirm
        open={confirm}
        title={t('Supprimer définitivement ?')}
        message={t('Cette page disparaîtra de tous vos appareils, avec tout ce qu’elle contient.')}
        confirmLabel={t('Supprimer')}
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          deletePageForever([id]);
          navigate(paths.pages, { replace: true });
          showSnack(t('Page supprimée définitivement'), undefined, { tone: 'success' });
        }}
      />
    </div>
  );
}

/**
 * Words selected by dragging, carried past their block into another: from there it selects whole
 * blocks, as Notion does (a browser keeps a text selection inside one editable).
 */
function selectByDragging(event: PointerEvent, root: HTMLElement): void {
  if (event.button !== 0 || event.shiftKey || event.pointerType === 'touch') return;
  const start = (event.target as Element).closest('[data-rich-block]')?.closest<HTMLElement>('[data-select-block]');
  if (!start) return;
  const from = start.dataset.selectBlock!;
  let selecting = false;
  const move = (moved: PointerEvent): void => {
    const over = document.elementFromPoint(moved.clientX, moved.clientY)?.closest<HTMLElement>('[data-select-block]');
    if (!over || !root.contains(over)) return;
    if (!selecting && (over === start || over.contains(start) || start.contains(over))) return;
    const outline = selectableOutline();
    const [a, b] = [outline.indexOf(from), outline.indexOf(over.dataset.selectBlock!)].sort((x, y) => x - y) as [number, number];
    if (a < 0) return;
    if (!selecting) {
      selecting = true;
      root.dataset.selecting = '';
      flushAll();
    }
    window.getSelection()?.removeAllRanges();
    selectBlocks(outline.slice(a, b + 1), from);
  };
  const up = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    window.removeEventListener('dragstart', up);
    if (!selecting) return;
    delete root.dataset.selecting;
    window.getSelection()?.removeAllRanges();
    root.focus({ preventScroll: true });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  // Dragging the selected words away ends with a cancel, not an up: the watch stops there too.
  window.addEventListener('pointercancel', up);
  window.addEventListener('dragstart', up);
}

/** `menu`: « Plus d’actions » in the page's head (false when the phone's top bar holds it). */
export function PageView({ id, menu = true }: { id: string; menu?: boolean }) {
  const page = useLibraryStore(s => s.blocks[id]);
  const binned = useLibraryStore(s => isInBin(s.blocks, id));
  const touch = useMedia(TOUCH_BAR);
  const [dropping, setDropping] = useState(false);
  const article = useRef<HTMLElement>(null);
  const drawn = page?.kind === 'page' && page.deletedAt === null;

  useEffect(() => {
    openEditor(id);
    rememberPage(id);
    return () => {
      flushAll();
      closeEditor(id);
    };
  }, [id]);

  useEffect(() => (drawn && !binned && article.current ? selectWithBox(article.current) : undefined), [drawn, binned]);

  if (!page || page.deletedAt !== null || page.kind !== 'page') return null;
  const readOnly = binned;

  const selectedIds = (): string[] => {
    const { selected } = editorState();
    return selectableOutline().filter(blockId => selected.has(blockId));
  };

  // Only keys pressed while the page itself has the focus (blocks selected): a block's own keys bubble here too.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return;
    if (editorState().selected.size > 0) selectionKey(event, id);
    else historyKey(event, id);
  };
  const onCopy = (event: ClipboardEvent<HTMLDivElement>, cut: boolean): void => {
    const ids = selectedIds();
    if (ids.length === 0 || event.target !== event.currentTarget) return;
    event.preventDefault();
    writeBlocks(ids, event.clipboardData);
    if (cut && !readOnly) {
      deleteBlocks(id, ids);
      clearBlockSelection();
    }
  };
  const onPaste = (event: ClipboardEvent<HTMLDivElement>): void => {
    const ids = selectedIds();
    const last = ids[ids.length - 1];
    if (!last || readOnly || event.target !== event.currentTarget) return;
    event.preventDefault();
    const data = event.clipboardData;
    const drafts = readBlocks(data) ?? (data.getData('text/html') ? htmlToDrafts(data.getData('text/html')) : blocksFromText(data.getData('text/plain')));
    const made = insertDrafts(id, drafts, { afterId: last });
    clearBlockSelection();
    const end = made[made.length - 1];
    if (end) focusBlock(end, 'end');
  };
  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    // A mention opens what it names (a page here, the rest in a new tab).
    const chip = (event.target as Element).closest<HTMLElement>('[data-mention]');
    const [type, target] = chip?.dataset.mention?.split(':') ?? [];
    if ((type === 'note' || type === 'link' || type === 'page') && target) {
      flushAll();
      openTarget(event, { type, id: target });
      return;
    }
    // A date opens its editor.
    const date = readOnly ? null : (event.target as Element).closest<HTMLElement>('[data-date]');
    const rich = date?.closest<HTMLElement>('[data-rich-block]');
    if (date && rich) openDateEditor(rich.dataset.richBlock!, atomOffset(rich, date));
  };
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    setDropping(false);
    const files = [...event.dataTransfer.files];
    if (readOnly || files.length === 0 || event.defaultPrevented) return;
    event.preventDefault();
    const over = (event.target as Element).closest<HTMLElement>('[data-select-block]')?.dataset.selectBlock;
    const ids = useLibraryStore.getState().blocksByParent[id] ?? [];
    const anchor = over ?? ids[ids.length - 1];
    const block = anchor ? useLibraryStore.getState().blocks[anchor] : undefined;
    if (block) void pasteFiles(id, block, files, block.kind === 'text' && block.text === '');
    else {
      const first = insertBlock(id, id, 0, { kind: 'text', text: '' });
      const created = useLibraryStore.getState().blocks[first];
      if (created) void pasteFiles(id, created, files, true);
    }
  };

  return (
    <PageContext.Provider value={{ page: id, readOnly }}>
      <article ref={article} className={styles.page} aria-label={page.text.trim() || t(UNTITLED_PAGE)}>
        {binned ? <BinBanner id={id} /> : null}
        <PageBar id={id} menu={menu && !readOnly} />
        <div
          className={styles.editor}
          data-page-editor=""
          data-dropping={dropping || undefined}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          onCopy={event => onCopy(event, false)}
          onCut={event => onCopy(event, true)}
          onPaste={onPaste}
          onClick={onClick}
          onPointerDown={event => {
            // A press in a block's menu (drawn elsewhere, in a portal) is not a press on the page.
            if (!event.currentTarget.contains(event.target as Node)) return;
            if (!(event.target as Element).closest('[data-gutter]')) clearBlockSelection();
            selectByDragging(event.nativeEvent, event.currentTarget);
          }}
          onDragOver={event => {
            if (readOnly || ![...event.dataTransfer.types].includes('Files')) return;
            event.preventDefault();
            setDropping(true);
          }}
          onDragLeave={event => {
            if (event.currentTarget === event.target) setDropping(false);
          }}
          onDrop={onDrop}
        >
          <header className={styles.head}>
            {page.icon ? (
              <EmojiButton value={page.icon} label={t('Changer l’icône de la page')} disabled={readOnly} onChange={icon => setPageIcon(id, icon)} className={styles.pageIcon} />
            ) : readOnly ? null : (
              <EmojiButton value={null} label={t('Ajouter une icône')} onChange={icon => setPageIcon(id, icon)} className={styles.addIcon}>
                <Icon name="smiley" size={18} />
                {t('Ajouter une icône')}
              </EmojiButton>
            )}
            <PageTitle page={page} readOnly={readOnly} />
          </header>
          <div className={styles.blocks}>
            <BlockList parentId={id} depth={0} />
          </div>
          <Tail page={id} readOnly={readOnly} />
        </div>
        {readOnly ? null : (
          <>
            <EditorMenus />
            <FormatBar />
            <HoverBar />
            <DateEditor />
            <InlineEmojiPicker />
            {touch ? <BlockBar /> : null}
          </>
        )}
        <JumpToBlock page={id} />
      </article>
    </PageContext.Provider>
  );
}
