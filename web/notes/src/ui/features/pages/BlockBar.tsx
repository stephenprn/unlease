/**
 * Under a finger on a phone-sized window, the block holding the caret is acted on from a bar that
 * stands on the on-screen keyboard, centred, away from the screen's edges (where the system's back
 * gesture lives): a block under it, out of or into the item above, up, down, and its menu. The
 * gutter is the pointer's; a finger never sees it.
 */
import { useEffect, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';

import { useLibraryStore } from '../../../app/store/library';
import { indentBlocks, insertAfter, nudgeBlocks, outdentBlocks } from '../../../app/store/pages';
import { IconButton } from '../../components/IconButton';
import { BlockMenu } from './BlockMenu';
import { caretOf } from './editing';
import { editorRoot, flushAll, focusBlock, richHandle, selectableOutline, selectBlocks, setMenu, useEditorStore } from './editorStore';
import { usePageContext } from './PageContext';
import styles from './pages.module.css';

/** Where the bar takes the gutter's place (the stylesheet hides the gutter on the same terms). */
export const TOUCH_BAR = '(max-width: 719px) and (pointer: coarse)';

/** Leaving one block for another, the focus is nowhere for a moment: the bar waits this long before it goes. */
const LEAVE_MS = 120;
/** Its distance from the keyboard (or the window's foot). */
const LIFT = 12;

/** How much of the window's foot the on-screen keyboard covers (none while pinch-zoomed). */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const update = (): void => setInset(view.scale > 1.01 ? 0 : Math.max(0, Math.round(window.innerHeight - view.height - view.offsetTop)));
    update();
    view.addEventListener('resize', update);
    view.addEventListener('scroll', update);
    return () => {
      view.removeEventListener('resize', update);
      view.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

/** The block the caret is in, if any (the title is not a block). */
function useCaretBlock(): string | null {
  const [block, setBlock] = useState<string | null>(null);
  useEffect(() => {
    const root = editorRoot();
    if (!root) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = (): void => {
      const active = document.activeElement;
      const holder = active instanceof HTMLElement && root.contains(active) ? active.closest<HTMLElement>('[data-select-block]') : null;
      setBlock(holder?.dataset.selectBlock ?? null);
    };
    const onIn = (): void => {
      if (timer) clearTimeout(timer);
      timer = null;
      read();
    };
    const onOut = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(read, LEAVE_MS);
    };
    root.addEventListener('focusin', onIn);
    root.addEventListener('focusout', onOut);
    return () => {
      if (timer) clearTimeout(timer);
      root.removeEventListener('focusin', onIn);
      root.removeEventListener('focusout', onOut);
    };
  }, []);
  return block;
}

export function BlockBar() {
  const { page } = usePageContext();
  const caretBlock = useCaretBlock();
  const inset = useKeyboardInset();
  const typingMenu = useEditorStore(s => s.menu !== null);
  // The block the menu was last opened for: it stays selected (and the bar with it) while its menu and what it opens are in use.
  const [held, setHeld] = useState<string | null>(null);
  const [menu, setMenuOpen] = useState<{ readonly inset: number } | null>(null);
  const heldSelected = useEditorStore(s => held !== null && s.selected.has(held));
  const more = useRef<HTMLButtonElement>(null);
  const id = caretBlock ?? (heldSelected ? held : null);
  const block = useLibraryStore(s => (id ? s.blocks[id] : undefined));
  const heldBlock = useLibraryStore(s => (held ? s.blocks[held] : undefined));
  const shown = block !== undefined && (menu !== null || !typingMenu);

  /** Moves the block, then puts the caret back where it was in it. */
  const move = (act: (blockId: string, caret: number) => boolean): void => {
    if (!block) return;
    const handle = richHandle(block.id);
    const caret = handle ? caretOf(handle).start : null;
    flushAll();
    if (act(block.id, caret ?? 0)) focusBlock(block.id, caret ?? 'end');
  };

  return (
    <>
      {/* The stage casts the bar's lift along its organic outline. */}
      <div className={styles.blockBarStage}>
        <div
          className={styles.blockBar}
          data-outline="menu"
          data-edge
          data-hidden={!shown || undefined}
          role="toolbar"
          aria-label={t('Actions du bloc')}
          // While its menu is open it holds still, wherever the keyboard goes.
          style={{ bottom: (menu?.inset ?? inset) + LIFT }}
          // A press here keeps the caret, and so the keyboard, in the text.
          onPointerDown={event => event.preventDefault()}
        >
          <IconButton
            icon="plus"
            label={t('Ajouter un bloc')}
            onClick={() => {
              if (!block) return;
              flushAll();
              const added = insertAfter(page, block.id, { kind: 'text', text: '/' });
              if (!added) return;
              setMenu({ kind: 'slash', block: added, start: 0, query: '' });
              focusBlock(added, 1);
            }}
          />
          <IconButton icon="outdent" label={t('Désimbriquer le bloc')} shape={1} onClick={() => move((blockId, caret) => outdentBlocks(page, [blockId], [blockId], { block: blockId, offset: caret }))} />
          <IconButton icon="indent" label={t('Imbriquer le bloc')} shape={2} onClick={() => move((blockId, caret) => indentBlocks(page, [blockId], [blockId], { block: blockId, offset: caret }))} />
          <IconButton icon="arrowUp" label={t('Monter le bloc')} onClick={() => move(blockId => nudgeBlocks(page, [blockId], -1, selectableOutline()))} />
          <IconButton icon="arrowDown" label={t('Descendre le bloc')} shape={1} onClick={() => move(blockId => nudgeBlocks(page, [blockId], 1, selectableOutline()))} />
          <IconButton
            ref={more}
            icon="more"
            label={t('Plus d’actions sur le bloc')}
            shape={2}
            hasPopup="menu"
            expanded={menu !== null}
            onClick={() => {
              if (!block) return;
              flushAll();
              selectBlocks([block.id]);
              setHeld(block.id);
              setMenuOpen({ inset });
            }}
          />
        </div>
      </div>
      {heldBlock ? <BlockMenu open={menu !== null} anchor={more} block={heldBlock} onDismiss={() => setMenuOpen(null)} /> : null}
    </>
  );
}
